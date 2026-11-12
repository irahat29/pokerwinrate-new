import { chooseBotAction } from './bots';
import { applyAction, legalActions, startHand } from './engine';
import { BOT_ROSTER, createHumanSeat } from './seating';
import { uniqueBotName } from './bot-names';
import { blindLevelFor, tournamentConfig, TOURNAMENT_STARTING_STACK } from './tournament';
import type { TableState } from './types';

export const TOURNAMENT_BUY_IN = 100;
export const TOURNAMENT_CHAMPION_PRIZE = 1000;
export const TOURNAMENT_RUNNER_UP_PRIZE = 500; // 1st runner-up (2nd place)
export const TOURNAMENT_SECOND_RUNNER_UP_PRIZE = 200; // 2nd runner-up (3rd place)
export const TOURNAMENT_THIRD_RUNNER_UP_PRIZE = 50; // 3rd runner-up (4th place)
export function manilaDay(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function nextManilaMidnight(date: Date): string {
  return new Date(Date.parse(`${manilaDay(date)}T00:00:00+08:00`) + 86400000).toISOString();
}
export function tournamentPrize(position: number | null): number {
  switch (position) {
    case 1: return TOURNAMENT_CHAMPION_PRIZE;
    case 2: return TOURNAMENT_RUNNER_UP_PRIZE;
    case 3: return TOURNAMENT_SECOND_RUNNER_UP_PRIZE;
    case 4: return TOURNAMENT_THIRD_RUNNER_UP_PRIZE;
    default: return 0;
  }
}
export interface TournamentState {
  table: TableState;
  startedAt: string;
  finished: boolean;
  finalPosition: number | null;
}
export function newTournament(player: { id: string; display_name: string; avatar_url: string | null; avatar_emoji: string }, now: Date): TournamentState {
  const taken: string[] = [];
  const bots = [...BOT_ROSTER].sort(() => Math.random() - 0.5).slice(0, 7).map((bot, index) => {
    const name = uniqueBotName(bot.gender, taken);
    taken.push(name);
    return { ...createHumanSeat(`tbot-${index}`, name, TOURNAMENT_STARTING_STACK, bot.tone, bot.avatarUrl, bot.emoji), isBot: true, isMe: false, photoKey: bot.key };
  });
  return {
    table: { seats: [createHumanSeat(player.id, player.display_name, TOURNAMENT_STARTING_STACK, 0, player.avatar_url, player.avatar_emoji), ...bots], dealer: 0, hand: null, handCount: 0, config: tournamentConfig(blindLevelFor(0)) },
    startedAt: now.toISOString(), finished: false, finalPosition: null,
  };
}
export function tournamentDelay(state: TournamentState): number {
  const hand = state.table.hand;
  if (!hand) return 2000;
  if (hand.street === 'complete') return 6000;
  const actor = hand.toAct === null ? null : state.table.seats[hand.toAct];
  return actor?.isBot ? 1800 + Math.random() * 2200 : 30000;
}
export function stepTournament(state: TournamentState, now: Date, winRate = 50): TournamentState {
  if (state.finished) return state;
  const table = state.table;
  const hand = table.hand;
  if (!hand || hand.street === 'complete') {
    const alive = table.seats.filter((seat) => seat && seat.stack > 0);
    const meAlive = alive.some((seat) => seat?.isMe);
    if (!meAlive || alive.length <= 1) return { ...state, finished: true, finalPosition: meAlive ? 1 : alive.length + 1 };
    if (hand) return { ...state, table: { ...table, hand: null } };
    const elapsed = Math.max(0, (now.getTime() - Date.parse(state.startedAt)) / 1000);
    const updated = { ...table, seats: table.seats.map((seat) => seat && seat.stack === 0 ? { ...seat, sittingOut: true } : seat), config: tournamentConfig(blindLevelFor(elapsed)) };
    return { ...state, table: startHand(updated, 0) };
  }
  if (hand.toAct === null) return state;
  const actor = table.seats[hand.toAct];
  const legal = legalActions(table, hand.toAct);
  const action = actor?.isBot ? chooseBotAction(table, hand.toAct, 'balanced', 'normal', winRate) : { type: legal?.canCheck ? 'check' as const : 'fold' as const };
  return { ...state, table: applyAction(table, hand.toAct, action) };
}