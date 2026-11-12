import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage } from '@/poker/chat';
import { errorMessage } from '@/lib/format';

export function usePlayerChat(room: string, playerId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let alive = true;
    setMessages([]);
    const load = async () => {
      const { data, error: readError } = await supabase.from('player_chat_messages').select('*').eq('room', room).order('created_at', { ascending: false }).limit(60);
      if (!alive) return;
      if (readError) { setError(errorMessage(readError)); return; }
      setMessages((data ?? []).reverse().map((row) => ({ id: row.id, author: row.author, text: row.body, timestamp: Date.parse(row.created_at), isMe: row.player_id === playerId, isBot: false, isSystem: false })));
    };
    void load();
    const channel = supabase.channel(`chat-${room}-${crypto.randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'player_chat_messages', filter: `room=eq.${room}` }, () => void load()).subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [room, playerId]);
  const send = useCallback(async (text: string) => {
    const body = text.trim();
    if (!body || body.length > 120 || inFlight.current) return false;
    inFlight.current = true; setSending(true); setError(null);
    try {
      const { data, error: sendError } = await supabase.from('player_chat_messages').insert({ room, player_id: playerId, body }).select().single();
      if (sendError) throw sendError;
      setMessages((previous) => previous.some((m) => m.id === data.id) ? previous : [...previous, { id: data.id, author: data.author, text: data.body, timestamp: Date.parse(data.created_at), isMe: true, isBot: false, isSystem: false }].slice(-60));
      return true;
    } catch (err) { setError(errorMessage(err)); return false; }
    finally { inFlight.current = false; setSending(false); }
  }, [room, playerId]);
  return { messages, send, sending, error };
}