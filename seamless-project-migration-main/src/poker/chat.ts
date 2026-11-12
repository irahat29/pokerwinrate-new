import type { Action, Seat, Street } from '@/poker/types';

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  isMe: boolean;
  isBot: boolean;
  isSystem: boolean;
  timestamp: number;
}

const TRASH_TALK = {
  win: [
    'Easy money. Who taught you to play?',
    'Read you like a book.',
    "That's how it's done.",
    'Too easy, try harder next time.',
    'I knew you were bluffing.',
  ],
  lose: [
    'Lucky river. Pure luck.',
    "One hand doesn't make you good.",
    'You got lucky that time.',
    'I had you until that card.',
  ],
  fold: [
    'Smart fold. You would have lost anyway.',
    'I saw the fear in your eyes.',
    'Giving up already?',
    'Wise choice — for once.',
  ],
  raise: [
    'Feeling brave? Let us see.',
    'Big bet, small hand.',
    'Is that all you have got?',
    'Raise all you want, I am not going anywhere.',
  ],
  preflop: [
    'Let us see what the cards say.',
    'New hand, same result.',
    'My lucky hand is coming.',
  ],
  big_pot: [
    'Now we are playing for real.',
    'Big pot, bigger nerves.',
    'Who is brave enough for this one?',
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function botTrashTalk(
  action: Action,
  seat: Seat,
  street: Street,
  potAmount: number,
  wonAmount: number | null
): string | null {
  if (!seat.isBot) return null;

  if (wonAmount !== null && wonAmount > 0) {
    return pick(TRASH_TALK.win);
  }
  if (action.type === 'fold') {
    return pick(TRASH_TALK.fold);
  }
  if (action.type === 'raise') {
    if (Math.random() < 0.4) return pick(TRASH_TALK.raise);
  }
  if (street === 'preflop' && Math.random() < 0.15) {
    return pick(TRASH_TALK.preflop);
  }
  if (potAmount > 5000 && Math.random() < 0.2) {
    return pick(TRASH_TALK.big_pot);
  }
  if (wonAmount === 0 && Math.random() < 0.2) {
    return pick(TRASH_TALK.lose);
  }
  return null;
}

const QUICK_MESSAGES = [
  'Galing ng baraha! 👏',
  'Swerte mo naman! 😂',
  'Bluff ba yan? 😏',
  'All-in na! 🔥',
  'Bawi ako next hand! 💪',
  'Nice game! 🤝',
  'Takot ka ba? 😜',
  'Tara, laban! ♠️',
];

export function quickMessageOptions(): string[] {
  return QUICK_MESSAGES;
}

let msgCounter = 0;

export function makeMessage(
  author: string,
  text: string,
  isMe: boolean,
  isBot: boolean,
  isSystem = false
): ChatMessage {
  msgCounter += 1;
  return {
    id: `msg-${msgCounter}-${Date.now()}`,
    author,
    text,
    isMe,
    isBot,
    isSystem,
    timestamp: Date.now(),
  };
}

// Casual table talk for AI seats. Messages are always flagged isBot so the UI labels them "AI".
const AI_TABLE_TALK = [
  'Good luck sa lahat! 🍀',
  'Nice hand! 👏',
  'Tara, laban! ♠️',
  'Hmm, mahirap basahin ito 🤔',
  'Bawi ako next hand! 💪',
  'Ang bilis ng laro ngayon 😂',
  'GG! 🤝',
  'Sino ang may nuts dito? 😏',
  'Swerte ng river na yan!',
  'Focus lang, isa-isang hand.',
];

export function aiTableTalk(rng: () => number = Math.random): string {
  return AI_TABLE_TALK[Math.floor(rng() * AI_TABLE_TALK.length) % AI_TABLE_TALK.length]!;
}

export function makeAiMessage(seat: Pick<Seat, 'name'>, text: string): ChatMessage {
  return makeMessage(seat.name, text, false, true);
}
