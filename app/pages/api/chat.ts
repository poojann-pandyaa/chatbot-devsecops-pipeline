import { NextApiRequest, NextApiResponse } from 'next';

const RAG_BACKEND_URL =
  process.env.RAG_BACKEND_URL || 'http://chatbot-service/chat';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body;
    const messages: { role: string; content: string }[] = body.messages || [];
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

    if (!lastUserMessage) {
      return res.status(400).json({ error: 'No user message found' });
    }

    const ragResponse = await fetch(RAG_BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lastUserMessage.content }),
    });

    if (!ragResponse.ok) {
      const errText = await ragResponse.text();
      return res.status(ragResponse.status).json({ error: `RAG backend error: ${errText}` });
    }

    const ragData = await ragResponse.json();
    const answer: string = ragData.answer || 'No answer returned.';
    const sessionId: string = ragData.session_id || '';
    const reasoning = ragData.reasoning || null;

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send meta (session_id + reasoning) as first event
    const metaChunk = JSON.stringify({ session_id: sessionId, reasoning });
    res.write(`data: ${metaChunk}\n\n`);

    // Send answer as OpenAI-compatible SSE chunk
    const answerChunk = JSON.stringify({
      choices: [{ delta: { content: answer }, finish_reason: null }],
    });
    res.write(`data: ${answerChunk}\n\n`);
    res.write('data: [DONE]\n\n');

    res.end();
  } catch (error) {
    console.error('[/api/chat] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
