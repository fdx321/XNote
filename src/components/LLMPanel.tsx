import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { X, Send, Copy, Bot, User, Eraser } from 'lucide-react';
import { clsx } from 'clsx';
import { chatWithLLM } from '../utils/llm';

export const LLMPanel: React.FC = () => {
  const { 
      llmConfigs, 
      activeLLMConfigId, 
      setActiveLLMConfigId, 
      chatHistory, 
      addChatMessage, 
      updateChatMessage,
      clearChatHistory,
      toggleLLMPanel,
      chatInput,
      setChatInput,
      systemPrompts,
      activeSystemPromptId,
      setActiveSystemPromptId
  } = useAppStore();

  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConfig = llmConfigs.find(c => c.id === activeLLMConfigId);
  const activeSystemPrompt = systemPrompts?.find(p => p.id === activeSystemPromptId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const handleSend = async () => {
      if (!chatInput.trim() || !activeConfig || isSending) return;

      const userMsgId = Date.now().toString();
      const userMsg = {
          id: userMsgId,
          role: 'user' as const,
          content: chatInput,
          timestamp: Date.now()
      };

      addChatMessage(userMsg);
      setChatInput('');
      setIsSending(true);

      const botMsgId = (Date.now() + 1).toString();
      addChatMessage({
          id: botMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now()
      });

      try {
          const messages = [...chatHistory, userMsg];
          
          // Prepend system prompt if exists
          if (activeSystemPrompt) {
              messages.unshift({
                  id: 'system',
                  role: 'system',
                  content: activeSystemPrompt.content,
                  timestamp: Date.now()
              });
          }

          await chatWithLLM(messages, activeConfig, (content) => {
              updateChatMessage(botMsgId, content);
          });
      } catch (err) {
          updateChatMessage(botMsgId, `**Error**: ${String(err)}`);
      } finally {
          setIsSending(false);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  if (llmConfigs.length === 0) {
      return (
          <div className="flex flex-col h-full items-center justify-center p-6 text-center text-muted">
              <Bot size={48} className="mb-4 opacity-50" />
              <p className="mb-4">No LLM models configured.</p>
              <p className="text-xs">Go to Settings -&gt; LLM Models to add a configuration.</p>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-surface border-l border-border">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center justify-between px-3 bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0 flex-1">
              <Bot size={16} className="text-accent" />
              <select 
                  value={activeLLMConfigId || ''}
                  onChange={(e) => setActiveLLMConfigId(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm font-medium text-text truncate max-w-[120px] cursor-pointer hover:text-accent"
                  title="Select Model"
              >
                  {llmConfigs.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>

              {/* System Prompt Selector */}
              <div className="h-4 w-[1px] bg-border mx-1"></div>
              <select 
                  value={activeSystemPromptId || ''}
                  onChange={(e) => setActiveSystemPromptId(e.target.value || null)}
                  className="bg-transparent border-none outline-none text-xs text-muted hover:text-text truncate max-w-[100px] cursor-pointer"
                  title="Select System Prompt"
              >
                  <option value="">No System Prompt</option>
                  {systemPrompts?.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
          </div>
          <div className="flex items-center gap-1">
              <button onClick={clearChatHistory} className="p-1.5 text-muted hover:text-text hover:bg-surfaceHighlight rounded" title="Clear Chat">
                  <Eraser size={14} />
              </button>
              <button onClick={toggleLLMPanel} className="p-1.5 text-muted hover:text-text hover:bg-surfaceHighlight rounded">
                  <X size={14} />
              </button>
          </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {chatHistory.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted opacity-50">
                  <Bot size={32} className="mb-2" />
                  <p className="text-sm">Start a conversation</p>
              </div>
          )}
          
          {chatHistory.map((msg) => (
              <div key={msg.id} className={clsx("flex gap-3 group", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                  <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", msg.role === 'user' ? "bg-accent/20 text-accent" : "bg-surfaceHighlight text-text")}>
                      {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div className={clsx("flex-1 min-w-0 max-w-[85%]", msg.role === 'user' ? "items-end flex flex-col" : "")}>
                      <div className={clsx("relative rounded-lg p-3 text-sm prose prose-invert prose-p:my-1 prose-pre:my-1 max-w-none break-words", 
                          msg.role === 'user' ? "bg-accent/10 border border-accent/20" : "bg-background border border-border")}
                      >
                          <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeHighlight]}
                          >
                              {msg.content}
                          </ReactMarkdown>
                          
                          <button 
                              onClick={() => copyToClipboard(msg.content)}
                              className="absolute top-2 right-2 p-1 text-muted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity bg-surface/80 rounded"
                              title="Copy"
                          >
                              <Copy size={12} />
                          </button>
                      </div>
                  </div>
              </div>
          ))}
          <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border bg-background/50">
          <div className="relative">
              <textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  className="w-full bg-surface border border-border rounded-xl pl-3 pr-10 py-2 text-sm outline-none focus:border-accent min-h-[36px] max-h-[200px] resize-none"
                  rows={1}
                  style={{ height: 'auto', minHeight: '36px' }} 
              />
              <button 
                  onClick={handleSend}
                  disabled={!chatInput.trim() || isSending}
                  className={clsx("absolute right-1.5 bottom-1 h-7 w-7 flex items-center justify-center rounded-lg transition-colors", 
                      chatInput.trim() && !isSending ? "bg-accent text-white hover:opacity-90" : "text-muted bg-transparent cursor-not-allowed")}
              >
                  <Send size={14} />
              </button>
          </div>
      </div>
    </div>
  );
};
