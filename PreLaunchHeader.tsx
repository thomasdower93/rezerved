import React from 'react';
import { RezervdLogo } from './RezervdLogo';

interface PreLaunchHeaderProps {
  onManageReservation?: () => void;
  onStaffLogin?: () => void;
  /** Replace the right-side buttons with a single custom action (e.g. on marketing sub-pages) */
  rightSlot?: React.ReactNode;
}

/**
 * Shared sticky header used on every pre-launch public page.
 * Keeps logo size, padding, buttons and sticky behaviour identical everywhere.
 */
export function PreLaunchHeader({ onManageReservation, onStaffLogin, rightSlot }: PreLaunchHeaderProps) {
  return (
    <header
      className="customer-header sticky top-0 z-40 border-b"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-3 h-16 sm:h-[72px]">
        <div className="flex items-center min-w-0 flex-shrink">
          <RezervdLogo linkToHome size="sm" />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {rightSlot ?? (
            <>
              {onManageReservation && (
                <button
                  onClick={onManageReservation}
                  className="text-xs sm:text-sm font-medium px-3 py-2 sm:px-4 rounded-xl transition-all duration-200 hover:opacity-80 whitespace-nowrap"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(185,170,148,0.85)',
                  }}
                >
                  Manage Booking
                </button>
              )}
              {onStaffLogin && (
                <button
                  onClick={onStaffLogin}
                  className="text-xs sm:text-sm font-semibold px-3 py-2 sm:px-4 rounded-xl transition-all duration-200 hover:opacity-90 whitespace-nowrap"
                  style={{ background: 'rgba(212,145,93,0.90)', color: '#0a0a08' }}
                >
                  Restaurant Login
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
