import type { Action, OpponentStats, Seat, TableState } from '@/poker/types';

/** Only actions that everyone at the table can see are recorded; hidden cards are never used. */
export const BIG_BET = 0.75;
export const SMALL_BET = 0.4;

export function recordAction(
  table: TableState,
  seat: Seat,
  toCall: number,
  action: Action,
  /** Raise size as a share of the pot before the raise (public: everyone sees the chips). */
  sizeFraction?: number
): Record<string, OpponentStats> {
  const stats = { ...(table.stats ?? {}) };
  const current = stats[seat.id] ?? { actions: 0, raises: 0, facedBet: 0, foldedToBet: 0 };
  const next: OpponentStats = {
    ...current,
    actions: current.actions + 1,
    raises: current.raises + (action.type === 'raise' ? 1 : 0),
    facedBet: current.facedBet + (toCall > 0 ? 1 : 0),
    foldedToBet: current.foldedToBet + (toCall > 0 && action.type === 'fold' ? 1 : 0),
  };
  if (action.type === 'raise' && sizeFraction !== undefined && Number.isFinite(sizeFraction) && sizeFraction > 0) {
    const fraction = Math.min(sizeFraction, 5);
    next.sizedBets = (current.sizedBets ?? 0) + 1;
    next.sizeSum = (current.sizeSum ?? 0) + fraction;
    const handNumber = table.hand?.number ?? 0;
    const previous = current.handSize?.hand === handNumber ? current.handSize.fraction : 0;
    next.handSize = { hand: handNumber, fraction: Math.max(previous, fraction) };
  }
  stats[seat.id] = next;
  return stats;
}

/**
 * Learn from showdowns: when a player's cards are turned face up, everyone sees whether their
 * big or small bet in that hand was backed by a strong hand. Only revealed cards are used.
 */
export function recordShowdownTells(
  stats: Record<string, OpponentStats> | undefined,
  handNumber: number,
  revealed: { id: string; isBot: boolean; strong: boolean }[]
): Record<string, OpponentStats> | undefined {
  if (!stats) return stats;
  const next = { ...stats };
  for (const player of revealed) {
    if (player.isBot) continue;
    const current = next[player.id];
    if (!current?.handSize || current.handSize.hand !== handNumber) continue;
    const size = current.handSize.fraction;
    if (size >= BIG_BET) {
      next[player.id] = { ...current, bigShown: (current.bigShown ?? 0) + 1, bigStrong: (current.bigStrong ?? 0) + (player.strong ? 1 : 0) };
    } else if (size <= SMALL_BET) {
      next[player.id] = { ...current, smallShown: (current.smallShown ?? 0) + 1, smallStrong: (current.smallStrong ?? 0) + (player.strong ? 1 : 0) };
    }
  }
  return next;
}

export interface OpponentRead {
  /** True once enough actions were seen to trust the numbers. */
  known: boolean;
  /** Share of bets this player folds to (0-1). */
  foldRate: number;
  /** Share of this player's actions that are raises (0-1). */
  raiseRate: number;
}

const MIN_SAMPLE = 8;

/** Average read of the live human opponents a bot is up against. */
export function readHumans(table: TableState, botIndex: number): OpponentRead {
  const reads: { foldRate: number; raiseRate: number }[] = [];
  table.seats.forEach((seat, position) => {
    if (!seat || seat.isBot || position === botIndex || seat.folded || seat.sittingOut) return;
    const s = table.stats?.[seat.id];
    if (!s || s.actions < MIN_SAMPLE) return;
    reads.push({ foldRate: s.facedBet >= 3 ? s.foldedToBet / s.facedBet : 0.4, raiseRate: s.raises / s.actions });
  });
  if (reads.length === 0) return { known: false, foldRate: 0.4, raiseRate: 0.2 };
  const avg = (key: 'foldRate' | 'raiseRate') => reads.reduce((sum, r) => sum + r[key], 0) / reads.length;
  return { known: true, foldRate: avg('foldRate'), raiseRate: avg('raiseRate') };
}

export interface SizingTell {
  /** The bet being faced, as a share of the pot before it. */
  fraction: number;
  /** -1..1: positive means this player's bets of this size are usually real (fold more), negative means usually weak (call/raise more). */
  strength: number;
  /** 0..1: how much showdown evidence backs the read. */
  confidence: number;
}

/**
 * Bet-sizing tell of the human who made the bet the bot is facing. Built only from public bets and
 * hands that were shown at showdown. Returns null when there is no human aggressor or no history.
 */
export function readSizingTell(table: TableState, botIndex: number, toCall: number, potTotalNow: number): SizingTell | null {
  const hand = table.hand;
  if (!hand || toCall <= 0) return null;
  const aggressor = table.seats.find(
    (seat, position) => seat && !seat.isBot && position !== botIndex && !seat.folded && seat.bet === hand.currentBet && seat.bet > 0
  );
  if (!aggressor) return null;
  const s = table.stats?.[aggressor.id];
  if (!s) return null;
  const fraction = toCall / Math.max(1, potTotalNow - toCall);
  const shown = fraction >= BIG_BET ? s.bigShown ?? 0 : fraction <= SMALL_BET ? s.smallShown ?? 0 : 0;
  const strong = fraction >= BIG_BET ? s.bigStrong ?? 0 : fraction <= SMALL_BET ? s.smallStrong ?? 0 : 0;
  if (shown === 0) return null;
  // Laplace smoothing keeps one lucky showdown from moving the read too far.
  const rate = (strong + 1) / (shown + 2);
  return { fraction, strength: Math.max(-1, Math.min(1, (rate - 0.5) * 2)), confidence: Math.min(1, shown / 5) };
}
