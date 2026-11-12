import { describe, expect, it } from 'vitest';
import { getTableWinners, winnerNames } from './winners';
import type { Seat, TableState } from './types';

const seat = (name: string, isMe = false): Seat => ({
  id: name, name, isBot: !isMe, isMe, tone: 0, stack: 0, bet: 0, invested: 0, hole: [], folded: false, allIn: false,
  acted: true, sittingOut: false, avatarUrl: null, avatarEmoji: '🙂',
});
const table = (street: 'complete' | 'river', winners: { seat: number; amount: number; label: string }[]): TableState => ({
  seats: [seat('Ana', true), seat('Ben'), seat('Cy')],
  dealer: 0, handCount: 1, config: { smallBlind: 1, bigBlind: 2, minBuyIn: 1, maxBuyIn: 1 },
  hand: { number: 1, street, board: [], deck: [], pot: 10, currentBet: 0, minRaise: 2, toAct: null, winners, rake: 0, rakePercent: 0, showdown: true },
});

describe('table winners', () => {
  it('returns nothing until the hand is complete', () => {
    expect(getTableWinners(table('river', [{ seat: 1, amount: 10, label: 'Pair' }]))).toEqual([]);
  });
  it('merges awards for the same seat and sorts by amount', () => {
    const winners = getTableWinners(table('complete', [
      { seat: 1, amount: 4, label: 'Pair' }, { seat: 2, amount: 9, label: 'Flush' }, { seat: 1, amount: 3, label: 'Pair' },
    ]));
    expect(winners.map((w) => [w.name, w.amount])).toEqual([['Cy', 9], ['Ben', 7]]);
    expect(winners[1]!.labels).toEqual(['Pair']);
  });
  it('formats names for the banner', () => {
    expect(winnerNames([{ name: 'Ana' }])).toBe('Ana');
    expect(winnerNames([{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cy' }])).toBe('Ana, Ben & Cy');
    expect(winnerNames([{ name: 'Ana', isMe: true }, { name: 'Ben' }])).toBe('You & Ben');
  });
});
