import Head from 'next/head';
import { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const MODELS = [
  { id: 'grok',    label: 'Grok 3',         color: 'text-green-400' },
  { id: 'groq',    label: 'Llama3.3-70B',   color: 'text-orange-400' },
  { id: 'openai',  label: 'GPT-4o',         color: 'text-blue-400' },
  { id: 'mistral', label: 'Mistral Large',  color: 'text-purple-400' },
];

const EXAMPLE_QUESTIONS = [
  'How do I reverse a list in Python?',
  'Explain Kubernetes HPA in simple terms',
  'What is the difference between Docker and a VM?',
  'How does a RAG pipeline work?',
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  sessionId: string;
  model: string;
  timestamp: number;
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
          if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={pi} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
          if (part.startsWith('`') && part.endsWith('`'))
            return <code key={pi} className="bg-gray-800 text-orange-300 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
          return <span key={pi}>{part}</span>;
        })}
      </span>
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++; }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-2 text-gray-300">{items.map((item, idx) => <li key={idx}>{renderInline(item, `li-${idx}`)}</li>)}</ol>);
      continue;
    }
    if (/^[*-]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-]\s/.test(lines[i])) { items.push(lines[i].replace(/^[*-]\s/, '')); i++; }
      elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-2 text-gray-300">{items.map((item, idx) => <li key={idx}>{renderInline(item, `li-${idx}`)}</li>)}</ul>);
      continue;
    }
    if (line.trim() === '') { elements.push(<div key={`br-${i}`} className="h-2" />); }
    else { elements.push(<p key={`p-${i}`} className="text-gray-200 leading-relaxed">{renderInline(line, `p-${i}`)}</p>); }
    i++;
  }
  return <div className="space-y-1">{elements}</div>;
}

