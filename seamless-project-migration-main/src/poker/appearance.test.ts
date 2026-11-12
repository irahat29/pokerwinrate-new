import { describe, expect, it } from 'vitest';
import { appearanceForHand } from './appearance';

describe('automatic hand appearance', () => {
  it('changes deck design and color on each successive hand', () => {
    expect([1, 2, 3, 4, 5].map(appearanceForHand)).toEqual(['emerald', 'ruby', 'sapphire', 'onyx', 'emerald']);
  });
  it('keeps a hand consistent across renders and handles the waiting table', () => {
    expect(appearanceForHand(2)).toBe('ruby');
    expect(appearanceForHand(2)).toBe(appearanceForHand(2));
    expect(appearanceForHand(0)).toBe('emerald');
  });
});