import React, { useEffect, useState } from 'react';
import { UtensilsCrossed, Store, ArrowRight, Star } from 'lucide-react';

interface SplashPageProps {
  onDiner: () => void;
  onRestaurant: () => void;
}

export function SplashPage({ onDiner, onRestaurant }: SplashPageProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: '#0a0a0a' }}>
      {/* Background image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/backgrounds/dark-website-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: 'saturate(1.1) contrast(1.05)',
        }}
      />
      {/* Dark gradient overlay — stronger at bottom for CTA legibility */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.85) 100%)',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.45) 100%)' }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Top strip */}
        <div className="flex items-center justify-end px-6 py-4">
          <button
            onClick={onRestaurant}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Already have an account? Sign in
          </button>
        </div>

        {/* Hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">

          {/* Logo */}
          <div
            className="mb-8 sm:mb-10 transition-all duration-700"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(12px)',
              transitionDelay: '0ms',
            }}
          >
            <img
              src="/newlogo-Photoroom.png"
              alt="Rezerved"
              className="mx-auto"
              style={{ width: 'clamp(220px, 55vw, 420px)', height: 'auto' }}
              draggable={false}
            />
          </div>

          {/* Tagline */}
          <div
            className="transition-all duration-700"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(12px)',
              transitionDelay: '120ms',
            }}
          >
            <p className="text-base sm:text-lg md:text-xl font-light tracking-widest uppercase mb-2"
              style={{ color: 'rgba(212,145,93,0.85)', letterSpacing: '0.22em' }}>
              Dine with intention
            </p>
            <p className="text-sm sm:text-base text-white/40 font-light max-w-md mx-auto leading-relaxed">
              Reserve the perfect table at handpicked restaurants — exactly where and when you want.
            </p>
          </div>

          {/* Divider */}
          <div
            className="my-10 sm:my-12 flex items-center gap-4 w-full max-w-xs transition-all duration-700"
            style={{
              opacity: visible ? 1 : 0,
              transitionDelay: '200ms',
            }}
          >
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <Star className="w-3.5 h-3.5" style={{ color: 'rgba(212,145,93,0.5)' }} />
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* CTAs */}
          <div
            className="w-full max-w-sm flex flex-col gap-4 transition-all duration-700"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(16px)',
              transitionDelay: '280ms',
            }}
          >
            {/* Primary — Diner */}
            <button
              onClick={onDiner}
              className="group relative w-full flex items-center justify-center gap-3 rounded-2xl px-8 py-4 text-base font-semibold transition-all duration-300 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, rgb(212,145,93) 0%, rgb(191,131,84) 100%)',
                color: '#fff',
                boxShadow: '0 4px 24px rgba(212,145,93,0.35)',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 32px rgba(212,145,93,0.55)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(212,145,93,0.35)'; e.currentTarget.style.transform = ''; }}
            >
              <UtensilsCrossed className="w-5 h-5 flex-shrink-0" />
              <span>I&apos;m looking to dine</span>
              <ArrowRight className="w-4 h-4 ml-auto opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Secondary — Restaurant */}
            <button
              onClick={onRestaurant}
              className="group w-full flex items-center justify-center gap-3 rounded-2xl px-8 py-4 text-base font-semibold transition-all duration-300 active:scale-[0.98]"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(8px)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
            >
              <Store className="w-5 h-5 flex-shrink-0" />
              <span>I manage a restaurant</span>
              <ArrowRight className="w-4 h-4 ml-auto opacity-40 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Social proof / trust signal */}
          <div
            className="mt-10 flex items-center gap-6 text-xs transition-all duration-700"
            style={{
              opacity: visible ? 0.45 : 0,
              transitionDelay: '400ms',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            <span>Real-time availability</span>
            <span style={{ color: 'rgba(212,145,93,0.5)' }}>·</span>
            <span>Interactive floor plans</span>
            <span style={{ color: 'rgba(212,145,93,0.5)' }}>·</span>
            <span>Instant confirmation</span>
          </div>
        </div>

        {/* Bottom */}
        <div className="text-center pb-6 pt-2">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
            &copy; {new Date().getFullYear()} Rezerved. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
