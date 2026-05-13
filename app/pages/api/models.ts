import { OpenAIModelID, OpenAIModels } from '@/types/openai';
import { NextRequest, NextResponse } from 'next/server';

export const config = {
  runtime: 'edge',
};

// Return a single dummy RAG model so the frontend never calls Groq/OpenAI
const handler = async (req: NextRequest): Promise<NextResponse> => {
  const ragModel = {
    ...OpenAIModels[OpenAIModelID.GPT_3_5],
    id: OpenAIModelID.GPT_3_5,
    name: 'Reasoning-RAG (Gemma-2)',
  };

  return NextResponse.json([ragModel]);
};

export default handler;
