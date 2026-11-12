import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react';
import { RequestModal } from '@/components/wallet/RequestModal';
import { TransactionList } from '@/components/wallet/TransactionList';
import type { useWallet } from '@/hooks/useWallet';
import { formatPeso } from '@/lib/format';
import type { TransactionType } from '@/lib/models';

interface WalletCardProps {
  playerId: string;
  wallet: ReturnType<typeof useWallet>;
}

export function WalletCard({ playerId, wallet }: WalletCardProps) {
  const [request, setRequest] = useState<TransactionType | null>(null);
  const { player, transactions } = wallet;
  const frozen = player?.status === 'frozen';

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg border border-live/25 bg-felt-deep p-6 shadow-2xl">
        <div className="flex items-center justify-between text-foreground/80">
          <span className="text-xs font-semibold uppercase tracking-widest">Wallet balance</span>
          <Wallet className="h-5 w-5" />
        </div>
        <p
          key={player?.balance ?? 'loading'}
          className="mt-3 animate-balance-flash text-3xl font-bold tabular-nums text-foreground"
        >
          {player ? formatPeso(player.balance) : 'Loading...'}
        </p>
        <p className="mt-1 text-xs text-foreground/60">
          {frozen ? 'This account is frozen. Contact support.' : 'Updates live when the admin approves a request.'}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="outline"
            type="button"
            disabled={frozen}
            onClick={() => setRequest('cash_in')}
            className="btn-gold inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold disabled:opacity-40"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Recharge
          </Button>
          <Button variant="outline"
            type="button"
            disabled={frozen}
            onClick={() => setRequest('cash_out')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent active:scale-[0.98] disabled:opacity-40"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Withdraw
          </Button>
        </div>
      </div>

      <div className="glass-panel rounded-lg p-5">
        <h3 className="mb-3 text-sm font-semibold text-gold-300">Wallet history</h3>
        {wallet.error ? (
          <p className="text-sm text-rose-300">{wallet.error}</p>
        ) : (
          <TransactionList transactions={transactions} />
        )}
      </div>

      {request && (
        <RequestModal
          mode={request}
          playerId={playerId}
          balance={player?.balance ?? 0}
          onClose={() => setRequest(null)}
        />
      )}
    </div>
  );
}
