import { describe, expect, it } from 'vitest';
import { normalizeWinRate, winRateCallMarginShift } from '@/poker/bots';
import { newTournament, stepTournament } from '@/poker/tournament-session';

describe('admin winning rate', () => {
  it('clamps and falls back to neutral', () => {
    expect(normalizeWinRate(150)).toBe(100);
    expect(normalizeWinRate(-5)).toBe(0);
    expect(normalizeWinRate('abc')).toBe(50);
    expect(normalizeWinRate(undefined)).toBe(50);
    expect(normalizeWinRate('')).toBe(50);
    expect(normalizeWinRate('30')).toBe(30);
  });

  it('is neutral at 50; higher win rate means weaker bots (looser calls)', () => {
    expect(winRateCallMarginShift(50)).toBe(0);
    // 100% = player wins most = weakest bots = loosest calls (most negative margin shift)
    expect(winRateCallMarginShift(100)).toBeLessThan(winRateCallMarginShift(70));
    // 0% = bots strongest = tightest calls (positive margin shift)
    expect(winRateCallMarginShift(0)).toBeGreaterThan(winRateCallMarginShift(30));
  });

  it('is accepted by tournament steps', () => {
    const player = { id: 'p1', display_name: 'P', avatar_url: null, avatar_emoji: '🙂' };
    const state = newTournament(player, new Date());
    expect(() => stepTournament(state, new Date(), 20)).not.toThrow();
    expect(() => stepTournament(state, new Date(), 90)).not.toThrow();
  });
});

import { positionValue, preflopScore } from '@/poker/bots';
import { recordAction, readHumans } from '@/poker/opponent-model';
import type { TableState } from '@/poker/types';

describe('stronger bot strategy', () => {
  it('rates preflop hands sensibly', () => {
    const aces = preflopScore([{ rank: 14, suit: 'S' }, { rank: 14, suit: 'H' }]);
    const trash = preflopScore([{ rank: 7, suit: 'S' }, { rank: 2, suit: 'H' }]);
    const suitedConnectors = preflopScore([{ rank: 9, suit: 'S' }, { rank: 8, suit: 'S' }]);
    expect(aces).toBeGreaterThanOrEqual(20);
    expect(suitedConnectors).toBeGreaterThan(trash);
    expect(trash).toBeLessThan(3);
  });

  it('learns only from public actions', () => {
    const seat = { id: 'p1', isBot: false } as never;
    let table = { seats: [], stats: undefined } as unknown as TableState;
    for (let i = 0; i < 10; i++) table = { ...table, stats: recordAction(table, seat, 20, { type: 'fold' }) };
    table = { ...table, seats: [{ id: 'p1', isBot: false, folded: false, sittingOut: false }, null] as never };
    const read = readHumans(table, 1);
    expect(read.known).toBe(true);
    expect(read.foldRate).toBe(1);
  });

  it('gives the button the best position', () => {
    const live = { folded: false, sittingOut: false };
    const table = { dealer: 2, seats: [{ ...live }, { ...live }, { ...live }, { ...live }] } as unknown as TableState;
    expect(positionValue(table, 2)).toBe(1);
    expect(positionValue(table, 3)).toBe(0);
  });
});

import { recordShowdownTells, readSizingTell } from '@/poker/opponent-model';
import { chooseBotAction } from '@/poker/bots';

describe('bet-sizing tells', () => {
  const human = { id: 'p1', isBot: false, isMe: true, folded: false, sittingOut: false, bet: 60, stack: 900, hole: [], allIn: false, acted: true, invested: 60, tone: 0, name: 'P', avatarUrl: null, avatarEmoji: '🙂' };
  const bot = { ...human, id: 'b1', isBot: true, isMe: false, bet: 0, stack: 1000, invested: 0, hole: [{ rank: 9, suit: 'S' }, { rank: 9, suit: 'H' }] };

  function tableWithHistory(bigShown: number, bigStrong: number): TableState {
    return {
      seats: [human, bot],
      dealer: 0,
      handCount: 5,
      config: { smallBlind: 10, bigBlind: 20, minBuyIn: 500, maxBuyIn: 20000 },
      stats: { p1: { actions: 20, raises: 6, facedBet: 6, foldedToBet: 2, bigShown, bigStrong } },
      hand: { number: 5, street: 'flop', board: [], deck: [], pot: 40, currentBet: 60, minRaise: 20, toAct: 1, winners: [], rake: 0, rakePercent: 0, showdown: false },
    } as unknown as TableState;
  }

  it('learns from shown-down hands only', () => {
    const stats = { p1: { actions: 3, raises: 1, facedBet: 0, foldedToBet: 0, handSize: { hand: 7, fraction: 1.1 } } };
    const out = recordShowdownTells(stats, 7, [{ id: 'p1', isBot: false, strong: false }, { id: 'b1', isBot: true, strong: true }])!;
    expect(out.p1!.bigShown).toBe(1);
    expect(out.p1!.bigStrong).toBe(0);
    expect(out.b1).toBeUndefined();
    // a hand that never reached showdown teaches nothing
    expect(recordShowdownTells(stats, 8, [{ id: 'p1', isBot: false, strong: true }])!.p1!.bigShown).toBeUndefined();
  });

  it('reads a bluffy big-bettor as weak and a solid one as strong', () => {
    const bluffer = readSizingTell(tableWithHistory(5, 0), 1, 60, 100)!;
    const solid = readSizingTell(tableWithHistory(5, 5), 1, 60, 100)!;
    expect(bluffer.strength).toBeLessThan(0);
    expect(solid.strength).toBeGreaterThan(0);
    expect(readSizingTell({ ...tableWithHistory(0, 0), stats: {} }, 1, 60, 100)).toBeNull();
  });

  it('still returns a legal action with tells in play', () => {
    const action = chooseBotAction(tableWithHistory(6, 0), 1, 'balanced', 'normal', 10);
    expect(['fold', 'call', 'raise']).toContain(action.type);
  });
});
