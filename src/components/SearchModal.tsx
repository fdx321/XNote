import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { clsx } from 'clsx';
import { Search, X } from 'lucide-react';

export interface SearchHit {
  path: string;
  name: string;
  line: number;
  preview: string;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HighlightText: React.FC<{ text: string; query: string; className?: string }> = ({ text, query, className }) => {
  const q = query.trim();
  if (!q) return <span className={className}>{text}</span>;

  const re = new RegExp(escapeRegExp(q), 'ig');
  const parts: Array<{ t: string; m: boolean }> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ t: text.slice(lastIndex, index), m: false });
    }
    parts.push({ t: text.slice(index, index + match[0].length), m: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ t: text.slice(lastIndex), m: false });

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.m ? (
          <span key={i} className="bg-accent/25 text-accent px-0.5 rounded">
            {p.t}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </span>
  );
};

interface SearchModalProps {
  isOpen: boolean;
  workspacePath: string;
  onClose: () => void;
  onJump: (hit: SearchHit) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, workspacePath, onClose, onJump }) => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setHits([]);
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }

    const handle = setTimeout(async () => {
      setIsSearching(true);
      try {
        // @ts-ignore
        if ((window as any).__TAURI_INTERNALS__ && workspacePath !== '/mock') {
          const res = await invoke<SearchHit[]>('search_text', { rootPath: workspacePath, query: q, limit: 50, root_path: workspacePath });
          setHits(res || []);
        } else {
          const { mockFs } = await import('../utils/fs-adapter');
          const res = await mockFs.searchText(q);
          setHits(res || []);
        }
        setActiveIndex(0);
      } catch (e) {
        setHits([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(handle);
  }, [query, isOpen, workspacePath]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) onJump(hit);
    }
  };

  const emptyText = useMemo(() => {
    if (!query.trim()) return 'Type to search...';
    if (isSearching) return 'Searching...';
    if (!hits.length) return 'No results';
    return '';
  }, [query, isSearching, hits.length]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16" onMouseDown={onClose}>
      <div
        className="w-[720px] max-w-[92vw] bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Search size={16} className="text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to search..."
              className="flex-1 bg-transparent outline-none text-lg text-text placeholder:text-muted min-w-0"
            />
            {query.trim() && (
              <button
                className="text-muted hover:text-text border border-border rounded px-2 py-1"
                onClick={() => {
                  setQuery('');
                  setHits([]);
                  setActiveIndex(0);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                title="Clear"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="text-xs text-muted border border-border rounded px-2 py-1">ESC</div>
        </div>

        <div className="max-h-[420px] overflow-y-auto py-2">
          {emptyText ? (
            <div className="px-5 py-6 text-sm text-muted">{emptyText}</div>
          ) : (
            hits.map((hit, idx) => (
              <button
                key={`${hit.path}:${hit.line}:${idx}`}
                onClick={() => onJump(hit)}
                className={clsx(
                  'w-full text-left px-5 py-3 flex items-center justify-between gap-4 hover:bg-surfaceHighlight transition-colors',
                  idx === activeIndex && 'bg-accent/15'
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text truncate">
                    <HighlightText text={hit.name} query={query} />
                    <span className="text-xs text-muted ml-2">:{hit.line}</span>
                  </div>
                  <div className="text-xs text-muted mt-1 line-clamp-2">
                    <HighlightText text={hit.preview} query={query} />
                  </div>
                </div>
                <div className="text-xs text-muted border border-border rounded px-2 py-1">Jump</div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
