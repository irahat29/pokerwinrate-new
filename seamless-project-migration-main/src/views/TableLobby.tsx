import { useEffect, useState } from 'react';
import { Loader as Loader2, Trophy, Users } from 'lucide-react';
import { fetchPokerTables } from '@/lib/api';
import { errorMessage, formatPeso } from '@/lib/format';
import type { PokerTableRow } from '@/lib/models';
import type { TableConfig } from '@/poker/types';
import { Button } from '@/components/ui/button';
import { PlayingCard } from '@/components/poker/PlayingCard';
import { appearanceForHand } from '@/poker/appearance';
import feltPhoto from '@/assets/poker-felt.jpg';

interface TableLobbyProps {
  balance: number;
  onSelect: (selection: { table: PokerTableRow; config: TableConfig }) => void;
  onTournament: () => void;
}

export function TableLobby({ balance, onSelect, onTournament }: TableLobbyProps) {
  const [tables, setTables] = useState<PokerTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchPokerTables()
      .then((rows) => {
        setTables(rows);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading tables...
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-live">Texas Hold’em</p>
        <h1 className="font-display text-3xl font-extrabold text-foreground">Choose a Table</h1>
      </div>

      {/* Tournament entry card */}
      <Button variant="outline"
        type="button"
        onClick={onTournament}
        className="group flex h-auto w-full items-center gap-4 whitespace-normal rounded-lg border-gold/25 bg-secondary p-4 text-left"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <Trophy className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-foreground">Sit &amp; Go Tournament</h2>
          <p className="text-xs font-normal text-muted-foreground">
            8 players · ₱100 buy-in · Once daily
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-gold-300 transition group-hover:translate-x-1">
          Join &rarr;
        </span>
      </Button>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((table, index) => {
          const canAfford = balance >= table.min_buy_in;
          return (
            <Button variant="ghost"
              key={table.id}
              data-deck={appearanceForHand(index + 1)}
              type="button"
              style={{ animationDelay: `${index * 0.05 + 0.1}s`, ['--shine-delay' as string]: `${(index % 6) * 0.9}s` }}
              disabled={!canAfford}
              onClick={() =>
                onSelect({
                  table,
                  config: {
                    smallBlind: Number(table.small_blind),
                    bigBlind: Number(table.big_blind),
                    minBuyIn: Number(table.min_buy_in),
                    maxBuyIn: Number(table.max_buy_in),
                  },
                })
              }
              className="lobby-table group animate-rise-in"
            >
              <div className="mini-table-scene" aria-hidden>
                <div className="mini-table">
                  <div className="mini-table-felt">
                    <img src={feltPhoto} className="felt-photo" alt="" width={1024} height={1024} loading="lazy" />
                    <PlayingCard card={{ rank: 14, suit: 'S' }} size="sm" />
                    <PlayingCard card={{ rank: 13, suit: 'H' }} size="sm" />
                    <PlayingCard faceDown size="sm" />
                  </div>
                  <span className="mini-chip" /><span className="mini-chip" />
                </div>
              </div>
              <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="min-w-0 font-display text-base font-extrabold text-foreground">{table.name}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-live">
                  <span className="flex h-2.5 items-end gap-[2px]">
                    {[0, 1, 2].map((bar) => (
                      <span
                        key={bar}
                        className="animate-equalizer h-full w-[2px] rounded-full bg-live"
                        style={{ animationDelay: `${bar * 0.18 + index * 0.05}s` }}
                      />
                    ))}
                  </span>{' '}
                  Live
                  <Users className="ml-0.5 h-3 w-3" />
                </span>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Min bet</span>
                  <span className="font-semibold tabular-nums text-gold-300">{formatPeso(Number(table.min_bet))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Blinds</span>
                  <span className="font-medium tabular-nums text-slate-200">
                    {formatPeso(Number(table.small_blind))} / {formatPeso(Number(table.big_blind))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Buy-in</span>
                  <span className="font-medium tabular-nums text-slate-200">
                    {formatPeso(Number(table.min_buy_in))} &ndash; {formatPeso(Number(table.max_buy_in))}
                  </span>
                </div>
              </div>
              {!canAfford && (
                <p className="mt-3 text-xs text-amber-300">Your balance is too low for this table.</p>
              )}
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
