import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Restaurant } from '../lib/types';
import { WalkInPhoneBooking } from '../pages/WalkInPhoneBooking';

interface DashboardNewBookingModalProps {
  open: boolean;
  restaurant: Restaurant;
  onClose: () => void;
  onReservationCreated: () => void;
}

export function DashboardNewBookingModal({
  open,
  restaurant,
  onClose,
  onReservationCreated,
}: DashboardNewBookingModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center sm:p-5" role="dialog" aria-modal="true" aria-label="Create a new booking">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close new booking" />
      <div className="relative w-full sm:max-w-5xl h-full sm:h-[min(880px,94vh)] bg-slate-950 sm:border border-slate-700 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 h-16 border-b border-slate-800 bg-slate-900 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-white">New booking</p>
            <p className="text-xs text-slate-500">{restaurant.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-7">
          <WalkInPhoneBooking
            restaurant={restaurant}
            onBack={onClose}
            onReservationCreated={onReservationCreated}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
