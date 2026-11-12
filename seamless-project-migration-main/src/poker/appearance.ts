/** Presentation only: never changes the deck, odds, stakes or game state. */
export const HAND_APPEARANCES = ['emerald', 'ruby', 'sapphire', 'onyx'] as const;
export type HandAppearance = (typeof HAND_APPEARANCES)[number];

export function appearanceForHand(handNumber: number): HandAppearance {
  const index = Math.max(0, Math.floor(Number.isFinite(handNumber) ? handNumber : 1) - 1) % HAND_APPEARANCES.length;
  return HAND_APPEARANCES[index] ?? 'emerald';
}