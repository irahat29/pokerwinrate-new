CREATE TABLE public.tournament_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
 entry_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
 buy_in numeric(12,2) NOT NULL DEFAULT 200 CHECK (buy_in = 200),
 prize numeric(12,2) NOT NULL DEFAULT 0 CHECK (prize IN (0,200)),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','forfeited')),
 finish_position integer CHECK (finish_position BETWEEN 1 AND 8),
 state jsonb NOT NULL,
 version integer NOT NULL DEFAULT 0,
 next_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (player_id, entry_day)
);
GRANT SELECT (id, player_id, entry_day, buy_in, prize, status, finish_position, created_at) ON public.tournament_entries TO authenticated;
GRANT ALL ON public.tournament_entries TO service_role;
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read their tournament entry summary" ON public.tournament_entries FOR SELECT TO authenticated USING (player_id = public.current_player_id());

CREATE OR REPLACE FUNCTION public.server_enter_tournament(p_auth uuid, p_state jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pl public.players%ROWTYPE; entry_id uuid; today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 SELECT * INTO pl FROM public.players WHERE auth_id = p_auth FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Player profile not found'; END IF;
 IF pl.status <> 'active' THEN RAISE EXCEPTION 'This account is frozen'; END IF;
 IF EXISTS (SELECT 1 FROM public.tournament_entries WHERE player_id=pl.id AND entry_day=today) THEN RAISE EXCEPTION 'You have already joined today. Entry resets at midnight in the Philippines.'; END IF;
 IF EXISTS (SELECT 1 FROM public.tournament_entries WHERE player_id=pl.id AND status='active') THEN RAISE EXCEPTION 'Resume or leave your existing tournament first.'; END IF;
 IF pl.balance < 200 THEN RAISE EXCEPTION 'Your wallet needs at least PHP 200 for the tournament buy-in.'; END IF;
 INSERT INTO public.tournament_entries(player_id,entry_day,state,next_at) VALUES(pl.id,today,p_state,now()+interval '2 seconds') RETURNING id INTO entry_id;
 UPDATE public.players SET balance=balance-200 WHERE id=pl.id;
 INSERT INTO public.game_logs(level,message,player_id) VALUES('info','Tournament buy-in: PHP 200',pl.id);
 RETURN entry_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.server_enter_tournament(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_enter_tournament(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.server_save_tournament(p_auth uuid,p_entry uuid,p_version integer,p_state jsonb,p_next_at timestamptz,p_forfeit boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ent public.tournament_entries%ROWTYPE; pl_id uuid; position integer; reward numeric := 0; new_status text := 'active';
BEGIN
 SELECT id INTO pl_id FROM public.players WHERE auth_id=p_auth;
 IF pl_id IS NULL THEN RAISE EXCEPTION 'Player profile not found'; END IF;
 SELECT * INTO ent FROM public.tournament_entries WHERE id=p_entry AND player_id=pl_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tournament entry not found'; END IF;
 IF ent.version<>p_version OR ent.status<>'active' THEN RETURN false; END IF;
 IF p_forfeit THEN new_status:='forfeited';
 ELSIF coalesce((p_state->>'finished')::boolean,false) THEN
  position:=(p_state->>'finalPosition')::integer;
  IF position IS NULL OR position NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'Invalid tournament result'; END IF;
  new_status:='finished';
  IF position=2 THEN reward:=200; END IF;
 END IF;
 UPDATE public.tournament_entries SET state=p_state,version=version+1,next_at=p_next_at,status=new_status,finish_position=position,prize=reward,updated_at=now() WHERE id=ent.id;
 IF reward>0 THEN
  UPDATE public.players SET balance=balance+reward WHERE id=pl_id;
  INSERT INTO public.transactions(player_id,type,amount,method,account_details,status,admin_note,resolved_at)
  VALUES(pl_id,'bonus',reward,'bonus','Tournament: 1st runner-up','approved','PHP 200 tournament prize',now());
 END IF;
 IF new_status<>'active' THEN INSERT INTO public.game_logs(level,message,player_id) VALUES('info',format('Tournament %s; place %s; prize PHP %s',new_status,position,reward),pl_id); END IF;
 RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.server_save_tournament(uuid,uuid,integer,jsonb,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_save_tournament(uuid,uuid,integer,jsonb,timestamptz,boolean) TO service_role;