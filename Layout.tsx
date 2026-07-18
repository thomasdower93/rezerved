import React from 'react';
import { LogOut } from 'lucide-react';
import { RezervdLogo } from './RezervdLogo';
import { PreLaunchHeader } from './PreLaunchHeader';
import { useAuth } from '../contexts/AuthContext';
import { BookingProgressBar, BookingStep } from './BookingProgressBar';

interface LayoutProps {
  children: React.ReactNode;
  onStaffLogin?: () => void;
  onManageReservation?: () => void;
  onLogout?: () => void;
  bookingStep?: BookingStep;
  compactHeader?: boolean;
  /** When true, renders the shared PreLaunchHeader instead of the standard one */
  preLaunchMode?: boolean;
}

export function Layout({ children, onStaffLogin, onManageReservation, bookingStep, compactHeader, preLaunchMode }: LayoutProps) {
  const { user: currentUser, logout: authLogout } = useAuth();

  const handleStaffLogin = () => {
    if (onStaffLogin) {
      onStaffLogin();
    } else {
      window.location.href = '/staff';
    }
  };

  const handleSignOut = async () => {
    await authLogout();
    window.location.href = '/';
  };

  const handleManageReservation = () => {
    if (onManageReservation) {
      onManageReservation();
    }
  };

  return (
    <div className="customer-shell">
      {preLaunchMode ? (
        <PreLaunchHeader
          onManageReservation={onManageReservation}
          onStaffLogin={onStaffLogin}
        />
      ) : (
        <header className="customer-header">
          <div className={`max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 ${compactHeader ? 'h-12' : 'h-16 sm:h-[72px]'}`}>
            <div className="flex items-center min-w-0">
              <RezervdLogo size="sm" />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              {currentUser ? (
                <div className="flex items-center gap-1.5 sm:gap-3">
                  <span className="hidden sm:block text-sm text-app-text font-medium truncate max-w-[120px]">
                    {currentUser.name}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-app-text bg-app-bg-tertiary hover:bg-app-bg-tertiary/80 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden xs:inline">Sign Out</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStaffLogin}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white bg-app-accent hover:bg-app-accent/90 rounded-lg transition-colors"
                >
                  Bookings
                </button>
              )}
            </div>
          </div>
        </header>
      )}
      {bookingStep && (
        <div className="customer-header border-b border-app-border/30">
          <BookingProgressBar currentStep={bookingStep} />
        </div>
      )}
      <div className="customer-scroll">
        <main className="customer-main">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
            {children}
          </div>
        </main>
        <footer className="customer-footer customer-header border-t border-app-border/60 dark:border-white/[0.06]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-3">
            {onManageReservation && !preLaunchMode && (
              <div className="text-center">
                <button
                  onClick={handleManageReservation}
                  className="text-sm text-app-accent hover:text-app-accent/80 font-medium transition-colors"
                >
                  Manage existing reservation
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              {[
                { label: 'Booking Terms', href: '/booking-terms' },
                { label: 'Cancellation Policy', href: '/cancellation-policy' },
                { label: 'Privacy Policy', href: '/privacy-policy' },
                { label: 'Cookie & Storage Policy', href: '/cookie-policy' },
                { label: 'Terms of Use', href: '/terms' },
              ].map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  className="text-xs text-app-text-tertiary hover:text-app-text-secondary transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
