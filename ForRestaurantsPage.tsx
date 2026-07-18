import { RezervdLogo } from '../components/RezervdLogo';
import {
  LayoutDashboard,
  Map,
  PhoneCall,
  CalendarDays,
  Settings2,
  MessageSquare,
  Globe,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

interface ForRestaurantsPageProps {
  onSignIn: () => void;
  onRequestTrial: () => void;
  onBack: () => void;
}

const FEATURES = [
  { icon: LayoutDashboard, label: 'Live reservations dashboard' },
  { icon: Map,             label: 'Interactive table layout' },
  { icon: PhoneCall,       label: 'Walk-ins and phone bookings' },
  { icon: CalendarDays,    label: 'Daily sheet and grid view' },
  { icon: Settings2,       label: 'Booking rules and availability controls' },
  { icon: MessageSquare,   label: 'Customer messaging and reservation management' },
  { icon: Globe,           label: 'Website booking link' },
];

export function ForRestaurantsPage({ onSignIn, onRequestTrial, onBack }: ForRestaurantsPageProps) {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: '#0a0a0a' }}>
      {/* Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/backgrounds/dark-website-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: 'saturate(1.05) contrast(1.05)',
        }}
      />
      <div
        className="absolute inset-0 z-0"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.92) 100%)' }}
      />
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)' }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Header */}
        <header
          className="flex-shrink-0 sticky top-0 z-50"
          style={{
            background: 'rgba(10,10,10,0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-[72px] gap-2">
              <button onClick={onBack} className="flex items-center min-w-0">
                <RezervdLogo size="sm" linkToHome={false} />
              </button>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={onSignIn}
                  className="text-xs sm:text-sm transition-colors duration-200 whitespace-nowrap"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                >
                  Sign in
                </button>
                <button
                  onClick={onRequestTrial}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap"
                  style={{
                    background: 'linear-gradient(135deg, rgb(212,145,93) 0%, rgb(191,131,84) 100%)',
                    color: '#fff',
                    boxShadow: '0 2px 12px rgba(212,145,93,0.3)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(212,145,93,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(212,145,93,0.3)'; }}
                >
                  Request a trial
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-24">
          <div className="w-full max-w-2xl mx-auto text-center">

            {/* Eyebrow */}
            <p
              className="text-xs sm:text-sm font-light tracking-widest uppercase mb-6"
              style={{ color: 'rgba(212,145,93,0.75)', letterSpacing: '0.2em' }}
            >
              For restaurants
            </p>

            {/* Heading */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-5"
              style={{ color: 'rgba(255,255,255,0.95)' }}>
              Get Rezerved for your&nbsp;restaurant
            </h1>

            {/* Subheading */}
            <p className="text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto"
              style={{ color: 'rgba(255,255,255,0.55)' }}>
              A modern booking dashboard, live availability, table management and a premium customer booking experience for restaurants.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
              <button
                onClick={onRequestTrial}
                className="group w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, rgb(212,145,93) 0%, rgb(191,131,84) 100%)',
                  color: '#fff',
                  boxShadow: '0 4px 24px rgba(212,145,93,0.35)',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 32px rgba(212,145,93,0.55)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(212,145,93,0.35)'; e.currentTarget.style.transform = ''; }}
              >
                Request a trial
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={onSignIn}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.8)',
                  backdropFilter: 'blur(8px)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
              >
                Sign in
              </button>
            </div>

            {/* Feature list */}
            <div
              className="rounded-2xl px-6 py-7 sm:px-8 sm:py-8 text-left"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(6px)',
              }}
            >
              <p className="text-xs font-semibold tracking-widest uppercase mb-5"
                style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em' }}>
                What's included
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3.5">
                {FEATURES.map(({ label }) => (
                  <li key={label} className="flex items-center gap-3">
                    <CheckCircle2
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: 'rgba(212,145,93,0.8)' }}
                    />
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </main>

        {/* Footer */}
        <div className="text-center pb-6 pt-2">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {'\u00A9'} {new Date().getFullYear()} Rezerved. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
