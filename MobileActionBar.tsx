import React from 'react';
import { Trash2, RotateCw, Repeat } from 'lucide-react';

interface MobileActionBarProps {
  elementType: 'table' | 'door' | 'window' | 'wc' | 'wall';
  position: { x: number; y: number };
  onDelete: () => void;
  onRotate?: () => void;
  onReverse?: () => void;
  onClose: () => void;
}

export function MobileActionBar({
  elementType,
  position,
  onDelete,
  onRotate,
  onReverse,
  onClose,
}: MobileActionBarProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <div
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 flex gap-1 p-2"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-50%, -100%) translateY(-8px)',
        }}
      >
        {onRotate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRotate();
            }}
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-blue-600 active:bg-blue-50 min-w-[56px]"
          >
            <RotateCw className="w-5 h-5" />
            <span className="text-xs font-medium">Rotate</span>
          </button>
        )}
        {onReverse && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReverse();
            }}
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-blue-600 active:bg-blue-50 min-w-[56px]"
          >
            <Repeat className="w-5 h-5" />
            <span className="text-xs font-medium">Reverse</span>
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-red-600 active:bg-red-50 min-w-[56px]"
        >
          <Trash2 className="w-5 h-5" />
          <span className="text-xs font-medium">Delete</span>
        </button>
      </div>
    </>
  );
}
