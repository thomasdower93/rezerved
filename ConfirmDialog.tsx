import React from 'react';
import { Button } from './Button';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              variant === 'danger' ? 'bg-red-100' : 'bg-yellow-100'
            }`}>
              <AlertTriangle className={`w-6 h-6 ${
                variant === 'danger' ? 'text-red-600' : 'text-yellow-600'
              }`} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {title}
              </h3>
              <p className="text-slate-600 text-sm">
                {message}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <Button
              variant="secondary"
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={variant}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
