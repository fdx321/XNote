import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

interface CleanUnusedImagesModalProps {
  isOpen: boolean;
  workspacePath: string;
  unusedImages: string[];
  onClose: () => void;
  onConfirmDelete: () => Promise<void>;
}

export const CleanUnusedImagesModal: React.FC<CleanUnusedImagesModalProps> = ({
  isOpen,
  workspacePath,
  unusedImages,
  onClose,
  onConfirmDelete
}) => {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const absPaths = useMemo(() => unusedImages, [unusedImages]);

  const copyText = useMemo(() => absPaths.join(' '), [absPaths]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16" onMouseDown={onClose}>
      <div
        className="w-[720px] max-w-[92vw] bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="text-base font-semibold text-text">Clean Unused Images</div>
          <button className="text-xs text-muted border border-border rounded px-2 py-1 hover:bg-surfaceHighlight" onClick={onClose}>
            ESC
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="text-sm text-text">
            Found <span className="font-semibold">{unusedImages.length}</span> unused images.
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted break-all flex-1">
              {workspacePath ? `Workspace: ${workspacePath}` : ''}
            </div>
            <button
              className={clsx(
                'text-xs border border-border rounded px-3 py-2 hover:bg-surfaceHighlight',
                copied && 'text-accent border-accent/50'
              )}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(copyText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy Paths'}
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto border border-border rounded-xl bg-background/20">
            {absPaths.map((p, idx) => (
              <div key={`${p}:${idx}`} className="px-4 py-2 text-xs text-muted border-b border-border/50 last:border-b-0 font-mono">
                {p}
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-surfaceHighlight" onClick={onClose}>
            Cancel
          </button>
          <button
            className={clsx('px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:opacity-90', isDeleting && 'opacity-60')}
            disabled={isDeleting}
            onClick={async () => {
              setIsDeleting(true);
              try {
                await onConfirmDelete();
                onClose();
              } finally {
                setIsDeleting(false);
              }
            }}
          >
            Delete All
          </button>
        </div>
      </div>
    </div>
  );
};
