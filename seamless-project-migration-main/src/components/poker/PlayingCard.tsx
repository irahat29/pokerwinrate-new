import { isRedSuit, rankLabel, suitSymbol, type Card } from '@/poker/cards';

interface PlayingCardProps {
  card?: Card | undefined;
  faceDown?: boolean;
  size?: 'sm' | 'md';
  delayMs?: number;
}

export function PlayingCard({ card, faceDown = false, size = 'md', delayMs = 0 }: PlayingCardProps) {
  const dimensions =
    size === 'sm'
      ? 'h-[44px] w-[32px] text-[8px] sm:h-[60px] sm:w-[42px] sm:text-[10px]'
      : 'h-[68px] w-[48px] text-xs sm:h-[84px] sm:w-[60px] sm:text-sm';
  const style = { animationDelay: `${delayMs}ms` };

  if (!card || faceDown) {
    return (
      <div
        aria-label="Face-down card"
        style={style}
        className={`${dimensions} playing-card card-back animate-deal-in`}
      >
        <div className="card-back-inner"><span className="card-back-emblem" aria-hidden>♠</span></div>
      </div>
    );
  }

  const color = isRedSuit(card.suit) ? 'card-red' : 'card-black';
  const label = rankLabel(card.rank);
  return (
    <div
      aria-label={`${label} ${suitSymbol(card.suit)}`}
      style={style}
      className={`${dimensions} ${color} playing-card card-face animate-card-flip relative flex flex-col justify-between overflow-hidden p-1 sm:p-1.5`}
    >
      <div className="flex flex-col items-start leading-none">
        <span className="font-black">{label}</span>
        <span className="text-[10px] sm:text-xs">{suitSymbol(card.suit)}</span>
      </div>
      <div aria-hidden className="card-center-suit absolute inset-0 flex items-center justify-center text-xl leading-none sm:text-3xl">{suitSymbol(card.suit)}</div>
      <div className="flex rotate-180 flex-col items-start leading-none">
        <span className="font-black">{label}</span>
        <span className="text-[10px] sm:text-xs">{suitSymbol(card.suit)}</span>
      </div>
    </div>
  );
}
