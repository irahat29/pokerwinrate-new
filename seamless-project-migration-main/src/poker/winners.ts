import type { TableState } from '@/poker/types';

export interface TableWinner {
  seat: number;
  name: string;
  avatarUrl: string | null;
  avatarEmoji: string;
  amount: number;
  /** Hand names, e.g. "Flush". Split pots can have more than one. */
  labels: string[];
  isMe: boolean;
}

/**
 * Winners of the hand that just finished (empty while the hand is still running).
 * Awards for the same seat (main pot + side pots) are merged into one entry.
 */
export function getTableWinners(table: TableState): TableWinner[] {
  const hand = table.hand;
  if (!hand || hand.street !== 'complete') return [];
  const bySeat = new Map<number, TableWinner>();
  for (const award of hand.winners) {
    const seat = table.seats[award.seat];
    if (!seat) continue;
    const existing = bySeat.get(award.seat);
    if (existing) {
      existing.amount += award.amount;
      if (award.label && !existing.labels.includes(award.label)) existing.labels.push(award.label);
    } else {
      bySeat.set(award.seat, {
        seat: award.seat,
        name: seat.name,
        avatarUrl: seat.avatarUrl,
        avatarEmoji: seat.avatarEmoji,
        amount: award.amount,
        labels: award.label ? [award.label] : [],
        isMe: seat.isMe,
      });
    }
  }
  return [...bySeat.values()].sort((a, b) => b.amount - a.amount);
}

/** "Ana", "Ana & Ben", "Ana, Ben & Cy" — used for the table banner. The player's own seat reads "You". */
export function winnerNames(winners: { name: string; isMe?: boolean }[], youLabel = 'You'): string {
  const names = winners.map((w) => (w.isMe ? youLabel : w.name));
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}
