CREATE OR REPLACE FUNCTION public.log_event(p_level text, p_message text, p_player uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.game_logs (level, message, player_id) VALUES (p_level, p_message, p_player);
$$;
REVOKE EXECUTE ON FUNCTION public.log_event(text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can do this';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    IF code ~ '[A-Z]' AND code ~ '[0-9]' AND NOT EXISTS (SELECT 1 FROM public.players WHERE referral_code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.referral_code_exists(p_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.players WHERE referral_code = upper(trim(coalesce(p_code, ''))))
$$;
REVOKE EXECUTE ON FUNCTION public.referral_code_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_code_exists(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_referral_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.players WHERE referred_by = public.current_player_id()
$$;
REVOKE EXECUTE ON FUNCTION public.my_referral_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_referral_earnings()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(amount), 0) FROM public.transactions
  WHERE player_id = public.current_player_id() AND type = 'referral' AND status = 'approved'
$$;
REVOKE ALL ON FUNCTION public.my_referral_earnings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_earnings() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_ref_code text;
  v_referrer uuid;
  v_bonus numeric;
  v_player uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.players WHERE auth_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  v_name := left(trim(coalesce(
    nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(NEW.email, ''), '@', 1)
  )), 24);
  IF char_length(v_name) < 2 THEN
    v_name := 'Player';
  END IF;

  v_ref_code := upper(trim(coalesce(NEW.raw_user_meta_data ->> 'referral_code', '')));
  IF v_ref_code <> '' THEN
    SELECT id INTO v_referrer FROM public.players WHERE referral_code = v_ref_code;
  END IF;

  SELECT coalesce((value #>> '{}')::numeric, 20) INTO v_bonus FROM public.settings WHERE key = 'welcome_bonus';
  v_bonus := coalesce(v_bonus, 20);

  INSERT INTO public.players (auth_id, display_name, referral_code, referred_by, balance)
  VALUES (NEW.id, v_name, public.generate_referral_code(), v_referrer, greatest(v_bonus, 0))
  RETURNING id INTO v_player;

  IF v_bonus > 0 THEN
    INSERT INTO public.transactions (player_id, type, amount, method, account_details, status, resolved_at)
    VALUES (v_player, 'bonus', v_bonus, 'bonus', 'Welcome bonus', 'approved', now());
  END IF;

  IF lower(coalesce(NEW.email, '')) = 'tahariabdulaziz@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.log_event('info',
    format('%s joined%s', v_name, CASE WHEN v_referrer IS NOT NULL THEN ' with referral code ' || v_ref_code ELSE '' END),
    v_player);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.resolve_transaction(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tx public.transactions%ROWTYPE;
  pl public.players%ROWTYPE;
  inviter public.players%ROWTYPE;
  v_min numeric;
  v_reward numeric;
BEGIN
  PERFORM public.assert_admin();
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;
  SELECT * INTO tx FROM public.transactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF tx.status <> 'pending' THEN RAISE EXCEPTION 'Transaction was already resolved'; END IF;
  SELECT * INTO pl FROM public.players WHERE id = tx.player_id FOR UPDATE;

  IF p_decision = 'approve' THEN
    IF tx.type = 'cash_in' THEN
      UPDATE public.players SET balance = balance + tx.amount WHERE id = pl.id;
    ELSIF tx.type = 'cash_out' THEN
      IF pl.balance < tx.amount THEN
        RAISE EXCEPTION 'Player balance is lower than the requested cash-out';
      END IF;
      UPDATE public.players SET balance = balance - tx.amount WHERE id = pl.id;
    END IF;
    UPDATE public.transactions SET status = 'approved', resolved_at = now(), admin_note = p_note WHERE id = p_id;
  ELSE
    UPDATE public.transactions SET status = 'rejected', resolved_at = now(), admin_note = p_note WHERE id = p_id;
  END IF;

  PERFORM public.log_event('admin',
    format('%s %s request of PHP %s for %s',
      CASE WHEN p_decision = 'approve' THEN 'Approved' ELSE 'Rejected' END,
      tx.type, tx.amount, pl.display_name),
    pl.id);

  IF p_decision = 'approve' AND tx.type = 'cash_in' AND pl.referred_by IS NOT NULL AND pl.referred_by <> pl.id THEN
    SELECT coalesce((value #>> '{}')::numeric, 100) INTO v_min FROM public.settings WHERE key = 'referral_min_recharge';
    v_min := coalesce(v_min, 100);
    SELECT coalesce((value #>> '{}')::numeric, 20) INTO v_reward FROM public.settings WHERE key = 'referral_reward';
    v_reward := coalesce(v_reward, 20);
    IF v_reward > 0 AND tx.amount >= v_min
       AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE type = 'referral' AND referred_player_id = pl.id) THEN
      UPDATE public.players SET balance = balance + v_reward WHERE id = pl.referred_by RETURNING * INTO inviter;
      IF FOUND THEN
        INSERT INTO public.transactions (player_id, type, amount, method, account_details, status, resolved_at, referred_player_id)
        VALUES (inviter.id, 'referral', v_reward, 'bonus', left('Referral reward: ' || pl.display_name, 60), 'approved', now(), pl.id);
        PERFORM public.log_event('info',
          format('%s earned a PHP %s referral reward from %s''s first recharge', inviter.display_name, v_reward, pl.display_name),
          inviter.id);
      END IF;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_balance(p_player uuid, p_balance numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pl public.players%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF p_balance IS NULL OR p_balance < 0 THEN RAISE EXCEPTION 'Balance must be zero or more'; END IF;
  UPDATE public.players SET balance = p_balance WHERE id = p_player RETURNING * INTO pl;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
  PERFORM public.log_event('admin', format('Balance manually set to PHP %s for %s', p_balance, pl.display_name), pl.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_player_status(p_player uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pl public.players%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF p_status NOT IN ('active', 'frozen') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.players SET status = p_status WHERE id = p_player RETURNING * INTO pl;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
  PERFORM public.log_event('admin', format('Account for %s set to %s', pl.display_name, p_status), pl.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_setting(p_key text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  other_key text;
  other_value numeric;
BEGIN
  PERFORM public.assert_admin();
  IF p_key = 'rake_percent' THEN
    IF (p_value #>> '{}')::numeric NOT BETWEEN 0 AND 20 THEN
      RAISE EXCEPTION 'Rake must be between 0 and 20 percent';
    END IF;
  ELSIF p_key = 'bot_aggression' THEN
    IF (p_value #>> '{}') NOT IN ('passive', 'balanced', 'aggressive') THEN
      RAISE EXCEPTION 'Invalid bot aggression';
    END IF;
  ELSIF p_key = 'player_win_rate' THEN
    IF (p_value #>> '{}')::numeric NOT BETWEEN 0 AND 100 THEN
      RAISE EXCEPTION 'Win rate must be between 0 and 100';
    END IF;
  ELSIF p_key = 'welcome_bonus' THEN
    IF (p_value #>> '{}')::numeric NOT BETWEEN 0 AND 10000 THEN
      RAISE EXCEPTION 'Welcome bonus must be between 0 and 10000';
    END IF;
  ELSIF p_key = 'referral_reward' THEN
    IF (p_value #>> '{}')::numeric NOT BETWEEN 0 AND 10000 THEN
      RAISE EXCEPTION 'Referral reward must be between 0 and 10000';
    END IF;
  ELSIF p_key = 'referral_min_recharge' THEN
    IF (p_value #>> '{}')::numeric NOT BETWEEN 1 AND 1000000 THEN
      RAISE EXCEPTION 'Minimum recharge must be between 1 and 1000000';
    END IF;
  ELSIF p_key IN ('min_buy_in', 'max_buy_in') THEN
    IF (p_value #>> '{}')::numeric < 100 THEN
      RAISE EXCEPTION 'Buy-in limits must be at least 100';
    END IF;
    other_key := CASE WHEN p_key = 'min_buy_in' THEN 'max_buy_in' ELSE 'min_buy_in' END;
    SELECT (value #>> '{}')::numeric INTO other_value FROM public.settings WHERE key = other_key;
    IF p_key = 'min_buy_in' AND (p_value #>> '{}')::numeric > other_value THEN
      RAISE EXCEPTION 'Minimum buy-in cannot be above the maximum';
    END IF;
    IF p_key = 'max_buy_in' AND (p_value #>> '{}')::numeric < other_value THEN
      RAISE EXCEPTION 'Maximum buy-in cannot be below the minimum';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown setting';
  END IF;
  INSERT INTO public.settings (key, value, updated_at) VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  PERFORM public.log_event('admin', format('Setting %s changed to %s', p_key, p_value #>> '{}'), NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_qr_image(p_id uuid, p_image text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE qr public.qr_codes%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF p_image IS NOT NULL AND (
    p_image !~ '^data:image/(png|jpeg|webp);base64,' OR char_length(p_image) > 500000
  ) THEN
    RAISE EXCEPTION 'QR image must be a PNG, JPEG or WebP file under 500 KB';
  END IF;
  UPDATE public.qr_codes SET image_data = p_image WHERE id = p_id RETURNING * INTO qr;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR code not found'; END IF;
  PERFORM public.log_event('admin',
    format('QR image for %s %s', qr.label, CASE WHEN p_image IS NULL THEN 'removed' ELSE 'updated' END), NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_qr_details(p_id uuid, p_label text, p_account_name text, p_account_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE qr public.qr_codes%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF char_length(trim(coalesce(p_label, ''))) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'Label must be 1 to 40 characters'; END IF;
  IF char_length(trim(coalesce(p_account_name, ''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Account name must be 1 to 60 characters'; END IF;
  IF char_length(trim(coalesce(p_account_number, ''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Account number must be 1 to 60 characters'; END IF;
  UPDATE public.qr_codes SET label = trim(p_label), account_name = trim(p_account_name), account_number = trim(p_account_number)
  WHERE id = p_id RETURNING * INTO qr;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR code not found'; END IF;
  PERFORM public.log_event('admin', format('QR details for %s updated', qr.label), NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_table_rules(p_table_id uuid, p_bot_level text, p_rake numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tbl public.poker_tables%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF p_bot_level IS NULL OR p_bot_level NOT IN ('easy', 'normal', 'hard') THEN
    RAISE EXCEPTION 'Pick a bot skill level';
  END IF;
  IF p_rake IS NOT NULL AND (p_rake < 0 OR p_rake > 20) THEN RAISE EXCEPTION 'Rake must be between 0 and 20 percent'; END IF;
  UPDATE public.poker_tables SET bot_level = p_bot_level, rake_percent = p_rake WHERE id = p_table_id RETURNING * INTO tbl;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table not found'; END IF;
  PERFORM public.log_event('admin', format('Rules for %s: bots %s, rake %s', tbl.name, p_bot_level, coalesce(p_rake::text, 'house default')), NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_profile(p_player uuid, p_display_name text DEFAULT NULL, p_avatar_url text DEFAULT NULL, p_avatar_emoji text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pl public.players%ROWTYPE;
BEGIN
  SELECT * INTO pl FROM public.players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND OR pl.auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Player not found';
  END IF;
  IF p_display_name IS NOT NULL THEN
    IF char_length(p_display_name) < 2 OR char_length(p_display_name) > 24 THEN
      RAISE EXCEPTION 'Display name must be between 2 and 24 characters';
    END IF;
    UPDATE public.players SET display_name = p_display_name WHERE id = p_player;
    PERFORM public.log_event('info', format('%s changed their display name', pl.display_name), p_player);
  END IF;
  IF p_avatar_url IS NOT NULL THEN
    IF char_length(p_avatar_url) > 2000 THEN RAISE EXCEPTION 'Avatar link is too long'; END IF;
    UPDATE public.players SET avatar_url = nullif(p_avatar_url, '') WHERE id = p_player;
  END IF;
  IF p_avatar_emoji IS NOT NULL THEN
    IF char_length(p_avatar_emoji) > 16 THEN RAISE EXCEPTION 'Invalid avatar emoji'; END IF;
    UPDATE public.players SET avatar_emoji = p_avatar_emoji WHERE id = p_player;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.server_buy_in(p_auth uuid, p_amount numeric, p_table_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pl public.players%ROWTYPE;
  tbl public.poker_tables%ROWTYPE;
  session_id uuid;
BEGIN
  SELECT * INTO pl FROM public.players WHERE auth_id = p_auth FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
  IF pl.status <> 'active' THEN RAISE EXCEPTION 'This account is frozen'; END IF;
  IF EXISTS (SELECT 1 FROM public.table_sessions WHERE player_id = pl.id AND status = 'open') THEN
    RAISE EXCEPTION 'You are already seated at a table';
  END IF;
  SELECT * INTO tbl FROM public.poker_tables WHERE id = p_table_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table not found or not active'; END IF;
  IF p_amount IS NULL OR p_amount < tbl.min_buy_in OR p_amount > tbl.max_buy_in THEN
    RAISE EXCEPTION 'Buy-in must be between PHP % and PHP %', tbl.min_buy_in, tbl.max_buy_in;
  END IF;
  IF pl.balance < p_amount THEN RAISE EXCEPTION 'Not enough balance for this buy-in'; END IF;

  UPDATE public.players SET balance = balance - p_amount WHERE id = pl.id;
  INSERT INTO public.table_sessions (player_id, buy_in) VALUES (pl.id, p_amount) RETURNING id INTO session_id;
  PERFORM public.log_event('info', format('%s bought in for PHP %s at %s', pl.display_name, p_amount, tbl.name), pl.id);
  RETURN session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.server_cash_out(p_session uuid, p_amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ses public.table_sessions%ROWTYPE;
  pl public.players%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Invalid cash-out amount'; END IF;
  SELECT * INTO ses FROM public.table_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table session not found'; END IF;
  IF ses.status <> 'open' THEN RAISE EXCEPTION 'Table session is already closed'; END IF;

  UPDATE public.players SET balance = balance + p_amount WHERE id = ses.player_id RETURNING * INTO pl;
  UPDATE public.table_sessions SET status = 'closed', cashed_out = p_amount, closed_at = now() WHERE id = p_session;
  DELETE FROM public.table_game_states WHERE session_id = p_session;
  PERFORM public.log_event('info',
    format('%s left the table with PHP %s (bought in for PHP %s)', pl.display_name, p_amount, ses.buy_in), pl.id);
  RETURN pl.balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.server_buy_in(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.server_cash_out(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_buy_in(uuid, numeric, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_cash_out(uuid, numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_transaction(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_balance(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_player_status(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_qr_image(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_qr_details(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_table_rules(uuid, text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_profile(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_transaction(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_balance(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_player_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_qr_image(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_qr_details(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_table_rules(uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile(uuid, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_player_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_player_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;