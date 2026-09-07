/**
 * Painel de chat. Fica ativo o jogo inteiro, independente de turno — por
 * isso nao consulta `myTurn` nem `snapshot` em nenhum momento (requisito 4
 * da lista de funcionalidades exigidas, docs/01-visao-de-produto.md).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Color } from '../shared/protocol.js';
import type { ChatEntry } from './useMatch.js';

const SEAT_LABEL: Record<ChatEntry['from'], string> = {
  W: 'Brancas',
  B: 'Pretas',
  system: 'Sistema',
};

export function Chat({
  messages,
  me,
  onSend,
}: {
  messages: ChatEntry[];
  me: Color | null;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const bottom = useRef<HTMLLIElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <section className="chat">
      <h2>Chat</h2>
      <ul className="chat-log">
        {messages.map((m, i) => (
          <li key={i} className={`chat-msg ${m.from === me ? 'mine' : ''} ${m.from === 'system' ? 'system' : ''}`}>
            <b>{SEAT_LABEL[m.from]}</b> {m.text}
          </li>
        ))}
        <li ref={bottom} />
      </ul>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensagem para o adversario"
          maxLength={500}
          aria-label="mensagem de chat"
        />
        <button type="submit" disabled={!text.trim()}>
          Enviar
        </button>
      </form>
    </section>
  );
}
