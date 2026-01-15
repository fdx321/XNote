import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, type AppTheme, type LLMConfig, type SystemPrompt } from '../store';
import { clsx } from 'clsx';
import { Trash2, Plus, Check, Monitor, Keyboard, Bot, MessageSquare } from 'lucide-react';

const formatShortcutSymbols = (shortcut: string) => {
  const parts = shortcut.split('+').filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (k === 'cmd') out.push('⌘');
    else if (k === 'ctrl') out.push('⌃');
    else if (k === 'alt') out.push('⌥');
    else if (k === 'shift') out.push('⇧');
    else out.push(p.length === 1 ? p.toUpperCase() : p);
  }
  return out.join('');
};

const normalizeMainKey = (key: string) => {
  if (!key) return '';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  if (key.startsWith('Arrow')) return key.replace('Arrow', '');
  return key[0].toUpperCase() + key.slice(1);
};

const buildShortcutString = (e: KeyboardEvent) => {
  const mods: string[] = [];
  if (e.metaKey) mods.push('Cmd');
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const main = normalizeMainKey(e.key);
  if (!main || ['Meta', 'Control', 'Alt', 'Shift'].includes(main)) return null;
  return [...mods, main].join('+');
};

interface SettingsModalProps {
  isOpen: boolean;
  searchShortcut: string;
  closeEditorShortcut: string;
  theme: AppTheme;
  onClose: () => void;
  onSave: (next: { searchShortcut: string; closeEditorShortcut: string; theme: AppTheme }) => void;
}

