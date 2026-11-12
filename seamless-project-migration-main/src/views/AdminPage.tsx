import { useCallback, useEffect, useState } from 'react';
import { Coins, Loader as Loader2, QrCode, ScrollText, Settings2, Shield as ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { ApprovalsPanel } from '@/components/admin/ApprovalsPanel';
import { PlayersPanel } from '@/components/admin/PlayersPanel';
import { QrCodesPanel } from '@/components/admin/QrCodesPanel';
import { SystemLogsPanel } from '@/components/admin/SystemLogsPanel';
import { TableSettingsPanel } from '@/components/admin/TableSettingsPanel';
import { useLiveData } from '@/hooks/useLiveData';
import { fetchAllTransactions, fetchIsAdmin } from '@/lib/api';
import type { TransactionRow } from '@/lib/models';
import { Button } from '@/components/ui/button';

type AdminTab = 'approvals' | 'players' | 'settings' | 'qr' | 'logs';

const TABS: { id: AdminTab; label: string; icon: typeof Coins }[] = [
  { id: 'approvals', label: 'Approvals', icon: Coins },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'settings', label: 'Table settings', icon: Settings2 },
  { id: 'qr', label: 'Payment QR', icon: QrCode },
  { id: 'logs', label: 'System logs', icon: ScrollText },
];

export function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void fetchIsAdmin()
      .then((value) => active && setIsAdmin(value))
      .catch(() => active && setIsAdmin(false));
    return () => {
      active = false;
    };
  }, []);

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Checking access...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center">
        <div className="rounded-lg border border-white/10 bg-slate-900/80 p-8 text-center shadow-2xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold text-foreground">Admins only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account does not have admin access. Ask the room owner to give your account the admin role.
          </p>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>('approvals');
  const load = useCallback(() => fetchAllTransactions(), []);
  const transactions = useLiveData<TransactionRow[]>(load, ['transactions', 'players'], []);
  const pendingCount = transactions.data.filter((tx) => tx.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-gold-300" /> Admin control panel
          </h1>
          <p className="text-sm text-muted-foreground">Every change here is logged and visible to players where it applies.</p>
        </div>
      </div>

      <nav role="tablist" aria-label="Admin sections" className="admin-tabs flex gap-1 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <Button variant="ghost"
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={`inline-flex shrink-0 items-center gap-2 h-12 rounded-none px-4 py-2.5 text-sm font-medium transition ${
                active ? 'border-b-2 border-gold text-gold' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {id === 'approvals' && pendingCount > 0 && (
                <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[11px] font-bold text-slate-900">{pendingCount}</span>
              )}
            </Button>
          );
        })}
      </nav>

      <section key={tab} className="animate-fade-in">
        {tab === 'approvals' && (
          <ApprovalsPanel
            transactions={transactions.data}
            error={transactions.error}
            onChanged={transactions.refresh}
          />
        )}
        {tab === 'players' && <PlayersPanel />}
        {tab === 'settings' && <TableSettingsPanel />}
        {tab === 'qr' && <QrCodesPanel />}
        {tab === 'logs' && <SystemLogsPanel />}
      </section>
    </div>
  );
}
