import React, { useEffect, useRef } from 'react';
import { Button } from './Button';
import { Clock } from 'lucide-react';

interface AlternativeTimePopoverProps {
  isOpen: boolean;
  tableName: string;
  tablePosition: { x: number; y: number } | null;
  availableTimes: string[];
  onSelectTime: (time: string) => void;
  onClose: () => void;
}

export function AlternativeTimePopover({
  isOpen,
  tableName,
  tablePosition,
  availableTimes,
  onSelectTime,
  onClose,
}: AlternativeTimePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !tablePosition || !popoverRef.current) return;

    const popover = popoverRef.current;
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = tablePosition.x;
    let top = tablePosition.y + 20;

    if (left + popoverRect.width > viewportWidth - 20) {
      left = viewportWidth - popoverRect.width - 20;
    }
    if (left < 20) {
      left = 20;
    }

    if (top + popoverRect.height > viewportHeight - 20) {
      top = tablePosition.y - popoverRect.height - 20;
    }
    if (top < 20) {
      top = 20;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }, [isOpen, tablePosition]);

  if (!isOpen || !tablePosition) return null;

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <div
        ref={popoverRef}
        className="fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xs animate-slideUp"
        style={{
          left: 0,
          top: 0,
        }}
      >
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {tableName}
              </h3>
              <p className="text-xs text-slate-500">
                Available at:
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-3">
            {availableTimes.map((time) => (
              <button
                key={time}
                onClick={() => onSelectTime(time)}
                className="w-full px-3 py-2 text-left rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
              >
                <span className="text-sm font-medium text-emerald-700">
                  {formatTime(time)}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-full px-3 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
          >
            Choose another table
          </button>
        </div>
      </div>
    </>
  );
}
