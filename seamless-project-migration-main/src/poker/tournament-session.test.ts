import { describe, expect, it } from 'vitest';
import { manilaDay, nextManilaMidnight, tournamentPrize, TOURNAMENT_BUY_IN, newTournament, stepTournament } from './tournament-session';

describe('daily paid tournament rules', () => {
  it('requires exactly PHP 100 to enter', () => { expect(TOURNAMENT_BUY_IN).toBe(100); });
  it('resets the entry day at Philippines midnight, not after 24 hours', () => {
    expect(manilaDay(new Date('2026-11-11T15:59:59Z'))).toBe('2026-11-11');
    expect(manilaDay(new Date('2026-11-11T16:00:00Z'))).toBe('2026-11-12');
    expect(nextManilaMidnight(new Date('2026-11-11T09:47:00Z'))).toBe('2026-11-11T16:00:00.000Z');
  });
  it('awards PHP 500 to the first runner-up (second place)', () => {
    expect(tournamentPrize(2)).toBe(500);
  });
  it('awards PHP 200 to the 2nd runner-up (third place) and PHP 50 to the 3rd runner-up (fourth place)', () => {
    expect(tournamentPrize(3)).toBe(200);
    expect(tournamentPrize(4)).toBe(50);
    expect(tournamentPrize(5)).toBe(0);
    expect(tournamentPrize(8)).toBe(0);
  });
  it('awards PHP 1000 to the champion (first place)', () => {
    expect(tournamentPrize(1)).toBe(1000);
    expect(tournamentPrize(null)).toBe(0);
  });
  it('derives second place from the authoritative remaining players', () => {
    const state = newTournament({ id: 'me', display_name: 'Player', avatar_url: null, avatar_emoji: '🙂' }, new Date());
    state.table.seats = state.table.seats.map((seat, i) => seat ? { ...seat, stack: i === 1 ? 24000 : 0 } : null);
    const result = stepTournament(state, new Date());
    expect(result.finished).toBe(true);
    expect(result.finalPosition).toBe(2);
  });
});