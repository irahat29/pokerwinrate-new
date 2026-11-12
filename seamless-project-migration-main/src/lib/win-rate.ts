import { normalizeWinRate } from '@/poker/bots';

type SettingsReader = {
  from: (table: 'settings') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => PromiseLike<{ data: { value: unknown }[] | null; error: { message: string } | null }>;
    };
  };
};

/**
 * The single admin-set winning rate (0-100, default 50). Every game mode loads it through this
 * one function on each step, so a change in the admin panel reaches all players' next bot move.
 */
export async function loadWinRate(db: unknown): Promise<number> {
  const { data, error } = await (db as SettingsReader).from('settings').select('value').eq('key', 'player_win_rate');
  if (error) throw new Error(error.message);
  return normalizeWinRate(data?.[0]?.value);
}
