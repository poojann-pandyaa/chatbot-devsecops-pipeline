import Head from 'next/head';
import { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const MODELS = [
  { id: 'grok', label: 'Grok 3', color: 'text-green-400' },
  { id: 'llama', label: 'Llama3.3-70B', color: 'text-orange-400' },
  { id: 'openai', label: 'GPT-4o', color: 'text-blue-400' },
  { id: 'mistral', label: 'Mistral Large', color: 'text-purple-400' },
];

const EXAMPLE_QUESTIONS = [
  'How do I reverse a list in Python?',
  'Explain Kubernetes HPA in simple terms',
  'What is the difference between Docker and a VM?',
  'How does a RAG pipeline work?',
];

const USER_ID_STORAGE_KEY = 'chat_user_id';
const ACTIVE_SESSION_STORAGE_KEY = 'chat_active_session_id';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

interface ConversationSummary {
  session_id: string;
  title: string;
  model: string;
  updated_at: number;
  message_count: number;
}

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let i = 0;

  const renderInline = (line: string, key: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <span key={key}>
        {parts.map((part, pi) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pi} className="font-semibold text-white">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code key={pi} className="rounded bg-gray-800 px-1 font-mono text-xs text-orange-300">
                {part.slice(1, -1)}
              </code>
            );
          }
          return <span key={pi}>{part}</span>;
        })}
      </span>
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2 list-inside list-decimal space-y-1 text-gray-300">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `li-${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^[*-]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[*-]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2 list-inside list-disc space-y-1 text-gray-300">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `li-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} className="h-2" />);
    } else {
      elements.push(
        <p key={`p-${i}`} className="leading-relaxed text-gray-200">
          {renderInline(line, `p-${i}`)}
        </p>,
      );
    }
    i++;
  }
  return <div className="space-y-1">{elements}</div>;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [model, setModel] = useState('grok');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [storedKeys, setStoredKeys] = useState<Record<string, string>>({});
  const [keyInputModel, setKeyInputModel] = useState('grok');
  const [keyInputValue, setKeyInputValue] = useState('');
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchStoredKeys = async (resolvedUserId: string) => {
    const res = await fetch(`/api/keys?user_id=${encodeURIComponent(resolvedUserId)}`);
    const data = await res.json();
    setStoredKeys(data.providers || {});
  };

  const fetchSessions = async (resolvedUserId: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(resolvedUserId)}`);
    const data = await res.json();
    setConversations(data.sessions || []);
  };

  const loadConversation = async (nextSessionId: string) => {
    const res = await fetch(`/api/session/${encodeURIComponent(nextSessionId)}`);
    const data = await res.json();
    if (!data.found) {
      return;
    }
    setMessages(
      (data.history || []).map((entry: { role: 'user' | 'assistant'; msg: string }, index: number) => ({
        id: `${nextSessionId}-${index}`,
        role: entry.role,
        content: entry.msg,
        model: entry.role === 'assistant' ? data.model : undefined,
      })),
    );
    setSessionId(nextSessionId);
    setActiveConvId(nextSessionId);
    setModel(data.model || 'grok');
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, nextSessionId);
  };

  useEffect(() => {
    const storedUserId = localStorage.getItem(USER_ID_STORAGE_KEY) || uuidv4();
    localStorage.setItem(USER_ID_STORAGE_KEY, storedUserId);
    setUserId(storedUserId);

    const restore = async () => {
      await fetchStoredKeys(storedUserId);
      await fetchSessions(storedUserId);
      const existingSessionId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (existingSessionId) {
        await loadConversation(existingSessionId);
      }
    };

    restore().catch(() => undefined);
  }, []);

  const saveKey = async () => {
    if (!userId || !keyInputValue.trim()) {
      return;
    }

    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        provider: keyInputModel,
        api_key: keyInputValue.trim(),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setKeyStatus('Failed to save key');
      return;
    }

    setStoredKeys((prev) => ({ ...prev, [keyInputModel]: data.masked_key }));
    setKeyInputValue('');
    setKeyStatus(`Saved ${MODELS.find((m) => m.id === keyInputModel)?.label ?? keyInputModel} key`);
    setTimeout(() => setKeyStatus(null), 2000);
  };

  const clearStoredKey = async (provider: string) => {
    if (!userId) {
      return;
    }
    await fetch(`/api/keys?user_id=${encodeURIComponent(userId)}&provider=${encodeURIComponent(provider)}`, {
      method: 'DELETE',
    });
    setStoredKeys((prev) => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !userId) {
      return;
    }

    setInput('');
    const sid = sessionId || uuidv4();
    if (!sessionId) {
      setSessionId(sid);
      setActiveConvId(sid);
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sid);
    }

    setMessages((prev) => [...prev, { id: uuidv4(), role: 'user', content: text }]);
    setLoading(true);

    const assistantId = uuidv4();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', model }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sid,
          user_id: userId,
          message: text,
          model,
        }),
      });

      if (!res.ok) {
        throw new Error('Backend error');
      }

      const data = await res.json();
      setSessionId(data.session_id);
      setActiveConvId(data.session_id);
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, data.session_id);
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === assistantId ? { ...entry, content: data.answer, model: data.model } : entry,
        ),
      );
      await fetchSessions(userId);
    } catch {
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === assistantId
            ? { ...entry, content: 'Error reaching the backend. Check key storage and provider config.' }
            : entry,
        ),
      );
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const newChat = () => {
    setMessages([]);
    setSessionId(null);
    setActiveConvId(null);
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/session/${encodeURIComponent(convId)}`, { method: 'DELETE' });
    setConversations((prev) => prev.filter((c) => c.session_id !== convId));
    if (activeConvId === convId) {
      setMessages([]);
      setSessionId(null);
      setActiveConvId(null);
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    }
  };

  const currentModel = MODELS.find((m) => m.id === model);

  return (
    <>
      <Head>
        <title>AI Chat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="flex h-screen bg-[#0f1117] font-sans text-gray-100">
        {sidebarOpen && (
          <aside className="flex w-64 flex-shrink-0 flex-col border-r border-gray-800 bg-[#161b22]">
            <div className="border-b border-gray-800 px-5 py-4">
              <div className="text-lg font-bold tracking-tight text-white">AI Chat</div>
              <div className="mt-0.5 text-xs text-gray-500">Vault-backed keys, Redis-backed sessions</div>
            </div>

            <div className="px-3 py-3">
              <button
                onClick={newChat}
                className="w-full rounded-lg border border-gray-700 bg-[#21262d] px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-[#30363d]"
              >
                + New Chat
              </button>
            </div>

            {conversations.length > 0 && (
              <div className="flex-1 overflow-y-auto border-t border-gray-800 px-3 py-2">
                <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">History</div>
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <button
                      key={conv.session_id}
                      onClick={() => loadConversation(conv.session_id)}
                      className={`group flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        activeConvId === conv.session_id
                          ? 'border-gray-600 bg-[#21262d]'
                          : 'border-transparent hover:bg-[#21262d]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-gray-300">{conv.title}</div>
                        <div className="mt-0.5 text-[10px] text-gray-600">
                          {MODELS.find((m) => m.id === conv.model)?.label ?? conv.model} · {conv.message_count} msgs
                        </div>
                      </div>
                      <span
                        onClick={(e) => deleteConversation(conv.session_id, e)}
                        className="ml-2 cursor-pointer text-sm text-gray-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-800 px-4 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Default Model</div>
              <div className="space-y-1">
                {MODELS.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setModel(entry.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                      model === entry.id ? 'border border-gray-600 bg-[#21262d]' : 'border border-transparent hover:bg-[#21262d]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={entry.color}>●</span>
                      <span className="text-gray-300">{entry.label}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {model === entry.id && <span className="text-xs text-gray-400">✓</span>}
                      {storedKeys[entry.id] && <span className="text-xs text-green-500">Vault</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-800 px-4 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">API Keys</div>
              <select
                value={keyInputModel}
                onChange={(e) => setKeyInputModel(e.target.value)}
                className="mb-2 w-full rounded-lg border border-gray-700 bg-[#21262d] px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
              >
                {MODELS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <input
                type="password"
                value={keyInputValue}
                onChange={(e) => setKeyInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                placeholder="Store key in Vault..."
                className="mb-2 w-full rounded-lg border border-gray-700 bg-[#21262d] px-3 py-2 text-xs text-gray-200 outline-none placeholder-gray-600 focus:border-blue-500"
              />
              <button
                onClick={saveKey}
                disabled={!keyInputValue.trim() || !userId}
                className="w-full rounded-lg bg-blue-700 px-3 py-2 text-xs text-white transition-colors hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500"
              >
                Save Key Securely
              </button>
              {keyStatus && <div className="mt-2 text-xs text-green-400">{keyStatus}</div>}
              {Object.keys(storedKeys).length > 0 && (
                <div className="mt-3 space-y-1">
                  {Object.entries(storedKeys).map(([provider, maskedKey]) => {
                    const label = MODELS.find((entry) => entry.id === provider)?.label ?? provider;
                    return (
                      <div key={provider} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-green-500">{maskedKey}</span>
                          <button onClick={() => clearStoredKey(provider)} className="text-gray-600 hover:text-red-400">
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-gray-800 bg-[#0f1117] px-4 py-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-lg text-gray-400 hover:text-white">
              ☰
            </button>
            <div className="flex-1">
              <span className="text-sm font-semibold text-white">AI Chat</span>
              <span className={`ml-2 text-xs ${currentModel?.color ?? 'text-gray-500'}`}>{currentModel?.label}</span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-6">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center space-y-8">
                <div className="text-center">
                  <div className="mb-3 text-4xl">💬</div>
                  <h1 className="mb-2 text-2xl font-bold text-white">What can I help with?</h1>
                  <p className="text-sm text-gray-500">Save a model key once, then keep using the same Redis-backed session after refresh.</p>
                </div>
                <div className="grid w-full max-w-xl grid-cols-2 gap-3">
                  {EXAMPLE_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      onClick={() => sendMessage(question)}
                      className="rounded-xl border border-gray-800 bg-[#161b22] px-4 py-3 text-left text-sm text-gray-300 transition-all hover:border-gray-600 hover:bg-[#21262d]"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`w-full max-w-2xl ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                    {msg.role === 'user' ? (
                      <div className="max-w-lg rounded-2xl rounded-tr-sm bg-[#1f6feb] px-4 py-3 text-sm text-white">{msg.content}</div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold">
                          AI
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="rounded-2xl rounded-tl-sm border border-gray-800 bg-[#161b22] px-4 py-3 text-sm leading-relaxed">
                            {msg.content ? (
                              renderMarkdown(msg.content)
                            ) : (
                              <span className="inline-flex gap-1">
                                <span className="animate-bounce">.</span>
                                <span className="animate-bounce" style={{ animationDelay: '0.15s' }}>
                                  .
                                </span>
                                <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>
                                  .
                                </span>
                              </span>
                            )}
                          </div>
                          {msg.model && (
                            <div className="ml-1 text-xs text-gray-600">
                              {MODELS.find((entry) => entry.id === msg.model)?.label ?? msg.model}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-800 bg-[#0f1117] px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-3 rounded-2xl border border-gray-700 bg-[#161b22] px-4 py-3 transition-colors hover:border-gray-600 focus-within:border-blue-500/50">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${currentModel?.label ?? 'AI'}...`}
                  className="max-h-32 flex-1 resize-none bg-transparent text-sm text-gray-200 outline-none placeholder-gray-600"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="flex-shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500"
                >
                  {loading ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
