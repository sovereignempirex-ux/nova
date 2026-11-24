import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ImagePlus,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { ChatModelInfo, novaApi } from '../lib/apiClient';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { usePageMeta } from '../hooks/usePageMeta';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  model: string;
  imageUrls?: string[];
  createdAtMs: number;
}

interface ChatThread {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  messageCount: number;
  updatedAtMs: number;
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const AiStudioPage: React.FC = () => {
  usePageMeta(
    'AI Studio — NOVA',
    'Stream responses from Gemini, Free AI Custom Qwen 7B, and Nezuko models with bilingual support, image input, and cloud-synced history.',
    '/ai-studio'
  );

  const { user, authReady } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const [models, setModels] = useState<ChatModelInfo[]>([
    {
      id: 'auto:free-chat',
      provider: 'nova_router',
      label: 'Auto Free Router (Best Verified Free Model)',
      description: 'Automatically routes to verified working free-tier chat providers (Free AI Custom, Pollinations, Nezuko, or free env keys).',
      tier: 'free',
      supportsThinking: false,
      supportsImageInput: false,
      supportsImageOutput: true,
      supportsStreaming: true,
      verified: true,
    },
  ]);
  const [selectedModel, setSelectedModel] = useState('auto:free-chat');
  const [thinkingLevel, setThinkingLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are NOVA, a clear, accurate technical and creative assistant in the Vanitas ecosystem.'
  );
  const [showConfig, setShowConfig] = useState(false);

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [guestStore, setGuestStore] = useState<Record<string, ChatMessage[]>>({});

  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<{
    base64: string;
    mimeType: string;
    previewUrl: string;
    name: string;
  } | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingImages, setStreamingImages] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [failedSubmission, setFailedSubmission] = useState<{
    prompt: string;
    image: { base64: string; mimeType: string; previewUrl: string; name: string } | null;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    novaApi.chat
      .getModels()
      .then((data) => {
        if (data.models?.length) {
          setModels(data.models);
          setSelectedModel((prev) =>
            data.models.some((m) => m.id === prev)
              ? prev
              : data.models.find((m) => m.id === 'auto:free-chat')?.id || data.models[0].id
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setThreads([]);
      setActiveThreadId(null);
      return;
    }
    const path = `users/${user.uid}/chats`;
    const q = query(
      collection(db, 'users', user.uid, 'chats'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChatThread[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || 'New Conversation'),
            model: String(data.model || 'gemini-4-hydrogen'),
            systemPrompt: String(data.systemPrompt || ''),
            messageCount: Number(data.messageCount || 0),
            updatedAtMs: data.updatedAt?.toMillis?.() ?? Date.now(),
          };
        });
        setThreads(list);
        if (list.length > 0 && !activeThreadId) {
          setActiveThreadId(list[0].id);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, user, activeThreadId]);

  useEffect(() => {
    if (!user || !activeThreadId) {
      if (!user && activeThreadId) {
        setMessages(guestStore[activeThreadId] ?? []);
      } else {
        setMessages([]);
      }
      return;
    }

    const path = `users/${user.uid}/chats/${activeThreadId}/messages`;
    const q = query(
      collection(db, 'users', user.uid, 'chats', activeThreadId, 'messages'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChatMessage[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            role: data.role === 'model' ? 'model' : 'user',
            content: String(data.content || ''),
            model: String(data.model || 'gemini-4-hydrogen'),
            createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
          };
        });
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [user, activeThreadId, guestStore]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText, streamingImages.length]);

  const activeModelMeta = models.find((m) => m.id === selectedModel);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrorMsg('Please choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setErrorMsg('Attached image must be 6 MB or smaller.');
      return;
    }

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const commaIdx = reader.result.indexOf(',');
        const base64 = commaIdx >= 0 ? reader.result.slice(commaIdx + 1) : '';
        setAttachedImage({
          base64,
          mimeType: file.type,
          previewUrl: reader.result,
          name: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const startNewChat = () => {
    if (isStreaming) return;
    setActiveThreadId(null);
    setMessages([]);
    setErrorMsg(null);
    setFailedSubmission(null);
  };

  const deleteThread = async (threadId: string) => {
    if (isStreaming) return;
    if (user) {
      const path = `users/${user.uid}/chats/${threadId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'chats', threadId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      setGuestStore((prev) => {
        const copy = { ...prev };
        delete copy[threadId];
        return copy;
      });
    }
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
      setMessages([]);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const submitPrompt = async (
    rawPrompt: string,
    imageOverride?: { base64: string; mimeType: string; previewUrl: string; name: string } | null
  ) => {
    const prompt = rawPrompt.trim();
    if (!prompt || isStreaming) return;

    setErrorMsg(null);
    setFailedSubmission(null);
    setInput('');
    const currentImage = imageOverride !== undefined ? imageOverride : attachedImage;
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    let threadId = activeThreadId;
    const isNewThread = !threadId;
    const threadTitle = prompt.slice(0, 64);
    const userMsgId = makeId('msg');

    if (!threadId) {
      threadId = makeId('chat');
      setActiveThreadId(threadId);
    }

    const userDisplayContent = currentImage
      ? `${prompt}\n\n[Attached image: ${currentImage.name}]`
      : prompt;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: userDisplayContent,
      model: selectedModel,
      imageUrls: currentImage ? [currentImage.previewUrl] : undefined,
      createdAtMs: Date.now(),
    };

    const historyForRequest = [...messages, { ...userMessage, content: prompt }].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (user && user.emailVerified) {
      const chatPath = `users/${user.uid}/chats/${threadId}`;
      try {
        if (isNewThread) {
          await setDoc(doc(db, 'users', user.uid, 'chats', threadId), {
            userId: user.uid,
            title: threadTitle,
            model: selectedModel.slice(0, 64),
            systemPrompt: systemPrompt.slice(0, 1000),
            messageCount: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(doc(db, 'users', user.uid, 'chats', threadId), {
            messageCount: messages.length + 1,
            updatedAt: serverTimestamp(),
          });
        }

        await setDoc(doc(db, 'users', user.uid, 'chats', threadId, 'messages', userMsgId), {
          userId: user.uid,
          chatId: threadId,
          role: 'user',
          content: userDisplayContent.slice(0, 32000),
          model: selectedModel.slice(0, 64),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, chatPath);
      }
    } else {
      if (isNewThread) {
        const newThread: ChatThread = {
          id: threadId,
          title: threadTitle,
          model: selectedModel,
          systemPrompt,
          messageCount: 1,
          updatedAtMs: Date.now(),
        };
        setThreads((prev) => [newThread, ...prev]);
      }
      setGuestStore((prev) => ({
        ...prev,
        [threadId!]: [...(prev[threadId!] ?? []), userMessage],
      }));
    }

    setIsStreaming(true);
    setStreamingText('');
    setStreamingImages([]);
    const controller = new AbortController();
    abortRef.current = controller;

    let assembled = '';
    const collectedImages: string[] = [];

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          messages: historyForRequest,
          systemInstruction: systemPrompt,
          thinkingLevel,
          lang,
          imageBase64: currentImage?.base64,
          imageMimeType: currentImage?.mimeType,
        }),
      });

      if (!response.ok || !response.body) {
        const errBody = await response.json().catch(() => ({ error: 'Streaming request failed.' }));
        throw new Error(errBody.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const ev of events) {
          const line = ev.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            url?: string;
            message?: string;
          };
          if (payload.type === 'delta' && payload.text) {
            assembled += payload.text;
            setStreamingText(assembled);
          } else if (payload.type === 'image' && payload.url) {
            collectedImages.push(payload.url);
            setStreamingImages([...collectedImages]);
          } else if (payload.type === 'error') {
            throw new Error(payload.message || 'Model stream returned an error.');
          }
        }
      }

      const imageMarkdownLinks =
        collectedImages.length > 0
          ? `\n\n${collectedImages.map((u, idx) => `![Generated Output ${idx + 1}](${u})`).join('\n')}`
          : '';
      const finalContent = `${assembled}${imageMarkdownLinks}`.trim();

      if (finalContent.length > 0) {
        const modelMsgId = makeId('msg');
        if (user && user.emailVerified) {
          const msgPath = `users/${user.uid}/chats/${threadId}/messages/${modelMsgId}`;
          try {
            await setDoc(doc(db, 'users', user.uid, 'chats', threadId, 'messages', modelMsgId), {
              userId: user.uid,
              chatId: threadId,
              role: 'model',
              content: finalContent.slice(0, 32000),
              model: selectedModel.slice(0, 64),
              createdAt: serverTimestamp(),
            });
            await updateDoc(doc(db, 'users', user.uid, 'chats', threadId), {
              messageCount: historyForRequest.length + 1,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, msgPath);
          }
        } else {
          const modelMsg: ChatMessage = {
            id: modelMsgId,
            role: 'model',
            content: assembled || 'Generated image output:',
            imageUrls: collectedImages.length > 0 ? collectedImages : undefined,
            model: selectedModel,
            createdAtMs: Date.now(),
          };
          setGuestStore((prev) => ({
            ...prev,
            [threadId!]: [...(prev[threadId!] ?? []), modelMsg],
          }));
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to stream response.');
        setFailedSubmission({ prompt, image: currentImage });
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setStreamingImages([]);
      abortRef.current = null;
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    void submitPrompt(input);
  };

  const handleRetryFailed = () => {
    if (!failedSubmission || isStreaming) return;
    void submitPrompt(failedSubmission.prompt, failedSubmission.image);
  };

  const copyContent = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row gap-6">
      {/* Thread History Column */}
      <aside className="w-full lg:w-64 shrink-0 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] overflow-hidden max-h-48 lg:max-h-none">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t('conversations')}
          </span>
          <button
            type="button"
            onClick={startNewChat}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('newChat')}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads.length === 0 ? (
            <p className="p-3 text-xs text-slate-500 dark:text-slate-400">
              {user
                ? 'No saved conversations yet. Send a prompt to begin.'
                : 'Session conversations appear here. Sign in with Google to save across devices.'}
            </p>
          ) : (
            threads.map((th) => (
              <div
                key={th.id}
                className={`group flex items-center gap-1 rounded-lg pe-1 text-xs transition-colors ${
                  activeThreadId === th.id
                    ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400 font-medium'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveThreadId(th.id)}
                  className="flex-1 min-w-0 text-start px-3 py-2 truncate rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {th.title}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteThread(th.id)}
                  aria-label={`Delete ${th.title}`}
                  className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 p-1.5 rounded hover:text-red-500 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Chat Workspace */}
      <section className="flex-1 flex flex-col min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] overflow-hidden">
        {/* Controls Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="ai-model-select" className="sr-only">
              AI Model
            </label>
            <select
              id="ai-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.tier === 'paid' ? 'Paid Key' : 'Free'})
                </option>
              ))}
            </select>

            {/* Language Switcher for API lang param */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0D1017] border border-slate-200 dark:border-slate-800">
              {(['en', 'ar'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    lang === code
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {code === 'en' ? 'EN' : 'AR'}
                </button>
              ))}
            </div>

            {activeModelMeta?.supportsThinking && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0D1017] border border-slate-200 dark:border-slate-800">
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setThinkingLevel(lvl)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      thinkingLevel === lvl
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {lvl.charAt(0) + lvl.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('systemPrompt')}</span>
          </button>
        </div>

        {/* Active Model Metadata Bar */}
        {activeModelMeta && (
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800/70 bg-slate-50/70 dark:bg-[#0D1017]/60 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700 dark:text-slate-300">{activeModelMeta.label}</span>
            <span aria-hidden="true">·</span>
            <span>{activeModelMeta.description}</span>
            {activeModelMeta.supportsImageOutput && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-blue-600 dark:text-blue-400">SSE Text-to-Image enabled</span>
              </>
            )}
            {activeModelMeta.supportsImageInput && (
              <>
                <span aria-hidden="true">·</span>
                <span>Image upload supported</span>
              </>
            )}
          </div>
        )}

        {showConfig && (
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] space-y-2">
            <label htmlFor="system-prompt-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              System Instruction
            </label>
            <textarea
              id="system-prompt-input"
              rows={2}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11151E] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
          {messages.length === 0 && !streamingText && streamingImages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
              <MessageSquare className="w-8 h-8 text-blue-500" aria-hidden="true" />
              <div className="space-y-1.5">
                <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                  NOVA AI Studio
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Switch seamlessly between Google Gemini, Free AI Custom Qwen 7B (SSE chat &amp; image), and Nezuko Gemini / Qwen 7B in Arabic or English.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-2">
                {[
                  'Compare WebSockets vs Server-Sent Events for live AI streaming',
                  'اشرح الفرق بين الذكاء الاصطناعي التوليدي والتعلم العميق باختصار',
                ].map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => setInput(starter)}
                    className="text-start p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:border-blue-500/60 transition-colors"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{msg.role === 'user' ? 'You' : msg.model}</span>
                    {msg.role === 'model' && (
                      <button
                        type="button"
                        onClick={() => copyContent(msg.id, msg.content)}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors"
                        aria-label="Copy response"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <div
                    className={`max-w-3xl rounded-xl px-4 py-3 text-sm leading-relaxed space-y-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    )}

                    {msg.imageUrls && msg.imageUrls.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {msg.imageUrls.map((url, idx) => (
                          <div
                            key={`${msg.id}-img-${idx}`}
                            className="rounded-lg overflow-hidden border border-slate-200/30 bg-slate-950"
                          >
                            <img
                              src={url}
                              alt={`Model output ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full max-h-72 object-contain"
                            />
                            {msg.role === 'model' && (
                              <div className="px-2.5 py-1.5 bg-slate-900 flex justify-end">
                                <a
                                  href={url}
                                  download={`nova-chat-${msg.id}-${idx + 1}.png`}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300"
                                >
                                  <Download className="w-3 h-3" aria-hidden="true" />
                                  <span>Download</span>
                                </a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {(streamingText || streamingImages.length > 0) && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{selectedModel}</span>
                    <span aria-hidden="true">·</span>
                    <span>Streaming</span>
                  </div>
                  <div className="max-w-3xl rounded-xl px-4 py-3 text-sm leading-relaxed border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 space-y-3">
                    {streamingText && (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                      </div>
                    )}
                    {streamingImages.map((url, idx) => (
                      <div key={`stream-img-${idx}`} className="rounded-lg overflow-hidden bg-slate-950">
                        <img
                          src={url}
                          alt={`Streaming generated image ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full max-h-72 object-contain"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Error Display */}
        {errorMsg && (
          <div className="mx-4 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-red-600 dark:text-red-400">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="break-words">{errorMsg}</p>
            </div>
            {failedSubmission && (
              <button
                type="button"
                onClick={handleRetryFailed}
                disabled={isStreaming}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-500/40 bg-red-500/15 font-semibold hover:bg-red-500/25 transition-colors shrink-0"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>{t('retry')}</span>
              </button>
            )}
          </div>
        )}

        {/* Attached Image Preview */}
        {attachedImage && (
          <div className="mx-4 mb-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={attachedImage.previewUrl}
                alt={attachedImage.name}
                className="w-10 h-10 rounded object-cover shrink-0 bg-slate-900"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                {attachedImage.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setAttachedImage(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-red-500"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('clearImage')}</span>
            </button>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => void handleSend(e)}
          className="p-3 lg:p-4 border-t border-slate-200 dark:border-slate-800 flex items-end gap-2.5"
        >
          {activeModelMeta?.supportsImageInput && (
            <label
              className="inline-flex items-center justify-center p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors shrink-0"
              title={t('attachImage')}
              aria-label={t('attachImage')}
            >
              <ImagePlus className="w-4 h-4" aria-hidden="true" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageSelect}
                className="sr-only"
              />
            </label>
          )}

          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend(e);
              }
            }}
            placeholder={
              lang === 'ar'
                ? 'اكتب رسالتك إلى NOVA AI Studio...'
                : 'Message NOVA AI Studio... (Enter to send, Shift+Enter for new line)'
            }
            className="flex-1 resize-none rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-4 h-4" aria-hidden="true" />
              <span>{t('stop')}</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4 rtl:scale-x-[-1]" aria-hidden="true" />
              <span>{t('send')}</span>
            </button>
          )}
        </form>
      </section>
    </div>
  );
};