const THEME_OPTIONS: Array<{ value: AppTheme; label: string; hint: string }> = [
  { value: 'zinc', label: 'Zinc', hint: 'Neutral dark' },
  { value: 'midnight', label: 'Midnight', hint: 'Blue-tinted dark' },
  { value: 'grape', label: 'Grape', hint: 'Purple-tinted dark' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, searchShortcut, closeEditorShortcut, theme, onClose, onSave }) => {
  const { llmConfigs, activeLLMConfigId, setLLMConfigs, setActiveLLMConfigId, systemPrompts, activeSystemPromptId, setSystemPrompts, setActiveSystemPromptId } = useAppStore();
  const [activeTab, setActiveTab] = useState<'general' | 'shortcuts' | 'llm' | 'prompts'>('general');

  const [value, setValue] = useState(searchShortcut || 'Cmd+G');
  const [closeValue, setCloseValue] = useState('Cmd+W');
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingClose, setIsRecordingClose] = useState(false);
  const [themeValue, setThemeValue] = useState<AppTheme>(theme || 'zinc');
  
  const [localConfigs, setLocalConfigs] = useState<LLMConfig[]>([]);
  const [localActiveId, setLocalActiveId] = useState<string | null>(null);

  const [localPrompts, setLocalPrompts] = useState<SystemPrompt[]>([]);
  const [localActivePromptId, setLocalActivePromptId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const closeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue(searchShortcut || 'Cmd+G');
    setCloseValue(closeEditorShortcut || 'Cmd+W');
    setIsRecording(false);
    setIsRecordingClose(false);
    setThemeValue(theme || 'zinc');
    setLocalConfigs(JSON.parse(JSON.stringify(llmConfigs)));
    setLocalActiveId(activeLLMConfigId);
    setLocalPrompts(JSON.parse(JSON.stringify(systemPrompts || [])));
    setLocalActivePromptId(activeSystemPromptId);
    setActiveTab('general');
  }, [isOpen, searchShortcut, closeEditorShortcut, theme, llmConfigs, activeLLMConfigId, systemPrompts, activeSystemPromptId]);

  const displayKey = useMemo(() => {
    const v = value || 'Cmd+G';
    return formatShortcutSymbols(v);
  }, [value]);

  const displayCloseKey = useMemo(() => {
    const v = closeValue || 'Cmd+W';
    return formatShortcutSymbols(v);
  }, [closeValue]);

  useEffect(() => {
    if (!isOpen || !isRecording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const next = buildShortcutString(e);
      if (!next) return;
      setValue(next);
      setIsRecording(false);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, isRecording]);

  useEffect(() => {
    if (!isOpen || !isRecordingClose) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const next = buildShortcutString(e);
      if (!next) return;
      setCloseValue(next);
      setIsRecordingClose(false);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, isRecordingClose]);

  const handleAddConfig = () => {
      const newConfig: LLMConfig = {
          id: Date.now().toString(),
          name: 'New Model',
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          modelId: 'gpt-3.5-turbo',
          type: 'text'
      };
      setLocalConfigs([...localConfigs, newConfig]);
      if (!localActiveId) {
          setLocalActiveId(newConfig.id);
      }
  };

  const handleUpdateConfig = (id: string, updates: Partial<LLMConfig>) => {
      setLocalConfigs(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleDeleteConfig = (id: string) => {
      setLocalConfigs(prev => prev.filter(c => c.id !== id));
      if (localActiveId === id) {
          setLocalActiveId(null);
      }
  };

  const handleAddPrompt = () => {
    const newPrompt: SystemPrompt = {
        id: Date.now().toString(),
        name: 'New Prompt',
        content: 'You are a helpful assistant.'
    };
    setLocalPrompts([...localPrompts, newPrompt]);
  };

  const handleUpdatePrompt = (id: string, updates: Partial<SystemPrompt>) => {
    setLocalPrompts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleDeletePrompt = (id: string) => {
    setLocalPrompts(prev => prev.filter(p => p.id !== id));
    if (localActivePromptId === id) {
        setLocalActivePromptId(null);
    }
  };

  const handleSave = () => {
    onSave({ searchShortcut: value || 'Cmd+G', closeEditorShortcut: closeValue || 'Cmd+W', theme: themeValue || 'zinc' });
    setLLMConfigs(localConfigs);
    setActiveLLMConfigId(localActiveId);
    setSystemPrompts(localPrompts);
    setActiveSystemPromptId(localActivePromptId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        className="w-[700px] h-[500px] bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 border-r border-border bg-background/50 flex flex-col p-2 gap-1">
                <button
                    onClick={() => setActiveTab('general')}
                    className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors", activeTab === 'general' ? "bg-surfaceHighlight text-text" : "text-muted hover:text-text hover:bg-surfaceHighlight/50")}
                >
                    <Monitor size={16} /> General
                </button>
                <button
                    onClick={() => setActiveTab('shortcuts')}
                    className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors", activeTab === 'shortcuts' ? "bg-surfaceHighlight text-text" : "text-muted hover:text-text hover:bg-surfaceHighlight/50")}
                >
                    <Keyboard size={16} /> Shortcuts
                </button>
                <button
                    onClick={() => setActiveTab('llm')}
                    className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors", activeTab === 'llm' ? "bg-surfaceHighlight text-text" : "text-muted hover:text-text hover:bg-surfaceHighlight/50")}
                >
                    <Bot size={16} /> LLM Models
                </button>
                <button
                    onClick={() => setActiveTab('prompts')}
                    className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors", activeTab === 'prompts' ? "bg-surfaceHighlight text-text" : "text-muted hover:text-text hover:bg-surfaceHighlight/50")}
                >
                    <MessageSquare size={16} /> System Prompts
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'general' && (
                    <div className="space-y-6">
                         <div>
                            <h3 className="text-base font-medium text-text mb-4">Appearance</h3>
                            <div className="flex items-center justify-between gap-4 border border-border rounded-xl px-4 py-3 bg-background/20">
                                <div className="min-w-0">
                                <div className="text-sm text-text font-semibold">Theme</div>
                                <div className="text-xs text-muted mt-1">Select your preferred color theme.</div>
                                </div>

                                <div className="flex items-center gap-2">
                                <select
                                    value={themeValue}
                                    onChange={(e) => setThemeValue(e.target.value as AppTheme)}
                                    className="w-44 bg-background/40 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none cursor-pointer focus:ring-1 focus:ring-accent"
                                >
                                    {THEME_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                    ))}
                                </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'shortcuts' && (
                    <div className="space-y-6">
                        <h3 className="text-base font-medium text-text mb-4">Keyboard Shortcuts</h3>
                        
                        <div className="flex items-center justify-between gap-4 border border-border rounded-xl px-4 py-3 bg-background/20">
                            <div className="min-w-0">
                            <div className="text-sm text-text font-semibold">Search</div>
                            <div className="text-xs text-muted mt-1">Open the global search dialog.</div>
                            </div>
                            <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                value={value || 'Cmd+G'}
                                readOnly
                                onFocus={() => setIsRecording(true)}
                                onClick={() => setIsRecording(true)}
                                className={clsx("w-44 bg-background/40 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none cursor-pointer text-center", isRecording && "ring-1 ring-accent/60 bg-accent/10")}
                            />
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 border border-border rounded-xl px-4 py-3 bg-background/20">
                            <div className="min-w-0">
                            <div className="text-sm text-text font-semibold">Close Editor</div>
                            <div className="text-xs text-muted mt-1">Close current file and return to folder view.</div>
                            </div>
                            <div className="flex items-center gap-2">
                            <input
                                ref={closeInputRef}
                                value={closeValue || 'Cmd+W'}
                                readOnly
                                onFocus={() => setIsRecordingClose(true)}
                                onClick={() => setIsRecordingClose(true)}
                                className={clsx("w-44 bg-background/40 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none cursor-pointer text-center", isRecordingClose && "ring-1 ring-accent/60 bg-accent/10")}
                            />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'llm' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-medium text-text">LLM Models</h3>
                            <button onClick={handleAddConfig} className="flex items-center gap-1 text-xs bg-accent text-white px-2 py-1.5 rounded hover:opacity-90">
                                <Plus size={14} /> Add Model
                            </button>
                        </div>

                        <div className="space-y-4">
                            {localConfigs.map((config) => (
                                <div key={config.id} className="border border-border rounded-xl p-4 bg-background/20 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div 
                                            className={clsx("w-4 h-4 rounded-full border flex items-center justify-center cursor-pointer", localActiveId === config.id ? "border-accent bg-accent" : "border-muted hover:border-text")}
                                            onClick={() => setLocalActiveId(config.id)}
                                        >
                                            {localActiveId === config.id && <Check size={10} className="text-white" />}
                                        </div>
                                        <input 
                                            value={config.name}
                                            onChange={(e) => handleUpdateConfig(config.id, { name: e.target.value })}
                                            className="flex-1 bg-transparent border border-transparent hover:border-border focus:border-accent hover:bg-background/40 focus:bg-background/40 rounded px-2 py-1 outline-none text-sm font-semibold placeholder-muted transition-all"
                                            placeholder="Model Name"
                                        />
                                        <button onClick={() => handleDeleteConfig(config.id)} className="text-muted hover:text-red-500">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1 col-span-2">
                                            <label className="text-xs text-muted">Model Type</label>
                                            <select 
                                                value={config.type || 'text'}
                                                onChange={(e) => handleUpdateConfig(config.id, { type: e.target.value as any })}
                                                className="w-full bg-background/40 border border-border rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
                                            >
                                                <option value="text">Text (Chat)</option>
                                                <option value="image">Image Generation</option>
                                                {/* <option value="video">Video Generation</option> */}
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs text-muted">Base URL</label>
                                            <input 
                                                value={config.baseUrl}
                                                onChange={(e) => handleUpdateConfig(config.id, { baseUrl: e.target.value })}
                                                className="w-full bg-background/40 border border-border rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
                                                placeholder="https://api.openai.com/v1"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-muted">API Key</label>
                                            <input 
                                                value={config.apiKey}
                                                onChange={(e) => handleUpdateConfig(config.id, { apiKey: e.target.value })}
                                                type="password"
                                                className="w-full bg-background/40 border border-border rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
                                                placeholder="sk-..."
                                            />
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                            <label className="text-xs text-muted">Model ID</label>
                                            <input 
                                                value={config.modelId}
                                                onChange={(e) => handleUpdateConfig(config.id, { modelId: e.target.value })}
                                                className="w-full bg-background/40 border border-border rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
                                                placeholder="gpt-4o"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {localConfigs.length === 0 && (
                                <div className="text-center py-8 text-muted text-sm">
                                    No models configured. Click "Add Model" to get started.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'prompts' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-medium text-text">System Prompts</h3>
                            <button onClick={handleAddPrompt} className="flex items-center gap-1 text-xs bg-accent text-white px-2 py-1.5 rounded hover:opacity-90">
                                <Plus size={14} /> Add Prompt
                            </button>
                        </div>

                        <div className="space-y-4">
                            {localPrompts.map((prompt) => (
                                <div key={prompt.id} className="border border-border rounded-xl p-4 bg-background/20 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <input 
                                            value={prompt.name}
                                            onChange={(e) => handleUpdatePrompt(prompt.id, { name: e.target.value })}
                                            className="flex-1 bg-transparent border border-transparent hover:border-border focus:border-accent hover:bg-background/40 focus:bg-background/40 rounded px-2 py-1 outline-none text-sm font-semibold placeholder-muted transition-all"
                                            placeholder="Prompt Name"
                                        />
                                        <button onClick={() => handleDeletePrompt(prompt.id)} className="text-muted hover:text-red-500">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted">Content</label>
                                        <textarea 
                                            value={prompt.content}
                                            onChange={(e) => handleUpdatePrompt(prompt.id, { content: e.target.value })}
                                            className="w-full h-24 bg-background/40 border border-border rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent resize-none"
                                            placeholder="You are a helpful assistant..."
                                        />
                                    </div>
                                </div>
                            ))}

                            {localPrompts.length === 0 && (
                                <div className="text-center py-8 text-muted text-sm">
                                    No system prompts configured.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2 bg-surface">
          <button className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-surfaceHighlight text-muted hover:text-text" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg bg-accent text-white hover:opacity-90"
            onClick={handleSave}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