export default function Home() {
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel]         = useState('grok');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [apiKeys, setApiKeys]         = useState<Record<string, string>>({});
  const [keyInputModel, setKeyInputModel] = useState('grok');
  const [keyInputValue, setKeyInputValue] = useState('');
  const [keysSaved, setKeysSaved]         = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId]   = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-save current conversation to the list whenever messages change
  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    const firstUserMsg = messages.find((m) => m.role === 'user');
    const title = firstUserMsg ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '') : 'New Chat';
    setConversations((prev) => {
      const existing = prev.findIndex((c) => c.sessionId === sessionId);
      const conv: Conversation = { id: sessionId, title, messages: [...messages], sessionId, model, timestamp: Date.now() };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = conv;
        return updated;
      }
      return [conv, ...prev];
    });
    setActiveConvId(sessionId);
  }, [messages, sessionId]);

  const saveKey = () => {
    if (!keyInputValue.trim()) return;
    setApiKeys((prev) => ({ ...prev, [keyInputModel]: keyInputValue.trim() }));
    setKeyInputValue('');
    setKeysSaved(true);
    setTimeout(() => setKeysSaved(false), 2000);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    const sid = sessionId || uuidv4();
    if (!sessionId) setSessionId(sid);
    setMessages((prev) => [...prev, { id: uuidv4(), role: 'user', content: text }]);
    setLoading(true);
    const assistantId = uuidv4();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', model }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, message: text, model, api_key: apiKeys[model] || undefined }),
      });
      if (!res.ok) throw new Error('Backend error');
      const data = await res.json();
      setSessionId(data.session_id);
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: data.answer } : m)));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: '⚠️ Error reaching the backend. Please try again.' } : m));
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const newChat = () => {
    setMessages([]);
    setSessionId(null);
    setActiveConvId(null);
  };

  const loadConversation = (conv: Conversation) => {
    setMessages(conv.messages);
    setSessionId(conv.sessionId);
    setActiveConvId(conv.sessionId);
    setModel(conv.model);
  };

  const deleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConvId === convId) {
      setMessages([]);
      setSessionId(null);
      setActiveConvId(null);
    }
  };

  const currentModel = MODELS.find((m) => m.id === model);

  return (
    <>
      <Head>
        <title>AI Chat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="flex h-screen bg-[#0f1117] text-gray-100 font-sans">

        {/* SIDEBAR */}
        {sidebarOpen && (
          <aside className="w-64 flex-shrink-0 bg-[#161b22] border-r border-gray-800 flex flex-col">

            {/* Logo */}
            <div className="px-5 py-4 border-b border-gray-800">
              <div className="text-lg font-bold text-white tracking-tight">AI Chat</div>
              <div className="text-xs text-gray-500 mt-0.5">Multi-model assistant</div>
            </div>

            {/* New Chat */}
            <div className="px-3 py-3">
              <button onClick={newChat} className="w-full text-sm bg-[#21262d] hover:bg-[#30363d] border border-gray-700 text-gray-300 rounded-lg px-3 py-2 transition-colors">
                + New Chat
              </button>
            </div>

            {/* Conversation History */}
            {conversations.length > 0 && (
              <div className="px-3 py-2 border-t border-gray-800 flex-1 overflow-y-auto">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">History</div>
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => loadConversation(conv)}
                      className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-between group ${
                        activeConvId === conv.id ? 'bg-[#21262d] border border-gray-600' : 'hover:bg-[#21262d] border border-transparent'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-300 truncate">{conv.title}</div>
                        <div className="text-gray-600 text-[10px] mt-0.5">
                          {MODELS.find((m) => m.id === conv.model)?.label} · {conv.messages.length} msgs
                        </div>
                      </div>
                      <span
                        onClick={(e) => deleteConversation(conv.id, e)}
                        className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-2 text-sm transition-opacity cursor-pointer"
                      >×</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Default Model */}
            <div className="px-4 py-3 border-t border-gray-800">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Default Model</div>
              <div className="space-y-1">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                      model === m.id ? 'bg-[#21262d] border border-gray-600' : 'hover:bg-[#21262d] border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={m.color}>●</span>
                      <span className="text-gray-300">{m.label}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {model === m.id && <span className="text-gray-400 text-xs">✓</span>}
                      {apiKeys[m.id] && <span className="text-green-500 text-xs">🔑</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* API Keys */}
            <div className="px-4 py-3 border-t border-gray-800">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">API Keys</div>
              <select
                value={keyInputModel}
                onChange={(e) => setKeyInputModel(e.target.value)}
                className="w-full text-xs bg-[#21262d] border border-gray-700 text-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 mb-2"
              >
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <input
                type="password"
                value={keyInputValue}
                onChange={(e) => setKeyInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                placeholder="Paste API key..."
                className="w-full text-xs bg-[#21262d] border border-gray-700 text-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 mb-2 placeholder-gray-600"
              />
              <button
                onClick={saveKey}
                disabled={!keyInputValue.trim()}
                className="w-full text-xs bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg px-3 py-2 transition-colors"
              >
                {keysSaved ? '✓ Saved' : 'Save Key'}
              </button>

              {Object.keys(apiKeys).length > 0 && (
                <div className="mt-3 space-y-1">
                  {Object.entries(apiKeys).map(([mid, key]) => {
                    const label = MODELS.find((m) => m.id === mid)?.label ?? mid;
                    return (
                      <div key={mid} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{label}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-green-500 font-mono">{key.slice(0, 6)}...</span>
                          <button
                            onClick={() => setApiKeys((prev) => { const n = { ...prev }; delete n[mid]; return n; })}
                            className="text-gray-600 hover:text-red-400"
                          >×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </aside>
        )}

        {/* MAIN */}
        <div className="flex flex-1 flex-col min-w-0">

          {/* Header */}
          <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-[#0f1117]">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white text-lg">☰</button>
            <div className="flex-1">
              <span className="text-sm font-semibold text-white">AI Chat</span>
              <span className={`ml-2 text-xs ${currentModel?.color ?? 'text-gray-500'}`}>{currentModel?.label}</span>
            </div>
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-8">
                <div className="text-center">
                  <div className="text-4xl mb-3">💬</div>
                  <h1 className="text-2xl font-bold text-white mb-2">What can I help with?</h1>
                  <p className="text-gray-500 text-sm">Ask me anything — select your model and optionally add your API key</p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button key={q} onClick={() => sendMessage(q)} className="text-left text-sm bg-[#161b22] hover:bg-[#21262d] border border-gray-800 hover:border-gray-600 text-gray-300 rounded-xl px-4 py-3 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-2xl w-full ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                    {msg.role === 'user' ? (
                      <div className="bg-[#1f6feb] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-lg">{msg.content}</div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold">AI</div>
                        <div className="flex-1 space-y-1">
                          <div className="bg-[#161b22] border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed">
                            {msg.content ? renderMarkdown(msg.content) : (
                              <span className="inline-flex gap-1">
                                <span className="animate-bounce">·</span>
                                <span className="animate-bounce" style={{ animationDelay: '0.15s' }}>·</span>
                                <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>·</span>
                              </span>
                            )}
                          </div>
                          {msg.model && <div className="text-xs text-gray-600 ml-1">{MODELS.find((m) => m.id === msg.model)?.label ?? msg.model}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-4 border-t border-gray-800 bg-[#0f1117]">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-3 bg-[#161b22] border border-gray-700 hover:border-gray-600 focus-within:border-blue-500/50 rounded-2xl px-4 py-3 transition-colors">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${currentModel?.label ?? 'AI'}...`}
                  className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none outline-none max-h-32"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
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
