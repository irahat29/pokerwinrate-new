import type { Card } from '@/poker/cards';
import { bestFive, describeScore, evaluateBest } from '@/poker/evaluate';
import type { HandResult, TableState } from '@/poker/types';

export interface ShowdownReveal {
  seat: number;
  name: string;
  avatarUrl: string | null;
  avatarEmoji: string;
  hole: Card[];
  /** Best five-card hand, e.g. "Flush". */
  handName: string;
  bestFive: Card[];
  won: boolean;
  score: number;
}

/** At showdown, every player still in the hand shows their cards. Hidden cards are never included. */
export function showdownReveals(table: TableState): ShowdownReveal[] {
  const hand = table.hand;
  if (!hand || hand.street !== 'complete' || !hand.showdown) return [];
  const winners = new Set(hand.winners.map((award) => award.seat));
  return table.seats.flatMap((seat, index) => {
    if (!seat || seat.folded || seat.hole.length !== 2 || hand.board.length < 3) return [];
    const cards = [...seat.hole, ...hand.board];
    const score = evaluateBest(cards);
    return [{
      seat: index, name: seat.name, avatarUrl: seat.avatarUrl, avatarEmoji: seat.avatarEmoji,
      hole: seat.hole, handName: describeScore(score), bestFive: bestFive(cards), won: winners.has(index), score,
    }];
  });
}

/** Short plain-language reason the winner won. */
export function explainWin(reveals: ShowdownReveal[]): string | null {
  const winners = reveals.filter((r) => r.won);
  const losers = reveals.filter((r) => !r.won);
  if (winners.length === 0) return null;
  if (winners.length > 1) return `Split pot: ${winners.map((w) => w.name).join(' & ')} tied with ${winners[0]!.handName}.`;
  const w = winners[0]!;
  if (losers.length === 0) return `${w.name} won with ${w.handName}.`;
  const best = losers.reduce((a, b) => (b.score > a.score ? b : a));
  return w.handName === best.handName
    ? `${w.name} won with a better ${w.handName} (higher cards) than ${best.name}'s ${best.handName}.`
    : `${w.name} won with ${w.handName}, beating ${best.name}'s ${best.handName}.`;
}

export function buildHandResult(table: TableState): HandResult | null {
  const hand = table.hand;
  if (!hand || hand.street !== 'complete') return null;
  return {
    handNumber: hand.number,
    board: hand.board,
    rake: hand.rake,
    pot: hand.winners.reduce((sum, award) => sum + award.amount, 0) + hand.rake,
    showdown: hand.showdown,
    winners: hand.winners.flatMap((award) => {
      const seat = table.seats[award.seat];
      if (!seat) return [];
      return [{ seat: award.seat, name: seat.name, avatarUrl: seat.avatarUrl, avatarEmoji: seat.avatarEmoji, amount: award.amount, label: award.label }];
    }),
    reveals: showdownReveals(table),
  };
}
