import { useState } from 'react';
import { Crown, Eye, UserRound } from 'lucide-react';
import { WinSparkles } from '@/components/common/WinSparkles';
import { PlayingCard } from '@/components/poker/PlayingCard';
import { formatChips } from '@/lib/format';
import type { Seat } from '@/poker/types';
import { BOT_ROSTER } from '@/poker/seating';

const TONES = [
  'from-sky-500 to-sky-800',
  'from-emerald-500 to-emerald-800',
  'from-amber-400 to-amber-700',
  'from-rose-500 to-rose-800',
  'from-cyan-500 to-cyan-800',
  'from-orange-400 to-orange-700',
  'from-teal-400 to-teal-700',
  'from-slate-400 to-slate-700',
];

interface SeatViewProps {
  seat: Seat;
  isDealer: boolean;
  isTurn: boolean;
  isWinner: boolean;
  isYou: boolean;
  revealCards: boolean;
  statusLabel: string | null;
  /** While a new hand is being dealt: when each hole card lands (ms), so it appears after the dealer's card arrives. */
  dealDelayMs?: (cardIndex: number) => number;
}

export function SeatView({ seat, isDealer, isTurn, isWinner, isYou, revealCards, statusLabel, dealDelayMs }: SeatViewProps) {
  const avatarUrl = seat.isBot ? BOT_ROSTER.find((bot) => bot.key === seat.photoKey || seat.id.startsWith(`bot-${bot.key}-`))?.avatarUrl ?? seat.avatarUrl : seat.avatarUrl;
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState<string | null>(null);
  const showFace = seat.isMe || revealCards;
  const ring = isWinner ? 'animate-winner-glow' : isTurn ? 'animate-turn-pulse' : '';
  const visibleCards = seat.hole.length > 0 && !seat.folded;

  return (
    <div data-player-seat data-you={isYou} className={`player-seat flex flex-col items-center gap-1 ${seat.folded ? 'seat-folded' : ''}`}>
      {/* Hole cards above the plate */}
      <div className="hole-cards relative flex h-9 items-end justify-center gap-0.5 sm:h-11">
        {visibleCards &&
          seat.hole.map((card, index) => (
            <div key={index} className={index === 0 ? '-rotate-6' : 'rotate-6'}>
              <PlayingCard size="sm" card={showFace ? card : undefined} faceDown={!showFace} delayMs={dealDelayMs ? dealDelayMs(index) : index * 80} />
            </div>
          ))}
      </div>

      {/* Winner tag: crown, sparkles and the winner's name */}
      {isWinner && (
        <div className="winner-tag pointer-events-none absolute -top-9 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center sm:-top-11" aria-live="polite">
          <Crown className="animate-winner-crown h-5 w-5 text-gold-300 drop-shadow-[0_0_8px_rgba(232,192,106,0.9)] sm:h-6 sm:w-6" />
          <span className="whitespace-nowrap rounded-full border border-gold-400/70 bg-black/80 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-gold-300 shadow-[0_0_14px_rgba(232,192,106,0.6)] sm:text-[10px]">
            {isYou ? 'You' : seat.name}
          </span>
        </div>
      )}

      {/* Player plate */}
      <div
        className={`relative flex w-[68px] flex-col items-center seat-plate rounded-lg border px-1.5 pb-1.5 pt-2.5 shadow-lg transition-all duration-300 sm:w-[88px] sm:rounded-lg sm:px-2 sm:pb-2 sm:pt-3 ${ring} ${
          isYou
            ? 'border-gold/60 ring-1 ring-gold/30'
            : 'border-border'
        } ${seat.sittingOut ? 'border-dashed border-white/15' : ''}`}
      >
        {isWinner && <WinSparkles />}

        {/* Dealer button */}
        {isDealer && (
          <span
            title="Dealer button"
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-gold/70 bg-foreground text-[9px] font-black text-background shadow-[0_3px_8px_rgba(0,0,0,0.6)] sm:h-6 sm:w-6 sm:text-[10px]"
          >
            D
          </span>
        )}

        {/* Avatar */}
        <div
          data-seat-avatar
          className={`${isWinner ? 'animate-winner-bounce' : ''} -mt-5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${TONES[seat.tone % TONES.length]} text-xs font-bold text-foreground ring-2 ring-white/20 shadow-md sm:h-11 sm:w-11 sm:text-sm`}
        >
          {avatarUrl && brokenAvatarUrl !== avatarUrl ? (
            <img
              src={avatarUrl}
              alt={seat.name}
              onError={() => setBrokenAvatarUrl(avatarUrl)}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span className="text-base sm:text-lg">{seat.avatarEmoji}</span>
          )}
        </div>

        {/* Name */}
        <div className="mt-0.5 flex max-w-full items-center gap-0.5 sm:gap-1">
          {seat.isBot ? null : seat.sittingOut ? (
            <Eye className="h-2.5 w-2.5 shrink-0 text-slate-400 sm:h-3 sm:w-3" />
          ) : (
            <UserRound className="h-2.5 w-2.5 shrink-0 text-gold-300 sm:h-3 sm:w-3" />
          )}
          <span className="seat-name truncate text-[9px] font-semibold text-foreground sm:text-xs">
            {isYou ? 'You' : seat.name}
          </span>
        </div>

        {/* Stack */}
        <span className="seat-stack text-[10px] font-bold tabular-nums text-live sm:text-[11px]">
          {seat.sittingOut ? 'Sitting out' : formatChips(seat.stack)}
        </span>

        {/* Status badge */}
        {statusLabel && (
          <span className="mt-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-200 sm:px-2 sm:text-[9px]">
            {statusLabel}
          </span>
        )}
      </div>
    </div>
  );
}
