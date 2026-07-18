import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const styles = {
    success: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-900 dark:text-emerald-100',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-900 dark:text-red-100',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-900 dark:text-blue-100',
  };

  const content = (
    <div className="fixed top-4 right-4 z-[9999] animate-slideInRight">
      <div
        className={`
          flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 shadow-lg
          premium-card max-w-md backdrop-blur-sm
          ${styles[type]}
        `}
      >
        {icons[type]}
        <p className="flex-1 text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="flex-shrink-0 hover:opacity-70 transition-opacity"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <>
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{
            position: 'fixed',
            top: `${16 + index * 72}px`,
            right: '16px',
            zIndex: 9999,
          }}
          className="animate-slideInRight"
        >
          <div
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 shadow-lg
              premium-card max-w-md backdrop-blur-sm
              ${
                toast.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-900 dark:text-emerald-100'
                  : toast.type === 'error'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-900 dark:text-red-100'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-900 dark:text-blue-100'
              }
            `}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-500" />
            ) : (
              <Info className="w-5 h-5 text-blue-500" />
            )}
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              onClick={() => onRemove(toast.id)}
              className="flex-shrink-0 hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
