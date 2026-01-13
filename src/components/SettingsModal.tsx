import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppTheme } from '../store';

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
  const [value, setValue] = useState(searchShortcut || 'Cmd+G');
  const [closeValue, setCloseValue] = useState('Cmd+W');
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingClose, setIsRecordingClose] = useState(false);
  const [themeValue, setThemeValue] = useState<AppTheme>(theme || 'zinc');
  const inputRef = useRef<HTMLInputElement>(null);
  const closeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue(searchShortcut || 'Cmd+G');
    setCloseValue(closeEditorShortcut || 'Cmd+W');
    setIsRecording(false);
    setIsRecordingClose(false);
    setThemeValue(theme || 'zinc');
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [isOpen, searchShortcut, closeEditorShortcut, theme]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20" onMouseDown={onClose}>
      <div
        className="w-[520px] max-w-[92vw] bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="text-base font-semibold text-text">Settings</div>
          <button
            className="text-xs text-muted border border-border rounded px-2 py-1 hover:bg-surfaceHighlight"
            onClick={onClose}
          >
            ESC
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="text-sm font-medium text-text">Shortcuts</div>

          <div className="flex items-center justify-between gap-4 border border-border rounded-xl px-4 py-3 bg-background/20">
            <div className="min-w-0">
              <div className="text-sm text-text font-semibold">Search</div>
              <div className="text-xs text-muted mt-1">Used to open the search dialog.</div>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={value || 'Cmd+G'}
                readOnly
                onFocus={() => setIsRecording(true)}
                onClick={() => setIsRecording(true)}
                className={`w-44 bg-background/40 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none cursor-pointer ${isRecording ? 'ring-1 ring-accent/60' : ''}`}
              />
              <div className="text-xs text-muted border border-border rounded px-2 py-1">{displayKey}</div>
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
                className={`w-44 bg-background/40 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none cursor-pointer ${isRecordingClose ? 'ring-1 ring-accent/60' : ''}`}
              />
              <div className="text-xs text-muted border border-border rounded px-2 py-1">{displayCloseKey}</div>
            </div>
          </div>

          <div className="pt-2 text-sm font-medium text-text">Appearance</div>

          <div className="flex items-center justify-between gap-4 border border-border rounded-xl px-4 py-3 bg-background/20">
            <div className="min-w-0">
              <div className="text-sm text-text font-semibold">Theme</div>
              <div className="text-xs text-muted mt-1">All themes are dark.</div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={themeValue}
                onChange={(e) => setThemeValue(e.target.value as AppTheme)}
                className="w-44 bg-background/40 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none cursor-pointer"
              >
                {THEME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-muted border border-border rounded px-2 py-1">
                {THEME_OPTIONS.find((t) => t.value === themeValue)?.hint ?? ''}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-surfaceHighlight" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg bg-accent text-white hover:opacity-90"
            onClick={() => {
              onSave({ searchShortcut: value || 'Cmd+G', closeEditorShortcut: closeValue || 'Cmd+W', theme: themeValue || 'zinc' });
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
