import { useCallback, useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { advanceTournament, enterTournament, getTournament, type TournamentView } from '@/lib/tournament.functions';
import { blindLevelFor, buildLeaderboard, nextBlindLevel, timeRemainingInLevel } from '@/poker/tournament';
import { errorMessage } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { useTableSounds } from '@/hooks/useTableSounds';
import type { Action } from '@/poker/types';
import { legalActions } from '@/poker/engine';
import { TOURNAMENT_BUY_IN } from '@/poker/tournament-session';

export function useTournament(me: { id: string; name: string; avatarUrl: string | null; avatarEmoji: string }) {
  const getFn = useServerFn(getTournament);
  const enterFn = useServerFn(enterTournament);
  const advanceFn = useServerFn(advanceTournament);
  const { refreshPlayer } = useAuth();
  const [view, setView] = useState<TournamentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enteredToday, setEnteredToday] = useState(false);
  const [balance, setBalance] = useState(0);
  const [resetsAt, setResetsAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [dueAt, setDueAt] = useState(0);
  const [nonce, setNonce] = useState(0);
  const inFlight = useRef(false);
  const applyView = useCallback((next: TournamentView) => {
    setView((previous) => previous?.entryId === next.entryId && previous.version > next.version ? previous : next);
    setDueAt(Date.now() + next.msUntilNext);
  }, []);
  const reload = useCallback(async () => {
    setError(null);
    try {
      const result = await getFn();
      setEnteredToday(result.enteredToday);
      setBalance(result.balance);
      setResetsAt(result.resetsAt);
      if (result.view) applyView(result.view); else setView(null);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [getFn, applyView]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now());
      if (resetsAt && Date.now() >= Date.parse(resetsAt)) void reload();
    }, 1000);
    return () => clearInterval(timer);
  }, [resetsAt, reload]);
  useEffect(() => {
    if (!view || view.finished || busy) return;
    const timer = setTimeout(() => {
      if (inFlight.current) { setNonce((n) => n + 1); return; }
      inFlight.current = true;
      void advanceFn({ data: { entryId: view.entryId } })
        .then((next) => { applyView(next); if (next.finished) void refreshPlayer(); })
        .catch((err) => { setError(errorMessage(err)); setDueAt(Date.now() + 3000); })
        .finally(() => { inFlight.current = false; setNonce((n) => n + 1); });
    }, Math.max(0, dueAt - Date.now()) + 200);
    return () => clearTimeout(timer);
  }, [view, busy, dueAt, nonce, advanceFn, applyView, refreshPlayer]);
  // The server pays the prize into the wallet when the tournament ends; reload the balance whichever
  // path finished it (bot turn, the player's own action, or leaving) so the winnings show right away.
  const creditedEntry = useRef<string | null>(null);
  useEffect(() => {
    if (!view?.finished || creditedEntry.current === view.entryId) return;
    creditedEntry.current = view.entryId;
    if (view.prize > 0) setBalance((n) => n + view.prize);
    void refreshPlayer();
  }, [view, refreshPlayer]);
  const join = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const next = await enterFn(); applyView(next); setEnteredToday(true); setBalance((n) => n - TOURNAMENT_BUY_IN);
      await refreshPlayer();
      window.__lovableEvents?.track?.('project.tournament_entered', { players: 8, buy_in: TOURNAMENT_BUY_IN });
    } catch (err) { setError(errorMessage(err)); }
    finally { inFlight.current = false; setBusy(false); }
  }, [enterFn, applyView, refreshPlayer]);
  const leave = useCallback(async () => {
    if (!view) return true;
    setBusy(true); setError(null);
    try {
      if (!view.finished) applyView(await advanceFn({ data: { entryId: view.entryId, leave: true } }));
      setView(null); return true;
    } catch (err) { setError(errorMessage(err)); return false; }
    finally { setBusy(false); }
  }, [view, advanceFn, applyView]);
  const act = useCallback((action: Action) => {
    if (!view || inFlight.current) return;
    inFlight.current = true;
    void advanceFn({ data: { entryId: view.entryId, action } }).then(applyView)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => { inFlight.current = false; setNonce((n) => n + 1); });
  }, [view, advanceFn, applyView]);
  const table = view?.table ?? null;
  useTableSounds(table ?? { seats: [], hand: null, handCount: 0, dealer: 0, config: { smallBlind: 0, bigBlind: 0, minBuyIn: 0, maxBuyIn: 0 } }, !!view && !view.finished);
  const elapsedSec = view ? Math.max(0, Math.floor((clock - Date.parse(view.startedAt)) / 1000)) : 0;
  const meIndex = table?.seats.findIndex((seat) => seat?.isMe) ?? -1;
  return {
    active: !!view && !view.finished, table, level: blindLevelFor(elapsedSec), elapsedSec,
    nextLevel: nextBlindLevel(elapsedSec), timeInLevel: timeRemainingInLevel(elapsedSec),
    leaderboard: table ? buildLeaderboard(table) : [], finished: view?.finished ?? false,
    finalPosition: view?.finalPosition ?? null, prize: view?.prize ?? 0, meIndex,
    legal: table && meIndex >= 0 ? legalActions(table, meIndex) : null,
    join, leave, act, loading, busy, error, enteredToday, balance, resetsAt, reload,
  };
}
