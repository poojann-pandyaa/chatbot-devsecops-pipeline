import { Conversation, Message } from '@/types/chat';
import { KeyValuePair } from '@/types/data';
import { ErrorMessage } from '@/types/error';
import { OpenAIModel, OpenAIModelID } from '@/types/openai';
import { Plugin } from '@/types/plugin';
import { Prompt } from '@/types/prompt';
import { throttle } from '@/utils';
import { IconArrowDown, IconClearAll } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import {
  FC,
  MutableRefObject,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ChatLoader } from './ChatLoader';
import { ChatMessage } from './ChatMessage';
import { ErrorMessageDiv } from './ErrorMessageDiv';
import { ChatInput } from './ChatInput';

interface Props {
  conversation: Conversation;
  models: OpenAIModel[];
  apiKey: string;
  serverSideApiKeyIsSet: boolean;
  defaultModelId: OpenAIModelID;
  messageIsStreaming: boolean;
  modelError: ErrorMessage | null;
  loading: boolean;
  prompts: Prompt[];
  onSend: (message: Message, deleteCount: number, plugin: Plugin | null) => void;
  onUpdateConversation: (conversation: Conversation, data: KeyValuePair) => void;
  onEditMessage: (message: Message, messageIndex: number) => void;
  stopConversationRef: MutableRefObject<boolean>;
}

export const Chat: FC<Props> = memo(
  ({
    conversation,
    apiKey,
    serverSideApiKeyIsSet,
    defaultModelId,
    messageIsStreaming,
    modelError,
    loading,
    prompts,
    onSend,
    onUpdateConversation,
    onEditMessage,
    stopConversationRef,
  }) => {
    const { t } = useTranslation('chat');
    const [currentMessage, setCurrentMessage] = useState<Message>();
    const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true);
    const [showScrollDownButton, setShowScrollDownButton] = useState<boolean>(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback(() => {
      if (autoScrollEnabled) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        textareaRef.current?.focus();
      }
    }, [autoScrollEnabled]);

    const handleScroll = () => {
      if (chatContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        const bottomTolerance = 30;
        if (scrollTop + clientHeight < scrollHeight - bottomTolerance) {
          setAutoScrollEnabled(false);
          setShowScrollDownButton(true);
        } else {
          setAutoScrollEnabled(true);
          setShowScrollDownButton(false);
        }
      }
    };

    const handleScrollDown = () => {
      chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    };

    const onClearAll = () => {
      if (confirm(t<string>('Are you sure you want to clear all messages?'))) {
        onUpdateConversation(conversation, { key: 'messages', value: [] });
      }
    };

    const scrollDown = () => {
      if (autoScrollEnabled) messagesEndRef.current?.scrollIntoView(true);
    };
    const throttledScrollDown = throttle(scrollDown, 250);

    useEffect(() => {
      throttledScrollDown();
      setCurrentMessage(conversation.messages[conversation.messages.length - 2]);
    }, [conversation.messages, throttledScrollDown]);

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          setAutoScrollEnabled(entry.isIntersecting);
          if (entry.isIntersecting) textareaRef.current?.focus();
        },
        { root: null, threshold: 0.5 },
      );
      const messagesEndElement = messagesEndRef.current;
      if (messagesEndElement) observer.observe(messagesEndElement);
      return () => { if (messagesEndElement) observer.unobserve(messagesEndElement); };
    }, [messagesEndRef]);

    return (
      <div className="relative flex-1 overflow-hidden bg-white dark:bg-[#343541]">
        {modelError ? (
          <ErrorMessageDiv error={modelError} />
        ) : (
          <>
            <div className="max-h-full overflow-x-hidden" ref={chatContainerRef} onScroll={handleScroll}>
              {conversation.messages.length === 0 ? (
                <div className="mx-auto flex h-full w-[350px] flex-col justify-center space-y-6 pt-32 sm:w-[600px]">
                  <div className="text-center text-3xl font-bold text-gray-800 dark:text-gray-100">
                    Reasoning-RAG Chatbot
                  </div>
                  <div className="text-center text-base text-gray-500 dark:text-gray-400">
                    Powered by FAISS + BM25 + Cross-Encoder + Gemma-2
                  </div>
                  <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-4 text-sm text-gray-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-gray-300">
                    <p className="mb-2 font-semibold">Ask any Stack Overflow question, for example:</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>What is a stack overflow error?</li>
                      <li>How do I reverse a list in Python?</li>
                      <li>What is the difference between == and === in JavaScript?</li>
                      <li>How does garbage collection work in Java?</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-center border border-b-neutral-300 bg-neutral-100 py-2 text-sm text-neutral-500 dark:border-none dark:bg-[#444654] dark:text-neutral-200">
                    Reasoning-RAG &nbsp;·&nbsp; Gemma-2-2b-it &nbsp;·&nbsp; Stack Overflow Q&amp;A
                    <button className="ml-2 cursor-pointer hover:opacity-50" onClick={onClearAll}>
                      <IconClearAll size={18} />
                    </button>
                  </div>

                  {conversation.messages.map((message, index) => (
                    <ChatMessage
                      key={index}
                      message={message}
                      messageIndex={index}
                      onEditMessage={onEditMessage}
                    />
                  ))}

                  {loading && <ChatLoader />}

                  <div className="h-[162px] bg-white dark:bg-[#343541]" ref={messagesEndRef} />
                </>
              )}
            </div>

            <ChatInput
              stopConversationRef={stopConversationRef}
              textareaRef={textareaRef}
              messageIsStreaming={messageIsStreaming}
              conversationIsEmpty={conversation.messages.length === 0}
              model={conversation.model}
              prompts={prompts}
              onSend={(message, plugin) => {
                setCurrentMessage(message);
                onSend(message, 0, plugin);
              }}
              onRegenerate={() => {
                if (currentMessage) onSend(currentMessage, 2, null);
              }}
            />
          </>
        )}
        {showScrollDownButton && (
          <div className="absolute bottom-0 right-0 mb-4 mr-4 pb-20">
            <button
              className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-300 text-gray-800 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-neutral-200"
              onClick={handleScrollDown}
            >
              <IconArrowDown size={18} />
            </button>
          </div>
        )}
      </div>
    );
  },
);
Chat.displayName = 'Chat';
