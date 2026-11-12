import { estimateEquity } from '@/poker/equity';
import { legalActions, potTotal } from '@/poker/engine';
import type { Card } from '@/poker/cards';
import { readHumans, readSizingTell } from '@/poker/opponent-model';
import type { Action, Aggression, BotLevel, LegalInfo, Seat, TableState } from '@/poker/types';

interface Profile {
  valueBetChance: number;
  bluffChance: number;
  callMargin: number;
  betFraction: number;
}

const PROFILES: Record<Aggression, Profile> = {
  passive: { valueBetChance: 0.45, bluffChance: 0.03, callMargin: 0.08, betFraction: 0.5 },
  balanced: { valueBetChance: 0.7, bluffChance: 0.08, callMargin: 0.03, betFraction: 0.66 },
  aggressive: { valueBetChance: 0.9, bluffChance: 0.2, callMargin: -0.02, betFraction: 0.85 },
};

/**
 * Skill levels change how well bots read their hands. "normal" is the original bot behavior.
 * Easy bots misjudge hand strength, call too loosely and rarely bet their good hands, so players
 * win more often. Hard bots judge hands precisely and press their edges.
 */
interface Skill {
  noise: number;
  valueBet: number;
  bluff: number;
  callMarginShift: number;
}

export const BOT_SKILLS: Record<BotLevel, Skill> = {
  easy: { noise: 0.3, valueBet: 0.55, bluff: 0.35, callMarginShift: -0.08 },
  normal: { noise: 0.06, valueBet: 1, bluff: 1, callMarginShift: 0 },
  hard: { noise: 0.02, valueBet: 1.15, bluff: 1.25, callMarginShift: 0.02 },
};

function temperament(seat: Seat): number {
  return 0.85 + ((seat.tone * 37) % 10) / 25;
}

function sizedTarget(table: TableState, legal: LegalInfo, fraction: number): number {
  const hand = table.hand;
  if (!hand) return legal.minTo;
  const pot = potTotal(table);
  const base = hand.currentBet > 0 ? hand.currentBet * 2.5 : 0;
  const size = base + pot * fraction;
  return Math.round(Math.min(legal.maxTo, Math.max(legal.minTo, size)));
}

function liveOpponents(table: TableState, index: number): number {
  return table.seats.filter((seat, position) => position !== index && seat && !seat.folded && !seat.sittingOut)
    .length;
}

/** Clamp the admin-set winning rate to 0-100; anything invalid falls back to neutral (50). */
export function normalizeWinRate(value: unknown): number {
  const number = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : 50;
}

/**
 * Admin-set player win rate (stored as player_win_rate, 0-100). 50 = fair, balanced play;
 * 100 = bots make maximum mistakes so the player wins almost every hand; 0 = bots play their
 * best so the player loses most of the time. Returns -1..1: positive means bots are weaker
 * (player favored), negative means bots are stronger (player unfavored). This only changes how
 * well bots play; it never touches the deck, the cards dealt or the players' hidden cards, so
 * every hand stays fair. Stronger bots read hands more accurately (more simulations), play
 * position, read players and bet bigger for value. Weaker bots misjudge hands, call too much
 * and rarely bet good hands.
 */
function pressure(winRate: number): number {
  return (50 - normalizeWinRate(winRate)) / 50;
}

export function winRateCallMarginShift(winRate: number): number {
  const p = pressure(winRate);
  // Weak bots (winRate above 50, negative p) call far too loosely; strong bots (positive p) tighten slightly.
  return p < 0 ? p / 5 : p / 20;
}

/** Extra random error in a bot's hand reading. Weak bots (winRate above 50) get more noise; strong bots get less. */
function winRateNoise(winRate: number): number {
  return -pressure(winRate) * 0.3;
}

