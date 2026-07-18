import React, { useState } from 'react';
import { X, FlaskConical } from 'lucide-react';

export function DevBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('dev_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try { sessionStorage.setItem('dev_banner_dismissed', '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[9999] pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="pointer-events-auto mx-auto max-w-2xl mb-4 mx-4 sm:mx-auto">
        <div className="flex items-start gap-3 px-4 py-3.5 bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-2xl shadow-2xl">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mt-0.5">
            <FlaskConical className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">Development Preview</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Rezerved is currently in active development. Some features may be incomplete, change without notice, or behave unexpectedly.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
