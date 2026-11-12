import { describe, expect, it } from 'vitest';
import { showdownReveals, explainWin, buildHandResult } from './showdown';
import type { TableState, Seat } from './types';

const seat = (name: string, hole: Seat['hole'], folded = false): Seat => ({
  id: name, name, isBot: false, isMe: false, tone: 0, stack: 0, bet: 0, invested: 0, hole, folded, allIn: false,
  acted: true, sittingOut: false, avatarUrl: null, avatarEmoji: '🙂',
});
const table = (showdown: boolean): TableState => ({
  seats: [seat('Ana', [{ rank: 14, suit: 'S' }, { rank: 14, suit: 'H' }]), seat('Ben', [{ rank: 13, suit: 'S' }, { rank: 12, suit: 'D' }]), seat('Cy', [{ rank: 2, suit: 'C' }, { rank: 3, suit: 'C' }], true)],
  dealer: 0, handCount: 1, config: { smallBlind: 1, bigBlind: 2, minBuyIn: 1, maxBuyIn: 1 },
  hand: { number: 1, street: 'complete', board: [{ rank: 14, suit: 'D' }, { rank: 7, suit: 'C' }, { rank: 9, suit: 'H' }, { rank: 4, suit: 'S' }, { rank: 5, suit: 'D' }], deck: [], pot: 10, currentBet: 0, minRaise: 2, toAct: null, winners: [{ seat: 0, amount: 10, label: 'Three of a Kind' }], rake: 0, rakePercent: 0, showdown },
});

describe('showdown reveal', () => {
  it('shows non-folded hands with the reason the winner won', () => {
    const reveals = showdownReveals(table(true));
    expect(reveals.map((r) => r.name)).toEqual(['Ana', 'Ben']);
    expect(reveals[0]!.handName).toBe('Three of a Kind');
    expect(reveals[0]!.won).toBe(true);
    expect(explainWin(reveals)).toBe("Ana won with Three of a Kind, beating Ben's High Card.");
  });
  it('reveals nothing when the hand ended by folds', () => {
    expect(showdownReveals(table(false))).toEqual([]);
    expect(buildHandResult(table(false))!.reveals).toEqual([]);
  });
});
