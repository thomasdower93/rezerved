import React from 'react';
import { ArrowRight, Utensils, Building2 } from 'lucide-react';
import { PreLaunchHeader } from '../components/PreLaunchHeader';

interface PreLaunchSplashPageProps {
  onStaffLogin: () => void;
  onManageReservation: () => void;
}

export function PreLaunchSplashPage({ onStaffLogin, onManageReservation }: PreLaunchSplashPageProps) {
  const goTo = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="customer-shell" style={{ color: 'rgba(240,232,218,0.96)' }}>
      <PreLaunchHeader
        onManageReservation={onManageReservation}
        onStaffLogin={onStaffLogin}
      />

      {/* ── Scrollable body ── */}
      <div className="customer-scroll">
      <main className="customer-main flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-24" style={{ minHeight: 'calc(100vh - 60px)' }}>
        <div className="w-full max-w-2xl text-center">

          {/* Launch pill */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-8"
            style={{
              background: 'rgba(212,145,93,0.12)',
              border: '1px solid rgba(212,145,93,0.30)',
              color: 'rgba(212,145,93,0.90)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Launching August 1st
          </div>

          {/* Heading */}
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-5"
            style={{ color: 'rgba(240,232,218,0.97)', letterSpacing: '-0.025em' }}
          >
            Rezerved is<br className="hidden sm:block" /> launching soon.
          </h1>

          {/* Subheading */}
          <p
            className="text-base sm:text-lg leading-relaxed mb-10 max-w-lg mx-auto"
            style={{ color: 'rgba(185,170,148,0.75)' }}
          >
            A better way to book restaurants, choose your table, and manage reservations.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
            <button
              onClick={() => goTo('/early-access')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
              style={{ background: 'rgba(212,145,93,0.90)', color: '#0a0a08' }}
            >
              Join diner early access
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => goTo('/restaurant-partners')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-80"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(185,170,148,0.85)',
              }}
            >
              Register restaurant interest
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* ── Option cards ── */}
          <div className="grid sm:grid-cols-2 gap-4 text-left">

            {/* Diner card */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'rgba(212,145,93,0.13)',
                  border: '1px solid rgba(212,145,93,0.25)',
                }}
              >
                <Utensils className="w-5 h-5" style={{ color: 'rgba(212,145,93,0.90)' }} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-base mb-2" style={{ color: 'rgba(240,232,218,0.97)' }}>
                  For Diners
                </p>
                <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(185,170,148,0.70)' }}>
                  Be first to book with Rezerved when restaurants near you go live.
                </p>
                <button
                  onClick={() => goTo('/early-access')}
                  className="inline-flex items-center gap-2 text-sm font-semibold transition-all duration-200 hover:opacity-80"
                  style={{ color: 'rgba(212,145,93,0.90)' }}
                >
                  Join early access
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Restaurant card */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'rgba(212,145,93,0.13)',
                  border: '1px solid rgba(212,145,93,0.25)',
                }}
              >
                <Building2 className="w-5 h-5" style={{ color: 'rgba(212,145,93,0.90)' }} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-base mb-2" style={{ color: 'rgba(240,232,218,0.97)' }}>
                  For Restaurants
                </p>
                <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(185,170,148,0.70)' }}>
                  Register your venue for early access and prepare your Rezerved dashboard before launch.
                </p>
                <button
                  onClick={() => goTo('/restaurant-partners')}
                  className="inline-flex items-center gap-2 text-sm font-semibold transition-all duration-200 hover:opacity-80"
                  style={{ color: 'rgba(212,145,93,0.90)' }}
                >
                  Register interest
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        className="customer-footer border-t py-6 px-4 text-center"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
          {[
            { label: 'Booking Terms', href: '/booking-terms' },
            { label: 'Cancellation Policy', href: '/cancellation-policy' },
            { label: 'Privacy Policy', href: '/privacy-policy' },
            { label: 'Cookie & Storage Policy', href: '/cookie-policy' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs hover:opacity-70 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.45)' }}
            >
              {link.label}
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs" style={{ color: 'rgba(185,170,148,0.22)' }}>
          &copy; {new Date().getFullYear()} Rezerved. All rights reserved.
        </p>
      </footer>
      </div>{/* end customer-scroll */}
    </div>
  );
}
