import React from 'react';
import { Trash2, RotateCw, Move, Copy, Plus, Minus, Repeat, X } from 'lucide-react';

interface MobileActionSheetProps {
  elementType: 'table' | 'door' | 'window' | 'wc' | 'wall';
  elementName?: string;
  onClose: () => void;
  onDelete: () => void;
  onRotate?: () => void;
  onDuplicate?: () => void;
  onReverse?: () => void;
  onResizeUp?: () => void;
  onResizeDown?: () => void;
  currentScale?: number;
}

export function MobileActionSheet({
  elementType,
  elementName,
  onClose,
  onDelete,
  onRotate,
  onDuplicate,
  onReverse,
  onResizeUp,
  onResizeDown,
  currentScale = 1,
}: MobileActionSheetProps) {
  const getTitle = () => {
    if (elementName) return elementName;

    switch (elementType) {
      case 'table':
        return 'Table';
      case 'door':
        return 'Door';
      case 'window':
        return 'Window';
      case 'wc':
        return 'WC';
      case 'wall':
        return 'Wall';
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 animate-slide-up">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900">{getTitle()}</h3>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="space-y-3">
            {onRotate && (
              <button
                onClick={() => {
                  onRotate();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <RotateCw className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-slate-900">Rotate</div>
                  <div className="text-sm text-slate-600">Rotate 15 degrees</div>
                </div>
              </button>
            )}

            {elementType === 'table' && onResizeUp && onResizeDown && (
              <div className="p-4 rounded-xl bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-slate-900">Resize</div>
                  <div className="text-sm text-slate-600">Scale: {currentScale.toFixed(1)}x</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onResizeDown}
                    disabled={currentScale <= 0.5}
                    className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-200"
                  >
                    <Minus className="w-5 h-5 text-slate-700" />
                    <span className="font-medium text-slate-900">Smaller</span>
                  </button>
                  <button
                    onClick={onResizeUp}
                    disabled={currentScale >= 2.0}
                    className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-200"
                  >
                    <Plus className="w-5 h-5 text-slate-700" />
                    <span className="font-medium text-slate-900">Larger</span>
                  </button>
                </div>
              </div>
            )}

            {onDuplicate && (
              <button
                onClick={() => {
                  onDuplicate();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Copy className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-slate-900">Duplicate</div>
                  <div className="text-sm text-slate-600">Create a copy</div>
                </div>
              </button>
            )}

            {onReverse && (
              <button
                onClick={() => {
                  onReverse();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Repeat className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-slate-900">Reverse</div>
                  <div className="text-sm text-slate-600">Change door direction</div>
                </div>
              </button>
            )}

            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-red-50 hover:bg-red-100 active:bg-red-200 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-red-900">Delete</div>
                <div className="text-sm text-red-600">Remove permanently</div>
              </div>
            </button>

            <button
              onClick={onClose}
              className="w-full p-4 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors text-center font-semibold text-slate-900"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="pb-6" />
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
