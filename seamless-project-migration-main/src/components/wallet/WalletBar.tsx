import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react';
import { RequestModal } from '@/components/wallet/RequestModal';
import type { useWallet } from '@/hooks/useWallet';
import { formatPeso } from '@/lib/format';
import type { TransactionType } from '@/lib/models';
import { Button } from '@/components/ui/button';

interface WalletBarProps {
  playerId: string;
  wallet: ReturnType<typeof useWallet>;
}

/** Compact wallet: live balance plus small cash-in / withdraw buttons. */
export function WalletBar({ playerId, wallet }: WalletBarProps) {
  const [request, setRequest] = useState<TransactionType | null>(null);
  const { player } = wallet;
  const frozen = player?.status === 'frozen';

  return (
    <div className="glass-panel flex min-w-0 items-center gap-1 rounded-full py-1 pl-2 pr-1 sm:gap-1.5 sm:pl-3">
      <Wallet className="hidden h-3.5 w-3.5 shrink-0 text-gold sm:block" />
      <span
        key={player?.balance ?? 'loading'}
        title={frozen ? 'This account is frozen' : 'Wallet balance'}
        className="min-w-0 truncate animate-balance-flash text-xs font-bold tabular-nums text-foreground sm:text-sm"
      >
        {player ? formatPeso(player.balance) : '…'}
      </span>
      <Button variant="ghost" size="sm"
        type="button"
        disabled={frozen}
        onClick={() => setRequest('cash_in')}
        aria-label="Recharge"
        title="Recharge"
        className="btn-gold inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-bold disabled:opacity-40"
      >
        <ArrowDownToLine className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Recharge</span>
      </Button>
      <Button variant="ghost" size="sm"
        type="button"
        disabled={frozen}
        onClick={() => setRequest('cash_out')}
        aria-label="Withdraw"
        title="Withdraw"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-xs font-semibold text-foreground transition hover:border-gold/50 hover:text-gold disabled:opacity-40"
      >
        <ArrowUpFromLine className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Withdraw</span>
      </Button>
      {request && (
        <RequestModal mode={request} playerId={playerId} balance={player?.balance ?? 0} onClose={() => setRequest(null)} />
      )}
    </div>
  );
}