/** Chen-style preflop strength: roughly 0 (trash) to 20 (pocket aces). */
export function preflopScore(hole: Card[]): number {
  if (hole.length < 2) return 0;
  const [a, b] = hole as [Card, Card];
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);
  const points = (rank: number) => (rank === 14 ? 10 : rank === 13 ? 8 : rank === 12 ? 7 : rank === 11 ? 6 : rank / 2);
  let score = points(high);
  if (a.rank === b.rank) return Math.max(5, Math.round(score * 2));
  if (a.suit === b.suit) score += 2;
  const gap = high - low - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && high < 12) score += 1;
  return Math.round(score);
}

/** 0 = first to act after the flop (worst seat), 1 = on the button (best seat). */
export function positionValue(table: TableState, index: number): number {
  const live: number[] = [];
  for (let step = 1; step <= table.seats.length; step++) {
    const position = (table.dealer + step) % table.seats.length;
    const seat = table.seats[position];
    if (seat && !seat.folded && !seat.sittingOut) live.push(position);
  }
  const rank = live.indexOf(index);
  return live.length > 1 && rank >= 0 ? rank / (live.length - 1) : 0.5;
}

export function chooseBotAction(
  table: TableState,
  index: number,
  aggression: Aggression,
  level: BotLevel = 'normal',
  winRate = 50
): Action {
  const legal = legalActions(table, index);
  const seat = table.seats[index];
  const hand = table.hand;
  if (!legal || !seat || !hand) return { type: 'fold' };

  const opponents = liveOpponents(table, index);
  if (opponents === 0) return legal.canCheck ? { type: 'check' } : { type: 'call' };

  const skill = BOT_SKILLS[level];
  const base = PROFILES[aggression];
  const marginShift = winRateCallMarginShift(winRate);
  const strength = pressure(winRate);
  // Negative strength = weak bots (winRate above 50); positive = strong bots (below 50).
  const tough = Math.min(0, strength);
  const sharp = Math.max(0, strength);
  // Strategy upgrades (position, opponent reads, preflop selection) activate for strong bots.
  const edge = sharp;
  // How much the admin wants players favored: 0 at neutral, 1 at 100% win rate.
  const soft = Math.max(0, -tough);
  const lateness = positionValue(table, index);
  const read = edge > 0 ? readHumans(table, index) : { known: false, foldRate: 0.4, raiseRate: 0.2 };
  // Observed behaviour of the human opponents, from public actions only.
  const foldy = read.known ? Math.min(1, Math.max(-1, (read.foldRate - 0.4) / 0.3)) : 0; // >0: folds a lot
  const wild = read.known ? Math.min(1, Math.max(-1, (read.raiseRate - 0.2) / 0.2)) : 0; // >0: raises a lot
  const positionShift = (0.5 - lateness) * 0.06 * edge; // late seats play looser, early seats tighter

  const profile: Profile = {
    valueBetChance: Math.min(1, base.valueBetChance * skill.valueBet * Math.max(0.3, 1 + tough * 0.35) * (1 + (lateness - 0.5) * 0.2 * edge)),
    bluffChance: Math.min(1, base.bluffChance * skill.bluff * Math.max(0, 1 + tough * 0.6) * (1 + foldy * 0.8 * edge) * (1 + (lateness - 0.5) * 0.5 * edge)),
    callMargin: base.callMargin + skill.callMarginShift + marginShift + positionShift - wild * 0.03 * edge,
    betFraction: Math.min(1.2, Math.max(0.3, base.betFraction * (1 + tough * 0.25))),
  };
  const style = temperament(seat);
  // Noise can never go below zero: a negative width would just be random error in disguise.
  const noise = Math.max(0, skill.noise + winRateNoise(winRate));
  // Stronger bots simulate more hands; weak bots simulate fewer and read hands less well.
  const samples = sharp > 0 ? Math.round(120 + sharp * 880) : Math.max(40, Math.round(120 - soft * 80));
  const equity = estimateEquity(seat.hole, hand.board, opponents, samples) + (Math.random() - 0.5) * noise;
  const pot = potTotal(table);

  // Bet-sizing tell of the human who bet into this bot (public bets and shown-down hands only).
  const tell = edge > 0 ? readSizingTell(table, index, legal.toCall, pot) : null;
  const tellShift = tell ? tell.strength * tell.confidence * 0.1 * edge : 0; // >0: respect this bet size, <0: it is usually weak

  // Better sizing: bigger value bets against opponents who rarely fold, smaller bluffs against ones who fold a lot.
  const valueFraction = profile.betFraction * (1 + Math.max(0, equity - 0.6) * 0.8 * edge) * (1 - foldy * 0.15 * edge);
  const bluffFraction = profile.betFraction * (1 - 0.2 * edge) * (1 + foldy * 0.1 * edge);

  // Preflop hand selection for strong bots.
  const preflop = hand.street === 'preflop' && seat.hole.length === 2;
  if (preflop && edge > 0.25 && opponents >= 2) {
    const score = preflopScore(seat.hole);
    const facingRaise = legal.toCall > table.config.bigBlind;
    const committedAlready = legal.toCall / Math.max(1, seat.stack + seat.bet) < 0.04;
    const needed = 6 - lateness * 2.5 + (facingRaise ? 2 : 0);
    if (score >= 10 && legal.canRaise && Math.random() < 0.55 + 0.35 * edge) {
      return { type: 'raise', to: sizedTarget(table, legal, valueFraction) };
    }
    if (legal.toCall > 0 && !committedAlready && score < needed - (1 - edge) * 3 && equity < 0.55) {
      return { type: 'fold' };
    }
  }

  // Weak bots (winRate above 50) make real mistakes: they fold good hands and call bad ones.
  if (soft > 0 && legal.toCall > 0 && Math.random() < soft * 0.45) {
    return equity > 0.55 && Math.random() < 0.7 ? { type: 'fold' } : { type: 'call' };
  }

  if (legal.toCall > 0) {
    const potOdds = legal.toCall / (pot + legal.toCall);
    const committed = legal.toCall / Math.max(1, seat.stack + seat.bet);
    // Stronger bots (winRate below 50) value-raise more often; weaker bots less often.
    const strongThreshold = Math.min(Math.max(0.72 - (style - 1) * 0.1 - tough * 0.08, 0.4), 0.95);
    const strong = equity > strongThreshold;

    if (legal.canRaise && strong && Math.random() < profile.valueBetChance * style) {
      return { type: 'raise', to: sizedTarget(table, legal, valueFraction) };
    }
    // A bet size this player usually makes with a weak hand is a good spot to raise as a bluff.
    const tellBluffBoost = tellShift < -0.03 ? 1 + Math.min(1, -tellShift * 10) : 1;
    if (legal.canRaise && equity < 0.3 && Math.random() < Math.min(1, profile.bluffChance * style * tellBluffBoost)) {
      return { type: 'raise', to: sizedTarget(table, legal, bluffFraction) };
    }

    const requiredEquity = potOdds + (profile.callMargin + tellShift) * style;
    if (equity >= requiredEquity) {
      if (committed > 0.5 && equity < 0.7) return { type: 'fold' };
      return { type: 'call' };
    }
    if (Math.random() < profile.bluffChance && committed < 0.1) return { type: 'call' };
    return { type: 'fold' };
  }

  // Weak bots often just check strong hands instead of betting them.
  if (soft > 0 && equity > 0.6 && Math.random() < soft * 0.6) return { type: 'check' };

  const value = equity * style;
  if (legal.canRaise && value > 0.6 && Math.random() < profile.valueBetChance) {
    return { type: 'raise', to: sizedTarget(table, legal, valueFraction * (0.8 + Math.random() * 0.4)) };
  }
  if (legal.canRaise && value < 0.35 && Math.random() < profile.bluffChance) {
    return { type: 'raise', to: sizedTarget(table, legal, bluffFraction) };
  }
  return { type: 'check' };
}
