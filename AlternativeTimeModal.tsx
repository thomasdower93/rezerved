import React from 'react';
import { Button } from './Button';
import { Clock, X } from 'lucide-react';

interface AlternativeTimeModalProps {
  isOpen: boolean;
  tableName: string;
  requestedTime: string;
  alternativeTime: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function AlternativeTimeModal({
  isOpen,
  tableName,
  requestedTime,
  alternativeTime,
  onAccept,
  onDecline,
}: AlternativeTimeModalProps) {
  if (!isOpen) return null;

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 animate-fadeIn" onClick={onDecline} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slideUp">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                Alternative Time Available
              </h3>
            </div>
            <button
              onClick={onDecline}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6">
            <p className="text-slate-600 mb-4">
              Table {tableName} is not available at your requested time.
            </p>

            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Requested Time:</span>
                <span className="font-medium text-slate-700 line-through">
                  {formatTime(requestedTime)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Available Time:</span>
                <span className="font-semibold text-emerald-600 text-lg">
                  {formatTime(alternativeTime)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={onDecline}
              className="flex-1"
            >
              Decline
            </Button>
            <Button
              onClick={onAccept}
              className="flex-1"
            >
              Accept Alternative
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
