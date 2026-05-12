import Head from 'next/head';
import { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const MODELS = [
  { id: 'grok',    label: 'Grok 3',         color: 'text-green-400' },
  { id: 'openai',  label: 'GPT-4o',          color: 'text-blue-400' },
  { id: 'groq',    label: 'Llama3-70B',      color: 'text-orange-400' },
  { id: 'mistral', label: 'Mistral Large',   color: 'text-purple-400' },
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

export default function Home() {
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel]         = useState('grok');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');

    const sid = sessionId || uuidv4();
    if (!sessionId) setSessionId(sid);

    const userMsg: ChatMessage = { id: uuidv4(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const assistantId = uuidv4();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', model }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, message: text, model }),
      });

      if (!res.ok) throw new Error('Backend error');
      const data = await res.json();

      setSessionId(data.session_id);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: data.answer } : m)),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '⚠️ Error reaching the backend. Please try again.' }
            : m,
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
  };

  const currentModel = MODELS.find((m) => m.id === model);

  return (
    <>
      <Head>
        <title>AI Chatbot</title>
        <meta name="description" content="Multi-model AI Chatbot" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="flex h-screen bg-[#0f1117] text-gray-100 font-sans">

        {/* SIDEBAR */}
        {sidebarOpen && (
          <aside className="w-64 flex-shrink-0 bg-[#161b22] border-r border-gray-800 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-800">
              <div className="text-lg font-bold text-white tracking-tight">💬 AI Chatbot</div>
              <div className="text-xs text-gray-500 mt-0.5">Multi-model · Redis sessions</div>
            </div>

            <div className="px-3 py-3">
              <button
                onClick={newChat}
                className="w-full text-sm bg-[#21262d] hover:bg-[#30363d] border border-gray-700 text-gray-300 rounded-lg px-3 py-2 transition-colors"
              >
                + New Chat
              </button>
            </div>

            {/* Model Selector */}
            <div className="px-4 py-3 border-t border-gray-800">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Model</div>
              <div className="space-y-1">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors ${
                      model === m.id
                        ? 'bg-[#21262d] border border-gray-600'
                        : 'hover:bg-[#21262d] border border-transparent'
                    }`}
                  >
                    <span className={m.color}>●</span>
                    <span className="ml-2 text-gray-300">{m.label}</span>
                    {model === m.id && <span className="ml-1 text-gray-500">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Session Info */}
            <div className="px-4 py-3 border-t border-gray-800">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Session</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Session ID</span>
                  <span className="text-gray-300 font-mono truncate max-w-[100px]">
                    {sessionId ? sessionId.slice(0, 8) + '...' : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Messages</span>
                  <span className="text-gray-300">{messages.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">History</span>
                  <span className="text-green-400">Redis ✓</span>
                </div>
              </div>
            </div>

            {/* Infrastructure */}
            <div className="px-4 py-3 border-t border-gray-800">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Infrastructure</div>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Backend',       status: 'K8s Pod' },
                  { label: 'Cache',         status: 'Redis Pod' },
                  { label: 'Orchestration', status: 'Minikube' },
                  { label: 'CI/CD',         status: 'Jenkins' },
                ].map(({ label, status }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="text-green-400">{status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-auto px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
              SPE Project · May 2026
            </div>
          </aside>
        )}

        {/* MAIN CHAT AREA */}
        <div className="flex flex-1 flex-col min-w-0">

          {/* Top bar */}
          <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-[#0f1117]">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-400 hover:text-white transition-colors text-lg"
            >
              ☰
            </button>
            <div className="flex-1">
              <span className="text-sm font-semibold text-white">AI Chatbot</span>
              <span className={`ml-2 text-xs ${currentModel?.color ?? 'text-gray-500'}`}>
                {currentModel?.label}
              </span>
            </div>
            {sessionId && (
              <span className="text-xs font-mono text-gray-600 bg-[#161b22] px-2 py-1 rounded border border-gray-800">
                session: {sessionId.slice(0, 8)}
              </span>
            )}
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-8">
                <div className="text-center">
                  <div className="text-4xl mb-3">💬</div>
                  <h1 className="text-2xl font-bold text-white mb-2">AI Chatbot</h1>
                  <p className="text-gray-500 text-sm">Multi-model · Redis session history · Running on Kubernetes</p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left text-sm bg-[#161b22] hover:bg-[#21262d] border border-gray-800 hover:border-gray-600 text-gray-300 rounded-xl px-4 py-3 transition-all"
                    >
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
                      <div className="bg-[#1f6feb] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-lg">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold">AI</div>
                        <div className="flex-1 space-y-1">
                          <div className="bg-[#161b22] border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                            {msg.content || (
                              <span className="inline-flex gap-1">
                                <span className="animate-bounce">·</span>
                                <span className="animate-bounce" style={{ animationDelay: '0.15s' }}>·</span>
                                <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>·</span>
                              </span>
                            )}
                          </div>
                          {msg.model && (
                            <div className="text-xs text-gray-600 ml-1">
                              {MODELS.find((m) => m.id === msg.model)?.label ?? msg.model}
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
                  placeholder={`Message ${currentModel?.label}...`}
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
              <p className="text-center text-xs text-gray-700 mt-2">
                Multi-model AI Chatbot · Redis session history · Kubernetes
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  },
});
