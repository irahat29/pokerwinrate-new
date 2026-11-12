import { useEffect, useMemo, useRef, useState } from 'react';
import { aiTableTalk, makeAiMessage, type ChatMessage } from '@/poker/chat';
import type { TableState } from '@/poker/types';

/**
 * AI seats chat now and then at any table. Their messages are marked isBot,
 * so ChatBox always labels them "AI" and players know who they are talking to.
 */
export function useBotChat(table: TableState | null, active: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const botNames = useMemo(
    () => (table?.seats ?? []).filter((seat): seat is NonNullable<typeof seat> => !!seat && seat.isBot && !seat.sittingOut).map((seat) => seat.name),
    [table],
  );
  const namesRef = useRef<string[]>([]);
  namesRef.current = botNames;
  const hasBots = botNames.length > 0;
  useEffect(() => {
    if (!active || !hasBots) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        const names = namesRef.current;
        if (names.length > 0) {
          const name = names[Math.floor(Math.random() * names.length)]!;
          setMessages((previous) => [...previous, makeAiMessage({ name }, aiTableTalk())].slice(-30));
        }
        schedule();
      }, 12000 + Math.random() * 18000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [active, hasBots]);
  return messages;
}
