import { recordHttpRequest } from '@/utils/server/metrics';

export const config = {
  runtime: 'nodejs',
};

const RAG_BACKEND_URL =
  process.env.RAG_BACKEND_URL || 'http://chatbot-service/chat';

const handler = async (req: Request): Promise<Response> => {
  const finishRequest = recordHttpRequest();

  if (req.method !== 'POST') {
    finishRequest();
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await req.json();

    // Extract the latest user message from the messages array
    const messages: { role: string; content: string }[] = body.messages || [];
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'user');

    if (!lastUserMessage) {
      finishRequest();
      return new Response(JSON.stringify({ error: 'No user message found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Call the RAG backend
    const ragResponse = await fetch(RAG_BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lastUserMessage.content }),
    });

    if (!ragResponse.ok) {
      const errText = await ragResponse.text();
      finishRequest();
      return new Response(
        JSON.stringify({ error: `RAG backend error: ${errText}` }),
        { status: ragResponse.status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const ragData = await ragResponse.json();
    const answer: string = ragData.answer || 'No answer returned.';

    // Return as OpenAI-compatible streaming response so the existing
    // frontend Chat component works without changes
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send answer as a single SSE chunk then close
        const chunk = JSON.stringify({
          choices: [{ delta: { content: answer }, finish_reason: null }],
        });
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    finishRequest();
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[/api/chat] Error:', error);
    finishRequest();
    return new Response('Internal Server Error', { status: 500 });
  }
};

export default handler;
