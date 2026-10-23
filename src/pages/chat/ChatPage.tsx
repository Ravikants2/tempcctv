import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { Bot, Loader2, MessageCircle, RotateCcw, Send, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { buildChatContext, sendChatMessage, type ChatTurn } from '../../utils/chat';

const suggestions = [
  'How many installation records are there?',
  'Summarize installations by zone.',
  'Which installations have no scheduled exam candidates?',
];

function renderInlineFormatting(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isTableDivider(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

export function AssistantAnswer({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index++;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index++;
      }
      blocks.push(
        <div key={`table-${index}`} className="my-3 max-w-full overflow-x-auto rounded-lg border border-gray-200">
          <SortableTable className="min-w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-blue-50 text-gray-700">
              <tr>{headers.map((cell, cellIndex) => (
                <th key={cellIndex} className="whitespace-nowrap border-b px-3 py-2 font-semibold">
                  {renderInlineFormatting(cell)}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="even:bg-gray-50">
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex} className="border-b border-gray-100 px-3 py-2 align-top">
                      {renderInlineFormatting(row[cellIndex] || '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </SortableTable>
        </div>
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h3' : 'h4';
      blocks.push(
        <Tag key={`heading-${index}`} className="mb-1 mt-3 font-semibold text-gray-900">
          {renderInlineFormatting(heading[2])}
        </Tag>
      );
      index++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index++;
      }
      blocks.push(
        <ul key={`list-${index}`} className="my-2 list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineFormatting(item)}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
        index++;
      }
      blocks.push(
        <ol key={`ordered-${index}`} className="my-2 list-decimal space-y-1 pl-5">
          {items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineFormatting(item)}</li>)}
        </ol>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()
      && !/^#{1,3}\s+/.test(lines[index].trim())
      && !/^[-*]\s+/.test(lines[index].trim())
      && !/^\d+[.)]\s+/.test(lines[index].trim())
      && !(lines[index].includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1]))) {
      paragraph.push(lines[index].trim());
      index++;
    }
    blocks.push(<p key={`paragraph-${index}`} className="my-1">{renderInlineFormatting(paragraph.join(' '))}</p>);
  }

  return <div className="min-w-0 leading-6">{blocks}</div>;
}

export default function ChatPage() {
  const { currentUser, data } = useAuth();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || isSending) return;

    const history = messages.slice(-10);
    setMessages(previous => [...previous, { role: 'user', text: question }]);
    setInput('');
    setError('');
    setIsSending(true);

    try {
      const answer = await sendChatMessage(question, buildChatContext(data, question), history);
      setMessages(previous => [...previous, { role: 'model', text: answer }]);
    } catch (cause) {
      setMessages(previous => previous.slice(0, -1));
      setError(cause instanceof Error ? cause.message : 'Unable to get a response from the chat service.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Chat with your app data</h1>
          <p className="mt-1 text-sm text-gray-600">
            Ask questions about the current requirements, vendors, installations, and exam schedules.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setMessages([]); setError(''); }}
          disabled={messages.length === 0 || isSending}
        >
          <RotateCcw size={14} /> New chat
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white px-4 py-3 text-xs text-gray-600">
        <span>
          Signed in as <span className="font-semibold text-gray-800">{currentUser?.name}</span>
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <span>{data.requirements.length} requirements</span>
          <span>{data.vendors.length} vendors</span>
          <span>{data.installations.length} installations</span>
          <span>{data.examDates.length} exam dates</span>
        </span>
      </div>

      <div className="flex min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg shadow-gray-200/60">
        <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
          <span className="rounded-xl bg-blue-700 p-2 text-white shadow-sm"><Bot size={18} /></span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Data assistant</p>
            <p className="text-xs text-gray-500">Ask a question or continue the conversation</p>
          </div>
          <span className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-500" title="Ready" />
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-gray-50/70 to-white p-4 sm:p-6" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex min-h-[22rem] flex-col items-center justify-center px-2 text-center">
              <div className="mb-4 rounded-2xl bg-blue-700 p-4 text-white shadow-lg shadow-blue-200">
                <MessageCircle size={24} />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">What would you like to know?</h2>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                Ask about requirements, vendors, installations, costs, or exam schedules. You can ask follow-up questions too.
              </p>
              <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                {suggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex gap-2.5 sm:gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'model' && (
                <span className="mt-1 h-fit rounded-xl bg-blue-700 p-2 text-white shadow-sm"><Bot size={16} /></span>
              )}
              <div
                className={`max-w-[94%] min-w-0 break-words rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[88%] ${
                  message.role === 'user'
                    ? 'rounded-br-md bg-blue-700 text-white'
                    : 'rounded-bl-md border border-gray-100 bg-white text-gray-800'
                }`}
              >
                {message.role === 'model' ? <AssistantAnswer text={message.text} /> : message.text}
              </div>
              {message.role === 'user' && (
                <span className="mt-1 h-fit rounded-xl bg-gray-200 p-2 text-gray-600"><UserRound size={16} /></span>
              )}
            </div>
          ))}
          {isSending && (
            <div className="flex items-center gap-2.5 text-sm text-gray-500">
              <span className="rounded-xl bg-blue-700 p-2 text-white"><Bot size={16} /></span>
              <span className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <Loader2 size={15} className="animate-spin text-blue-700" /> Agent is preparing a response…
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div role="alert" className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submitMessage} className="border-t bg-white p-3 sm:p-4">
          <label className="sr-only" htmlFor="chat-message">Your question</label>
          <div className="flex items-end gap-2 rounded-2xl border border-gray-300 bg-gray-50 p-2 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
            <textarea
              id="chat-message"
              rows={2}
              maxLength={2000}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Message your data assistant…"
              className="max-h-40 min-h-11 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400"
              disabled={isSending}
            />
            <Button
              type="submit"
              disabled={isSending || !input.trim()}
              aria-label="Send message"
              className="mb-0.5 h-10 w-10 shrink-0 rounded-xl p-0"
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
          <p className="px-2 pt-2 text-[11px] text-gray-400">Enter to send · Shift+Enter for a new line</p>
        </form>
      </div>
    </section>
  );
}
