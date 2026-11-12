import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, UserRound, Volume2, VolumeX } from 'lucide-react';
import type { ChatMessage } from '@/poker/chat';
import { quickMessageOptions } from '@/poker/chat';
import { useSoundSetting } from '@/hooks/useTableSounds';
import { Button } from '@/components/ui/button';

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<boolean>;
  sending?: boolean;
  error?: string | null;
  title?: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function ChatBox({ messages, onSend, collapsed, onToggle, sending, error, title = 'Table Chat' }: ChatBoxProps) {
  const [input, setInput] = useState('');
  const [soundOn, setSoundOn] = useSoundSetting();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (await onSend(trimmed)) setInput('');
  }

  return (
    <section aria-label={title} className="flex min-w-0 flex-col rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <Button variant="ghost" size="sm"
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="gap-1.5 text-xs font-semibold"
        >
          <MessageCircle className="h-4 w-4 text-primary" />
          {title}
          <span className="ml-1 text-xs tabular-nums text-muted-foreground">
            {messages.length}
          </span>
        </Button>
        <Button variant="ghost" size="icon"
          type="button"
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
          }}
          className="h-8 w-8 text-muted-foreground"
          aria-label={soundOn ? 'Mute sounds' : 'Enable sounds'}
          title={soundOn ? 'Mute sounds' : 'Enable sounds'}
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsed && (
        <>
          <div ref={scrollRef} role="log" aria-live="polite" className="h-40 space-y-2 overflow-y-auto px-3 py-2">
            {messages.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Wala pang mensahe.
              </p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex items-start gap-1.5 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                  <div className="mt-0.5 shrink-0">
                    {msg.isSystem ? (
                      <span className="text-[10px] text-muted-foreground">SYS</span>
                    ) : msg.isBot ? null : (
                      <UserRound className="h-3 w-3 text-primary" />
                    )}
                  </div>
                  <div className={`max-w-[85%] break-words rounded-lg px-2 py-1.5 text-xs ${msg.isMe ? 'bg-primary/15 text-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {!msg.isSystem && !msg.isMe && (
                      <span className="mr-1 font-semibold opacity-70">
                        {msg.author}
                        :
                      </span>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))
            )}
          </div>

          {error && <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-1 border-t border-border px-2 py-2">
            {quickMessageOptions().map((quick) => (
              <Button variant="outline" size="sm"
                key={quick}
                type="button"
                disabled={sending}
                onClick={() => void send(quick)}
                className="h-8 whitespace-normal px-2 text-xs"
              >
                {quick}
              </Button>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
            className="flex items-center gap-1.5 border-t border-border px-2 py-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Chat message"
              placeholder="Mensahe…"
              maxLength={120}
              className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <Button size="icon"
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              title="Send message"
              className="h-10 w-10 shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
