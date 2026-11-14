import { useCallback } from 'react';
import { TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { useLiveData } from '@/hooks/useLiveData';
import { fetchWinLossStats } from '@/lib/api';
import { errorMessage, formatPeso } from '@/lib/format';
import type { WinLossStats } from '@/lib/models';

export function WinLossPanel() {
  const load = useCallback(() => fetchWinLossStats(), []);
  const { data: stats, error, refresh } = useLiveData<WinLossStats[]>(load, ['hand_results', 'players'], []);

  const totalWins = stats.reduce((sum, s) => sum + Number(s.wins), 0);
  const totalLosses = stats.reduce((sum, s) => sum + Number(s.losses), 0);
  const totalHands = stats.reduce((sum, s) => sum + Number(s.total_hands), 0);
  const overallRate = totalHands > 0 ? Math.round((totalWins / totalHands) * 100) : 0;
  const playersWithHands = stats.filter((s) => Number(s.total_hands) > 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          label="Total Wins"
          value={totalWins.toLocaleString()}
          accent="emerald"
        />
        <SummaryCard
          icon={<TrendingDown className="h-5 w-5 text-rose-400" />}
          label="Total Losses"
          value={totalLosses.toLocaleString()}
          accent="rose"
        />
        <SummaryCard
          icon={<Trophy className="h-5 w-5 text-gold-300" />}
          label="Overall Win Rate"
          value={`${overallRate}%`}
          accent="gold"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {errorMessage(error)}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 text-center font-medium">Wins</th>
              <th className="px-4 py-3 text-center font-medium">Losses</th>
              <th className="px-4 py-3 text-center font-medium">Total Hands</th>
              <th className="px-4 py-3 text-center font-medium">Win Rate</th>
              <th className="px-4 py-3 text-right font-medium">Net Chips</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {playersWithHands.map((s) => {
              const wins = Number(s.wins);
              const losses = Number(s.losses);
              const total = Number(s.total_hands);
              const rate = Number(s.win_rate);
              const net = Number(s.net_chips);
              return (
                <tr key={s.player_id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium text-white">{s.display_name}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-emerald-300">{wins.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-rose-300">{losses.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-300">{total.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rate >= 50 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>
                      {rate}%
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {net >= 0 ? '+' : ''}{formatPeso(net)}
                  </td>
                </tr>
              );
            })}
            {playersWithHands.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No hands have been played yet. Win/loss data will appear here once players start playing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {playersWithHands.length} player{playersWithHands.length !== 1 ? 's' : ''} with hand history
        </span>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:border-gold-400/60 hover:text-gold-300"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'emerald' | 'rose' | 'gold';
}) {
  const ring = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    rose: 'border-rose-500/20 bg-rose-500/5',
    gold: 'border-gold-500/20 bg-gold-500/5',
  }[accent];

  return (
    <div className={`rounded-2xl border ${ring} p-5`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}
