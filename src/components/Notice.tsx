import React from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../store';

export const Notice: React.FC = () => {
  const { notice, clearNotice } = useAppStore();

  React.useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => clearNotice(), 2000);
    return () => window.clearTimeout(t);
  }, [notice?.id]);

  if (!notice) return null;

  const tone =
    notice.type === 'error'
      ? 'border-red-500/40 bg-red-500/10 text-red-200'
      : notice.type === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
        : 'border-border bg-surface text-text';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
      <div className={clsx("px-4 py-2 rounded-lg border shadow-xl backdrop-blur-sm text-sm max-w-[80vw] truncate", tone)}>
        {notice.message}
      </div>
    </div>
  );
};

