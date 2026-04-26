export interface OpenAIModel {
  id: string;
  name: string;
  maxLength: number;
  tokenLimit: number;
}

export enum OpenAIModelID {
  GPT_3_5 = 'gpt-3.5-turbo',
  GPT_4 = 'gpt-4',
  LLAMA3_70B = 'llama-3.3-70b-versatile',
  LLAMA3_8B = 'llama-3.1-8b-instant',
  MIXTRAL = 'mixtral-8x7b-32768',
}

export const fallbackModelID = OpenAIModelID.LLAMA3_70B;

export const OpenAIModels: Record<OpenAIModelID, OpenAIModel> = {
  [OpenAIModelID.GPT_3_5]: {
    id: OpenAIModelID.GPT_3_5,
    name: 'GPT-3.5',
    maxLength: 12000,
    tokenLimit: 4000,
  },
  [OpenAIModelID.GPT_4]: {
    id: OpenAIModelID.GPT_4,
    name: 'GPT-4',
    maxLength: 24000,
    tokenLimit: 8000,
  },
  [OpenAIModelID.LLAMA3_70B]: {
    id: OpenAIModelID.LLAMA3_70B,
    name: 'Llama 3.3 70B',
    maxLength: 24000,
    tokenLimit: 8000,
  },
  [OpenAIModelID.LLAMA3_8B]: {
    id: OpenAIModelID.LLAMA3_8B,
    name: 'Llama 3.1 8B',
    maxLength: 12000,
    tokenLimit: 4000,
  },
  [OpenAIModelID.MIXTRAL]: {
    id: OpenAIModelID.MIXTRAL,
    name: 'Mixtral 8x7B',
    maxLength: 24000,
    tokenLimit: 8000,
  },
};
