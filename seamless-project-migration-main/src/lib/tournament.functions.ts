import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Json } from '@/integrations/supabase/types';
import { newTournament, stepTournament, tournamentDelay, manilaDay, nextManilaMidnight, type TournamentState } from '@/poker/tournament-session';
import { redactFor, isValidAction } from '@/poker/session';
import { applyAction } from '@/poker/engine';
import { loadWinRate } from '@/lib/win-rate';
import type { Action } from '@/poker/types';

type Entry = { id: string; state: Json; status: string; version: number; next_at: string; prize: number; entry_day: string };
export interface TournamentView { entryId: string; table: TournamentState['table']; startedAt: string; finished: boolean; finalPosition: number | null; prize: number; msUntilNext: number; version: number }
export interface TournamentOverview { view: TournamentView | null; enteredToday: boolean; balance: number; resetsAt: string }
function viewOf(entry: Entry): TournamentView {
  const state = entry.state as unknown as TournamentState;
  return { entryId: entry.id, table: redactFor(state.table), startedAt: state.startedAt, finished: entry.status !== 'active', finalPosition: state.finalPosition, prize: Number(entry.prize), msUntilNext: Math.max(0, Date.parse(entry.next_at) - Date.now()), version: entry.version };
}
type AdminDb = typeof import('@/integrations/supabase/client.server').supabaseAdmin;
// A tournament left open from a previous Manila day counts as a loss, so the player can enter again today.
async function forfeitStaleEntries(db: AdminDb, playerId: string, authId: string) {
  const { data: stale, error } = await db.from('tournament_entries').select('id, state, version').eq('player_id', playerId).eq('status', 'active').lt('entry_day', manilaDay(new Date()));
  if (error) throw new Error(error.message);
  for (const row of stale ?? []) {
    const { error: saveError } = await db.rpc('server_save_tournament', { p_auth: authId, p_entry: row.id, p_version: row.version, p_state: row.state, p_next_at: new Date().toISOString(), p_forfeit: true });
    if (saveError) throw new Error(saveError.message);
  }
}
function inputEntry(input: { entryId: string; action?: Action; leave?: boolean }) {
  if (!input || !/^[0-9a-f-]{36}$/i.test(input.entryId)) throw new Error('Invalid tournament entry');
  if (input.action && !isValidAction(input.action)) throw new Error('Invalid action');
  return input;
}
export const getTournament = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<TournamentOverview> => {
  const { data: player, error } = await context.supabase.from('players').select('id, balance').eq('auth_id', context.userId).single();
  if (error) throw new Error(error.message);
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  await forfeitStaleEntries(db, player.id, context.userId);
  const { data: entries, error: readError } = await db.from('tournament_entries').select('*').eq('player_id', player.id).or(`status.eq.active,entry_day.eq.${manilaDay(new Date())}`).order('created_at', { ascending: false });
  if (readError) throw new Error(readError.message);
  const entry = entries?.find((row) => row.status === 'active') ?? entries?.[0];
  return { view: entry ? viewOf(entry) : null, enteredToday: !!entries?.some((row) => row.entry_day === manilaDay(new Date())), balance: Number(player.balance), resetsAt: nextManilaMidnight(new Date()) };
});
export const enterTournament = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<TournamentView> => {
  const { data: player, error } = await context.supabase.from('players').select('id,display_name,avatar_url,avatar_emoji').eq('auth_id', context.userId).single();
  if (error) throw new Error(error.message);
  const state = newTournament(player, new Date());
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  await forfeitStaleEntries(db, player.id, context.userId);
  const { data: id, error: enterError } = await db.rpc('server_enter_tournament', { p_auth: context.userId, p_state: state as unknown as Json });
  if (enterError) throw new Error(enterError.message);
  const { data: entry, error: readError } = await db.from('tournament_entries').select('*').eq('id', id).eq('player_id', player.id).single();
  if (readError) throw new Error(readError.message);
  return viewOf(entry);
});
export const advanceTournament = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(inputEntry).handler(async ({ data, context }): Promise<TournamentView> => {
  const { data: player, error } = await context.supabase.from('players').select('id').eq('auth_id', context.userId).single();
  if (error) throw new Error(error.message);
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const { data: entry, error: readError } = await db.from('tournament_entries').select('*').eq('id', data.entryId).eq('player_id', player.id).single();
  if (readError) throw new Error(readError.message);
  if (entry.status !== 'active') return viewOf(entry);
  let state = entry.state as unknown as TournamentState;
  if (data.action) {
    const index = state.table.seats.findIndex((seat) => seat?.isMe);
    if (index < 0 || state.table.hand?.toAct !== index) return viewOf(entry);
    state = { ...state, table: applyAction(state.table, index, data.action) };
  } else if (!data.leave) {
    if (Date.now() < Date.parse(entry.next_at)) return viewOf(entry);
    state = stepTournament(state, new Date(), await loadWinRate(db));
  }
  const { error: saveError } = await db.rpc('server_save_tournament', { p_auth: context.userId, p_entry: entry.id, p_version: entry.version, p_state: state as unknown as Json, p_next_at: new Date(Date.now() + tournamentDelay(state)).toISOString(), p_forfeit: !!data.leave });
  if (saveError) throw new Error(saveError.message);
  const { data: latest, error: latestError } = await db.from('tournament_entries').select('*').eq('id', entry.id).eq('player_id', player.id).single();
  if (latestError) throw new Error(latestError.message);
  return viewOf(latest);
});