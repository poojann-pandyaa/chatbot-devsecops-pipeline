import Head from 'next/head';
import { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface Source {
  text: string;
}

interface Reasoning {
  type: string;
  sub_questions: string[];
  sources: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: Reasoning;
  showSources?: boolean;
}

const EXAMPLE_QUESTIONS = [
  'What is a stack overflow error?',
  'How do I reverse a list in Python?',
  'Difference between == and === in JavaScript?',
  'How does garbage collection work in Java?',
];

const REASONING_COLORS: Record<string, string> = {
  commonsense: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  sql: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  multihop: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  default: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleSources = (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, showSources: !m.showSources } : m)),
    );
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');

    const userMsg: ChatMessage = { id: uuidv4(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          model: { id: 'rag', name: 'RAG', maxLength: 4000, tokenLimit: 4000 },
          key: 'rag-backend',
          prompt: '',
        }),
      });

      if (!res.ok || !res.body) throw new Error('Backend error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let ragMeta: { reasoning?: Reasoning; session_id?: string } = {};

      const assistantId = uuidv4();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '' },
      ]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);

        // Parse SSE lines
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              // Check for meta payload (session_id, reasoning)
              if (parsed.session_id) {
                ragMeta = parsed;
                if (parsed.session_id) setSessionId(parsed.session_id);
              } else if (parsed.choices?.[0]?.delta?.content) {
                fullText += parsed.choices[0].delta.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullText } : m,
                  ),
                );
              }
            } catch {}
          }
        }
      }

      // Attach reasoning/sources to assistant message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: fullText, reasoning: ragMeta.reasoning }
            : m,
        ),
      );
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant',
          content: '⚠️ Error reaching the RAG backend. Please try again.',
        },
      ]);
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

  const reasoningColor = (type?: string) =>
    type ? REASONING_COLORS[type] ?? REASONING_COLORS.default : '';

  return (
    <>
      <Head>
        <title>Reasoning-RAG Chatbot</title>
        <meta name="description" content="Stack Overflow Q&A — FAISS + BM25 + Gemma-2" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="flex h-screen bg-[#0f1117] text-gray-100 font-sans">

        {/* SIDEBAR */}
        {sidebarOpen && (
          <aside className="w-64 flex-shrink-0 bg-[#161b22] border-r border-gray-800 flex flex-col">
            {/* Logo */}
            <div className="px-5 py-4 border-b border-gray-800">
              <div className="text-lg font-bold text-white tracking-tight">⚡ RAG Chatbot</div>
              <div className="text-xs text-gray-500 mt-0.5">Stack Overflow Q&A</div>
            </div>

            {/* New Chat */}
            <div className="px-3 py-3">
              <button
                onClick={() => { setMessages([]); setSessionId(null); }}
                className="w-full text-sm bg-[#21262d] hover:bg-[#30363d] border border-gray-700 text-gray-300 rounded-lg px-3 py-2 transition-colors"
              >
                + New Chat
              </button>
            </div>

            {/* Pipeline Info */}
            <div className="px-4 py-3 border-t border-gray-800">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Pipeline</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">LLM</span>
                  <span className="text-gray-300">gemma-2-2b-it</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Retrieval</span>
                  <span className="text-gray-300">FAISS + BM25</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Reranker</span>
                  <span className="text-gray-300">MiniLM-L6</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Classifier</span>
                  <span className="text-gray-300">flan-t5-base</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Provider</span>
                  <span className="text-gray-300">HF Inference</span>
                </div>
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
                  { label: 'Backend', status: 'K8s Pod' },
                  { label: 'Cache', status: 'Redis Pod' },
                  { label: 'Orchestration', status: 'Minikube' },
                  { label: 'CI/CD', status: 'Jenkins' },
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
              <span className="text-sm font-semibold text-white">Reasoning-RAG</span>
              <span className="ml-2 text-xs text-gray-500">Stack Overflow Q&A · Gemma-2 · FAISS+BM25</span>
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
                  <div className="text-4xl mb-3">⚡</div>
                  <h1 className="text-2xl font-bold text-white mb-2">Reasoning-RAG Chatbot</h1>
                  <p className="text-gray-500 text-sm">FAISS + BM25 + Cross-Encoder + Gemma-2 · Running on Kubernetes</p>
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
                  <div className={`max-w-2xl w-full ${
                    msg.role === 'user' ? 'flex justify-end' : ''
                  }`}>
                    {msg.role === 'user' ? (
                      <div className="bg-[#1f6feb] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-lg">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="space-y-2 w-full">
                        {/* Avatar + content */}
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold">R</div>
                          <div className="flex-1 bg-[#161b22] border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-200 leading-relaxed">
                            {msg.content || (
                              <span className="inline-flex gap-1">
                                <span className="animate-bounce">·</span>
                                <span className="animate-bounce" style={{ animationDelay: '0.15s' }}>·</span>
                                <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>·</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Reasoning badge + sources toggle */}
                        {msg.reasoning && (
                          <div className="ml-10 flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${reasoningColor(msg.reasoning.type)}`}>
                              🧠 {msg.reasoning.type}
                            </span>
                            {msg.reasoning.sources?.length > 0 && (
                              <button
                                onClick={() => toggleSources(msg.id)}
                                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                              >
                                {msg.showSources ? '▲ hide sources' : `▼ ${msg.reasoning.sources.length} sources`}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Sources panel */}
                        {msg.showSources && msg.reasoning?.sources && (
                          <div className="ml-10 space-y-2">
                            {msg.reasoning.sources.map((src, i) => (
                              <div key={i} className="text-xs bg-[#0d1117] border border-gray-800 rounded-lg px-3 py-2 text-gray-400 leading-relaxed">
                                <span className="text-gray-600 mr-2">#{i + 1}</span>
                                {src.length > 200 ? src.slice(0, 200) + '...' : src}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold">R</div>
                  <div className="bg-[#161b22] border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                    <span className="inline-flex gap-1 text-gray-400">
                      <span className="animate-bounce text-lg">·</span>
                      <span className="animate-bounce text-lg" style={{ animationDelay: '0.15s' }}>·</span>
                      <span className="animate-bounce text-lg" style={{ animationDelay: '0.3s' }}>·</span>
                    </span>
                  </div>
                </div>
              </div>
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
                  placeholder="Ask a Stack Overflow question..."
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
                Powered by Reasoning-RAG · FAISS + BM25 + Cross-Encoder · Redis session history
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
