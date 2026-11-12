CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 24),
  balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen')),
  avatar_url text,
  avatar_emoji text NOT NULL DEFAULT '🙂',
  referral_code text NOT NULL UNIQUE CHECK (referral_code ~ '^[A-Z0-9]{1,8}$'),
  referred_by uuid REFERENCES public.players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX players_referred_by_idx ON public.players (referred_by);
GRANT SELECT ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_player_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.players WHERE auth_id = auth.uid()
$$;

CREATE POLICY "Players read own row, admins read all" ON public.players FOR SELECT TO authenticated
  USING (auth_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

CREATE TABLE public.qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  method text NOT NULL CHECK (method IN ('qrph', 'gcash', 'maya', 'bank')),
  account_name text NOT NULL,
  account_number text NOT NULL,
  qr_payload text NOT NULL DEFAULT '',
  image_data text,
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qr_codes TO authenticated;
GRANT ALL ON public.qr_codes TO service_role;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read QR codes" ON public.qr_codes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  type text NOT NULL CONSTRAINT transactions_type_check CHECK (type IN ('cash_in', 'cash_out', 'bonus', 'referral')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('qrph', 'gcash', 'maya', 'bank', 'bonus')),
  account_details text NOT NULL CHECK (char_length(account_details) BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  proof_url text,
  qr_code_id uuid REFERENCES public.qr_codes(id) ON DELETE SET NULL,
  referred_player_id uuid REFERENCES public.players(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX transactions_status_created_idx ON public.transactions (status, created_at DESC);
CREATE INDEX transactions_player_idx ON public.transactions (player_id);
CREATE INDEX transactions_qr_code_id_idx ON public.transactions (qr_code_id);
CREATE UNIQUE INDEX transactions_one_referral_reward ON public.transactions (referred_player_id) WHERE type = 'referral';
GRANT SELECT ON public.transactions TO authenticated;
GRANT INSERT (player_id, type, amount, method, account_details, proof_url, qr_code_id) ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read own requests, admins read all" ON public.transactions FOR SELECT TO authenticated
  USING (player_id = public.current_player_id() OR public.has_role((select auth.uid()), 'admin'));

CREATE POLICY "Active players create own requests" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    player_id = public.current_player_id()
    AND type IN ('cash_in', 'cash_out')
    AND method <> 'bonus'
    AND status = 'pending'
    AND admin_note IS NULL
    AND resolved_at IS NULL
    AND (type <> 'cash_in' OR proof_url IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.status = 'active')
  );

CREATE TABLE public.table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  buy_in numeric(12,2) NOT NULL CHECK (buy_in > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  cashed_out numeric(12,2),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX table_sessions_player_idx ON public.table_sessions (player_id, status);
GRANT SELECT ON public.table_sessions TO authenticated;
GRANT ALL ON public.table_sessions TO service_role;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own sessions, admins read all" ON public.table_sessions FOR SELECT TO authenticated
  USING (player_id = public.current_player_id() OR public.has_role((select auth.uid()), 'admin'));

CREATE TABLE public.game_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error', 'admin')),
  message text NOT NULL,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_logs_created_idx ON public.game_logs (created_at DESC);
CREATE INDEX game_logs_player_id_idx ON public.game_logs (player_id);
GRANT SELECT ON public.game_logs TO authenticated;
GRANT ALL ON public.game_logs TO service_role;
ALTER TABLE public.game_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read logs" ON public.game_logs FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read settings" ON public.settings FOR SELECT TO authenticated USING (true);

CREATE TABLE public.poker_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_bet numeric(12,2) NOT NULL CHECK (min_bet > 0),
  small_blind numeric(12,2) NOT NULL CHECK (small_blind > 0),
  big_blind numeric(12,2) NOT NULL CHECK (big_blind > 0),
  min_buy_in numeric(12,2) NOT NULL CHECK (min_buy_in > 0),
  max_buy_in numeric(12,2) NOT NULL CHECK (max_buy_in >= min_buy_in),
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  bot_level text NOT NULL DEFAULT 'normal' CHECK (bot_level IN ('easy', 'normal', 'hard')),
  rake_percent numeric(5,2) CHECK (rake_percent IS NULL OR (rake_percent >= 0 AND rake_percent <= 20)),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.poker_tables TO authenticated;
GRANT ALL ON public.poker_tables TO service_role;
ALTER TABLE public.poker_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read tables" ON public.poker_tables FOR SELECT TO authenticated USING (true);

CREATE TABLE public.table_game_states (
  session_id uuid PRIMARY KEY REFERENCES public.table_sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.poker_tables(id) ON DELETE SET NULL,
  bot_level text NOT NULL DEFAULT 'normal' CHECK (bot_level IN ('easy', 'normal', 'hard')),
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.table_game_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.table_game_states TO service_role;
ALTER TABLE public.table_game_states ENABLE ROW LEVEL SECURITY;
CREATE INDEX table_game_states_player_idx ON public.table_game_states (player_id);
CREATE INDEX table_game_states_table_id_idx ON public.table_game_states (table_id);

CREATE TABLE public.sound_preferences (
  user_id uuid PRIMARY KEY,
  muted boolean NOT NULL DEFAULT false,
  card_volume smallint NOT NULL DEFAULT 80 CHECK (card_volume BETWEEN 0 AND 100),
  chip_volume smallint NOT NULL DEFAULT 80 CHECK (chip_volume BETWEEN 0 AND 100),
  table_volume smallint NOT NULL DEFAULT 80 CHECK (table_volume BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sound_preferences TO authenticated;
GRANT ALL ON public.sound_preferences TO service_role;
ALTER TABLE public.sound_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read their own sound settings" ON public.sound_preferences
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "Players create their own sound settings" ON public.sound_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Players update their own sound settings" ON public.sound_preferences
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

INSERT INTO public.settings (key, value) VALUES
  ('rake_percent', '5'),
  ('bot_aggression', '"balanced"'),
  ('min_buy_in', '500'),
  ('max_buy_in', '20000'),
  ('welcome_bonus', '20');

INSERT INTO public.poker_tables (name, min_bet, small_blind, big_blind, min_buy_in, max_buy_in, display_order) VALUES
  ('Beginner ₱1', 1, 0.50, 1, 20, 200, 1),
  ('Rookie ₱2', 2, 1, 2, 40, 400, 2),
  ('Rookie ₱3', 3, 1.5, 3, 60, 600, 3),
  ('Casual ₱5', 5, 2.5, 5, 100, 1000, 4),
  ('Casual ₱10', 10, 5, 10, 200, 2000, 5),
  ('Pro ₱20', 20, 10, 20, 400, 4000, 6),
  ('Pro ₱30', 30, 15, 30, 600, 6000, 7),
  ('Pro ₱40', 40, 20, 40, 800, 8000, 8),
  ('High Roller ₱50', 50, 25, 50, 1000, 10000, 9),
  ('High Roller ₱100', 100, 50, 100, 2000, 20000, 10),
  ('VIP ₱200', 200, 100, 200, 4000, 40000, 11),
  ('Whale ₱1000', 1000, 500, 1000, 20000, 200000, 12);

INSERT INTO public.qr_codes (label, method, account_name, account_number, display_order) VALUES
  ('Scan to Pay', 'qrph', 'Master Poker', 'Any bank, GCash or Maya app', 1);

CREATE POLICY "avatar_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "avatar_owner_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proof_owner_or_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "proof_owner_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proof_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poker_tables;