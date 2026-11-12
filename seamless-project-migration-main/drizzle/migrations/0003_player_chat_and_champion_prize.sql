ALTER TABLE public.tournament_entries DROP CONSTRAINT tournament_entries_prize_check;
ALTER TABLE public.tournament_entries ADD CONSTRAINT tournament_entries_prize_check CHECK (prize IN (0,200,2000));
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
  IF position=1 THEN reward:=2000; ELSIF position=2 THEN reward:=200; END IF;
 END IF;
 UPDATE public.tournament_entries SET state=p_state,version=version+1,next_at=p_next_at,status=new_status,finish_position=position,prize=reward,updated_at=now() WHERE id=ent.id;
 IF reward>0 THEN
  UPDATE public.players SET balance=balance+reward WHERE id=pl_id;
  INSERT INTO public.transactions(player_id,type,amount,method,account_details,status,admin_note,resolved_at)
  VALUES(pl_id,'bonus',reward,'bonus',CASE WHEN position=1 THEN 'Tournament: Champion' ELSE 'Tournament: 1st runner-up' END,'approved',format('PHP %s tournament prize',reward),now());
 END IF;
 IF new_status<>'active' THEN INSERT INTO public.game_logs(level,message,player_id) VALUES('info',format('Tournament %s; place %s; prize PHP %s',new_status,position,reward),pl_id); END IF;
 RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.server_save_tournament(uuid,uuid,integer,jsonb,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_save_tournament(uuid,uuid,integer,jsonb,timestamptz,boolean) TO service_role;
CREATE TABLE public.player_chat_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room text NOT NULL CHECK (length(room) BETWEEN 1 AND 50),
 player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
 author text NOT NULL DEFAULT '',
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 120),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.player_chat_messages TO authenticated;
GRANT INSERT(room,player_id,body) ON public.player_chat_messages TO authenticated;
GRANT ALL ON public.player_chat_messages TO service_role;
ALTER TABLE public.player_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in players read chat" ON public.player_chat_messages FOR SELECT TO authenticated USING (public.current_player_id() IS NOT NULL);
CREATE POLICY "Players send own messages" ON public.player_chat_messages FOR INSERT TO authenticated WITH CHECK (player_id=public.current_player_id());
CREATE INDEX player_chat_room_time_idx ON public.player_chat_messages(room,created_at DESC);
CREATE OR REPLACE FUNCTION public.validate_player_chat() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pl public.players%ROWTYPE;
BEGIN
 SELECT * INTO pl FROM public.players WHERE id=NEW.player_id FOR UPDATE;
 IF NOT FOUND OR pl.status<>'active' THEN RAISE EXCEPTION 'Chat is unavailable for this account'; END IF;
 IF NEW.room <> 'tournament' AND NOT EXISTS (SELECT 1 FROM public.poker_tables WHERE 'cash:' || id::text=NEW.room) THEN RAISE EXCEPTION 'Invalid chat room'; END IF;
 IF EXISTS (SELECT 1 FROM public.player_chat_messages WHERE player_id=NEW.player_id AND created_at>now()-interval '2 seconds') THEN RAISE EXCEPTION 'Please wait a moment before sending again'; END IF;
 NEW.author:=pl.display_name; NEW.body:=btrim(NEW.body); NEW.created_at:=now();
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.validate_player_chat() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_player_chat_before_insert BEFORE INSERT ON public.player_chat_messages FOR EACH ROW EXECUTE FUNCTION public.validate_player_chat();
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_chat_messages;