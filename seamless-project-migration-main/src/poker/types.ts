import type { Card } from '@/poker/cards';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete';

export type Aggression = 'passive' | 'balanced' | 'aggressive';

export interface Seat {
  id: string;
  name: string;
  isBot: boolean;
  isMe: boolean;
  tone: number;
  stack: number;
  bet: number;
  invested: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  sittingOut: boolean;
  avatarUrl: string | null;
  avatarEmoji: string;
  /** AI players only: which bundled photo they use (photo URLs change between builds). */
  photoKey?: string;
}

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number };

export interface Award {
  seat: number;
  amount: number;
  label: string;
}

export interface HandState {
  number: number;
  street: Street;
  board: Card[];
  deck: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  toAct: number | null;
  winners: Award[];
  rake: number;
  rakePercent: number;
  showdown: boolean;
}

export type BotLevel = 'easy' | 'normal' | 'hard';
export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
}

/** Public betting record of one player, built only from actions everyone at the table saw. */
export interface OpponentStats {
  actions: number;
  raises: number;
  facedBet: number;
  foldedToBet: number;
  /** Bet-sizing tells: bet size as a share of the pot, seen by everyone at the table. */
  sizedBets?: number;
  sizeSum?: number;
  /** Largest bet this player made in the hand with this number (used to learn from showdowns). */
  handSize?: { hand: number; fraction: number };
  /** Showdown history: how often big (>= 0.75 pot) and small (<= 0.4 pot) bets were really strong. */
  bigShown?: number;
  bigStrong?: number;
  smallShown?: number;
  smallStrong?: number;
}

export interface TableState {
  /** Public action history per seat id, used by bots to adapt to how each player really plays. */
  stats?: Record<string, OpponentStats>;
  seats: (Seat | null)[];
  dealer: number;
  hand: HandState | null;
  handCount: number;
  config: TableConfig;
}

export interface HandWinner {
  seat: number;
  name: string;
  avatarUrl: string | null;
  avatarEmoji: string;
  amount: number;
  label: string;
}

export interface HandResult {
  handNumber: number;
  board: Card[];
  rake: number;
  pot: number;
  showdown: boolean;
  winners: HandWinner[];
  /** Cards shown at showdown (empty when everyone else folded). */
  reveals?: import('@/poker/showdown').ShowdownReveal[];
}

export interface LegalInfo {
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  minTo: number;
  maxTo: number;
}
