import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WinSparkles } from '@/components/common/WinSparkles';
import { Crown, LogOut, Timer, TrendingUp, Trophy, Users } from 'lucide-react';
import { ActionBar } from '@/components/poker/ActionBar';
import { ChatBox } from '@/components/poker/ChatBox';
import { HandResultPanel } from '@/components/poker/HandResultPanel';
import { PokerTable } from '@/components/poker/PokerTable';
import { useTournament } from '@/hooks/useTournament';
import { usePlayerChat } from '@/hooks/usePlayerChat';
import { buildHandResult } from '@/poker/showdown';
import { useBotChat } from '@/hooks/useBotChat';
import { dealerFor } from '@/poker/dealers';
import { TOURNAMENT_BUY_IN } from '@/poker/tournament-session';
import { formatChips, formatPeso } from '@/lib/format';
import type { Street, TableState } from '@/poker/types';

interface TournamentPagePlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarEmoji: string;
}

const STREET_LABELS: Record<Street, string> = {
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  complete: 'Showdown',
};

export function TournamentPage({ player, onLeave }: { player: TournamentPagePlayer; onLeave: () => void }) {
  const tournament = useTournament(player);
  const chat = usePlayerChat('tournament', player.id);
  const botMessages = useBotChat(tournament.table, tournament.active);
  const chatMessages = useMemo(() => [...chat.messages, ...botMessages].sort((a, b) => a.timestamp - b.timestamp), [chat.messages, botMessages]);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  if (tournament.loading) return <p className="py-12 text-center text-muted-foreground">Loading tournament…</p>;

  if (!tournament.active && (!tournament.table || tournament.enteredToday === false)) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 p-4 text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-gold-400/15 text-gold-300">
          <Trophy className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-foreground">Sit &amp; Go Tournament</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          8 players. Starting stack of {formatChips(3000)}. Blinds rise every 60 seconds.
          ₱1,000 champion · ₱500 1st runner-up · ₱200 2nd runner-up · ₱50 3rd runner-up.
        </p>
        <div className="mt-4 space-y-1.5 rounded-lg bg-black/20 p-3 text-left text-xs text-muted-foreground">
          <p className="flex justify-between"><span>Structure:</span><span className="text-slate-200">8 players, 3000 chips</span></p>
          <p className="flex justify-between"><span>Blinds:</span><span className="text-slate-200">10/20, rising every 60s</span></p>
          <p className="flex justify-between"><span>Entry fee:</span><span className="text-live">{formatPeso(TOURNAMENT_BUY_IN)} from your wallet</span></p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">One entry per day · Resets at midnight (Philippines). Leaving counts as a loss — you can play again the next day.</p>
        <p className="mt-2 text-sm text-foreground">Wallet: {formatPeso(tournament.balance)}</p>
        {tournament.error && <p role="alert" className="mt-3 text-sm text-destructive">{tournament.error}</p>}
        <Button variant="outline"
          type="button"
          disabled={tournament.busy || tournament.enteredToday || tournament.balance < TOURNAMENT_BUY_IN}
          onClick={() => void tournament.join()}
          className="mt-6 h-12 w-full rounded-lg bg-gradient-to-b from-gold-300 to-gold-500 py-3 text-sm font-bold text-slate-900 shadow-lg transition hover:brightness-110 active:scale-95"
        >
          {tournament.busy ? 'Joining…' : tournament.enteredToday ? 'Already joined today' : `Buy in ${formatPeso(TOURNAMENT_BUY_IN)} & Join`}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onLeave}
          className="mt-2 w-full rounded-lg border border-border py-2.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          Back to Lobby
        </Button>
        <ChatBox title="Tournament Chat" messages={chatMessages} onSend={chat.send} sending={chat.sending} error={chat.error} collapsed={chatCollapsed} onToggle={() => setChatCollapsed((v) => !v)} />
      </div>
    );
  }

  const { table, level, nextLevel, timeInLevel, leaderboard, finished, finalPosition, meIndex, legal, act, leave } = tournament;
  if (!table) return null;

  const hand = table.hand;
  const streetLabel = hand ? STREET_LABELS[hand.street] : STREET_LABELS.preflop;
  const isMyTurn = meIndex !== -1 && hand?.toAct === meIndex;
  const turnSeat = hand?.toAct != null ? table.seats[hand.toAct] : null;
  const waitingFor = turnSeat && !isMyTurn ? turnSeat.name : null;
  const turnKey = hand ? `${hand.number}-${hand.street}-${hand.toAct}-${hand.currentBet}` : 'idle';
  const aliveCount = leaderboard.filter((p) => p.stack > 0).length;
  const dealer = dealerFor('tournament');

  async function handleLeave() {
    if (!finished && !window.confirm('Leave the tournament? You will lose automatically, forfeit your ₱100 entrance fee, and can only play again tomorrow.')) return;
    if (await leave()) onLeave();
  }

  if (finished) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gold-400/15 text-gold-300">
          <Trophy className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {finalPosition === 2 ? '1st Runner-up!' : finalPosition === 3 ? '2nd Runner-up!' : finalPosition === 4 ? '3rd Runner-up!' : finalPosition === 1 ? 'Tournament Winner!' : finalPosition ? `Finished #${finalPosition}` : 'Entry forfeited'}
        </h1>
        {leaderboard[0] && leaderboard[0].stack > 0 && leaderboard.filter((p) => p.stack > 0).length === 1 && (
          <div className="animate-winner-banner relative flex flex-col items-center gap-1 rounded-xl border-2 border-gold-400/80 bg-black/70 px-8 py-3">
            <WinSparkles />
            <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.3em] text-gold-300">
              <Crown className="animate-winner-crown h-4 w-4" /> Champion <Crown className="animate-winner-crown h-4 w-4" />
            </span>
            <span className="winner-name-shine text-2xl font-black">{leaderboard[0].isMe ? 'You' : leaderboard[0].name}</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {finalPosition === 1
            ? 'You outlasted everyone. Your champion prize is ready!'
            : finalPosition === 2 ? 'Second place — your 1st runner-up prize is ready.' : finalPosition === 3 ? 'Third place — your 2nd runner-up prize is ready.' : finalPosition === 4 ? 'Fourth place — your 3rd runner-up prize is ready.' : finalPosition ? `You placed ${finalPosition} out of ${leaderboard.length}.` : 'This entry was forfeited.'}
        </p>
        {tournament.prize > 0 && <p className="text-xl font-bold text-live">+{formatPeso(tournament.prize)} credited to your wallet</p>}
        <p className="text-sm text-muted-foreground">Your next entry opens at midnight in the Philippines.</p>
        <div className="w-full max-w-md space-y-1.5 rounded-lg border border-border bg-slate-900/80 p-4">
          {leaderboard.map((p, i) => (
            <div key={p.id} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
              p.isMe ? 'bg-gold-400/10 text-gold-100' : 'text-slate-300'
            }`}>
              <span className="flex items-center gap-2">
                <span className="w-5 text-right text-xs tabular-nums text-slate-500">{i + 1}.</span>
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <span className="text-sm">{p.avatarEmoji}</span>
                )}
                <span className="font-medium">{p.isMe ? 'You' : p.name}</span>
                {i === 0 && <Crown className="h-3.5 w-3.5 text-gold-300" />}
              </span>
              <span className="tabular-nums text-emerald-300">{formatChips(p.stack)}</span>
            </div>
          ))}
        </div>
        <Button variant="outline"
          type="button"
          onClick={() => void handleLeave()}
          className="mt-2 rounded-lg bg-gradient-to-b from-gold-300 to-gold-500 px-6 py-2.5 text-sm font-bold text-slate-900"
        >
          Back to Lobby
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {tournament.error && <p role="alert" className="text-sm text-destructive">{tournament.error}</p>}
      {/* Tournament status bar */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg sm:flex sm:flex-wrap sm:justify-between border border-border bg-slate-900/80 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Trophy className="h-4 w-4 text-gold-300" />
          <span className="text-sm font-semibold text-foreground">Tournament</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" /> {aliveCount} left
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-slate-300">
            <Timer className="h-3 w-3 text-gold-300" />
            <span className="tabular-nums">{Math.floor(timeInLevel / 60)}:{String(timeInLevel % 60).padStart(2, '0')}</span>
          </span>
          <span className="flex items-center gap-1 text-slate-300">
            <TrendingUp className="h-3 w-3 text-emerald-300" />
            <span className="font-semibold tabular-nums">{level.smallBlind}/{level.bigBlind}</span>
          </span>
          {nextLevel && (
            <span className="hidden text-slate-500 sm:inline">next: {nextLevel.smallBlind}/{nextLevel.bigBlind}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-4">
        <section className="min-w-0 space-y-3">
          <div className="relative px-1 pb-3 pt-3 sm:px-12 sm:pt-20">
            
            <PokerTable table={table} meIndex={meIndex} dealer={dealer} streetLabel={streetLabel} />
          </div>

          <div className="mobile-action-dock">
          <ActionBar
            table={table as TableState}
            legal={isMyTurn ? legal : null}
            turnKey={turnKey}
            onAct={act}
            waitingFor={waitingFor}
          />
          </div>

          {hand?.street === 'complete' && <HandResultPanel result={buildHandResult(table)} />}
        </section>

        <aside className="flex flex-col gap-3">
          <div className="rounded-lg border border-border bg-slate-900/80 p-3">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Crown className="h-3.5 w-3.5 text-gold-300" /> Chip Counts
            </h2>
            <div className="space-y-1">
              {leaderboard.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs ${
                    p.stack === 0 ? 'opacity-40' : ''
                  } ${p.isMe ? 'bg-gold-400/10' : ''}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="w-3.5 text-right text-[10px] tabular-nums text-slate-500">{i + 1}</span>
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="text-xs">{p.avatarEmoji}</span>
                    )}
                    <span className={`truncate font-medium ${p.isMe ? 'text-gold-200' : 'text-slate-200'}`}>
                      {p.isMe ? 'You' : p.name}
                    </span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${p.stack === 0 ? 'text-rose-400' : 'text-emerald-300'}`}>
                    {p.stack === 0 ? 'OUT' : formatChips(p.stack)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <ChatBox
            title="Tournament Chat"
            messages={chatMessages}
            onSend={chat.send}
            sending={chat.sending}
            error={chat.error}
            collapsed={chatCollapsed}
            onToggle={() => setChatCollapsed(!chatCollapsed)}
          />

          <Button variant="outline"
            type="button"
            onClick={() => void handleLeave()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
          >
            <LogOut className="h-3.5 w-3.5" /> Leave Tournament
          </Button>
        </aside>
      </div>
    </div>
  );
}
