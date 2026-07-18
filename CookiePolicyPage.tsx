import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { ArrowLeft, Clock, AlertTriangle } from 'lucide-react';
import { loadHoldContext } from './BookingPage';

interface CookiePolicyPageProps {
  onStaffLogin: () => void;
  onManageReservation?: () => void;
  source?: 'booking-flow' | 'home' | 'footer' | 'manage-booking' | 'confirmation';
  preserveHold?: boolean;
  onBack?: () => void;
  preLaunchMode?: boolean;
}

function backLabel(source: CookiePolicyPageProps['source']): string {
  if (source === 'booking-flow') return 'Back to booking';
  if (source === 'home') return 'Back to home';
  return 'Back';
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8">
      <h2 className="text-base font-bold text-app-text mb-3 pb-2 border-b border-app-border">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-app-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
      style={{ color: 'rgba(212,145,93,0.85)' }}
    >
      <ArrowLeft className="w-4 h-4 flex-shrink-0" />
      {label}
    </button>
  );
}

export function CookiePolicyPage({
  onStaffLogin,
  onManageReservation,
  source,
  preserveHold,
  onBack,
  preLaunchMode,
}: CookiePolicyPageProps) {
  const [holdExpired, setHoldExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const holdCtx = preserveHold ? loadHoldContext() : null;

  useEffect(() => {
    if (!holdCtx?.holdExpiresAt) return;
    const tick = () => {
      const expiresAt = new Date(holdCtx.holdExpiresAt!).getTime();
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeRemaining(remaining);
      if (remaining === 0) setHoldExpired(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdCtx?.holdExpiresAt]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.location.href = '/';
    }
  };

  const label = backLabel(source);

  const formatRemaining = (ms: number) => {
    const totalSecs = Math.ceil(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const hasActiveHold =
    preserveHold && holdCtx && !holdExpired && timeRemaining !== null && timeRemaining > 0;

  return (
    <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} preLaunchMode={preLaunchMode}>
      <div className="max-w-2xl mx-auto">

        {/* Top navigation row */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <BackButton label={label} onClick={handleBack} />

          {preserveHold && holdCtx && (
            holdExpired ? (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(180,50,50,0.18)', border: '1px solid rgba(200,80,80,0.35)', color: 'rgba(220,140,140,0.90)' }}
              >
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Hold expired
              </div>
            ) : timeRemaining !== null ? (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(212,145,93,0.12)', border: '1px solid rgba(212,145,93,0.30)', color: 'rgba(212,145,93,0.90)' }}
              >
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                Table held &middot; {formatRemaining(timeRemaining)}
              </div>
            ) : null
          )}
        </div>

        {/* Hold status notice */}
        {preserveHold && holdCtx && (
          holdExpired ? (
            <div
              className="rounded-xl px-4 py-4 mb-6 flex items-start gap-3"
              style={{ background: 'rgba(180,50,50,0.14)', border: '1px solid rgba(200,80,80,0.30)' }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgba(220,120,120,0.90)' }} />
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(235,200,200,0.85)' }}>
                Your table hold has expired. Please return to the booking page to choose your table again.
              </p>
            </div>
          ) : hasActiveHold ? (
            <div
              className="rounded-xl px-4 py-3.5 mb-6 flex items-center gap-3"
              style={{ background: 'rgba(212,145,93,0.10)', border: '1px solid rgba(212,145,93,0.25)' }}
            >
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.85)' }} />
              <p className="text-sm" style={{ color: 'rgba(212,145,93,0.85)' }}>
                Your table is still being held while you review this policy.
              </p>
            </div>
          ) : null
        )}

        {/* Page header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(212,145,93,0.75)' }}>
            Legal
          </p>
          <h1 className="text-2xl font-bold text-app-text mb-2">Cookie &amp; Storage Policy</h1>
          <p className="text-sm text-app-text-secondary">
            Last updated: May 2026 &nbsp;&middot;&nbsp; Version: 1.0
          </p>
        </div>

        {/* Intro card */}
        <div className="premium-card rounded-2xl p-6 sm:p-8 mb-6">
          <p className="text-sm text-app-text-secondary leading-relaxed">
            This policy explains how Rezerved uses browser storage technologies — including cookies, localStorage, and sessionStorage — when you use the Rezerved platform. We have written this policy in plain English to help you understand exactly what is stored and why.
          </p>
        </div>

        {/* Sections */}
        <div className="premium-card rounded-2xl p-6 sm:p-8 space-y-0">

          <Section id="s1" title="1. About this policy">
            <p>
              This Cookie &amp; Storage Policy applies to the Rezerved website and booking platform at rezerved.co.uk and any pages that form part of the Rezerved service.
            </p>
            <p>
              It explains what browser storage technologies we currently use, why we use them, and how you can manage them. It should be read alongside our{' '}
              <a href="/privacy-policy" className="text-app-accent hover:underline">Privacy Policy</a>.
            </p>
          </Section>

          <Section id="s2" title="2. Do we use cookies?">
            <p>
              <strong className="text-app-text font-semibold">No — Rezerved does not currently use HTTP cookies.</strong>
            </p>
            <p>
              Rezerved does not write to <code className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.06)' }}>document.cookie</code> and does not set any <code className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.06)' }}>Set-Cookie</code> response headers. No HTTP cookies are placed on your device when you use Rezerved.
            </p>
            <p>
              Instead, Rezerved uses browser-native storage — localStorage and sessionStorage — for the limited purposes described below. These are different from cookies: they are not sent to servers with every request and are scoped to the Rezerved domain only.
            </p>
          </Section>

          <Section id="s3" title="3. Local storage and session storage">
            <p>
              Browsers provide two types of key–value storage that websites can use to save small amounts of data on your device:
            </p>
            <ul className="list-none space-y-2 pl-0">
              <li className="flex gap-2">
                <span className="text-app-accent flex-shrink-0">&#8212;</span>
                <span>
                  <strong className="text-app-text font-semibold">localStorage</strong> — persists until you clear it manually or the browser clears it. It is retained across tabs and browser restarts.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-app-accent flex-shrink-0">&#8212;</span>
                <span>
                  <strong className="text-app-text font-semibold">sessionStorage</strong> — exists only for the duration of the current browser tab. It is cleared automatically when you close the tab.
                </span>
              </li>
            </ul>
            <p>
              Neither localStorage nor sessionStorage data is sent to Rezerved's servers automatically. Data in both types of storage remains on your device unless Rezerved reads it explicitly to support a platform feature.
            </p>
          </Section>

          <Section id="s4" title="4. Strictly necessary storage">
            <p>
              The following storage items are required for Rezerved to function. They cannot be disabled without breaking core features.
            </p>

            <div className="space-y-4 mt-2">
              {[
                {
                  key: 'Supabase authentication session',
                  type: 'localStorage',
                  purpose: 'When you sign in to a Rezerved staff or admin account, your login session is stored in localStorage so that you remain signed in when you reload the page or navigate between pages. Without this, you would be signed out on every page load. This item is written and managed automatically by the Supabase authentication library. It contains a signed session token and a refresh token. It does not contain your password.',
                },
                {
                  key: 'Booking session identifier',
                  type: 'sessionStorage',
                  purpose: 'When you start a restaurant booking, Rezerved creates a unique random identifier for your current session. This is used to associate your table hold with your specific browser tab, preventing duplicate holds from being created if you navigate back and forth during the booking process. This item is cleared automatically when you close the tab.',
                },
                {
                  key: 'Active table hold context',
                  type: 'sessionStorage',
                  purpose: 'If you open the Booking Terms, Privacy Policy, or Cookie & Storage Policy while a table hold is active during your booking, Rezerved temporarily saves details of your active hold — including the hold reference, restaurant, table, date, time, and party size — so that your booking progress is preserved while you read the legal page. This item is cleared immediately when you return to the booking page. It does not contain payment details.',
                },
                {
                  key: 'Password reset rate-limit counter',
                  type: 'localStorage',
                  purpose: 'To prevent automated abuse of the password reset feature, Rezerved stores a counter of recent password reset attempts in localStorage. This limits requests to a maximum of 3 attempts per 15-minute window from the same browser. No personal data is stored — only a count and a timestamp.',
                },
              ].map(({ key, type, purpose }) => (
                <div key={key} className="rounded-lg px-4 py-3.5 space-y-1.5" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-app-text">{key}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(212,145,93,0.15)', color: 'rgba(212,145,93,0.85)' }}
                    >
                      {type}
                    </span>
                  </div>
                  <p className="text-xs text-app-text-secondary leading-relaxed">{purpose}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="s5" title="5. Functional storage">
            <p>
              The following storage items are not strictly required for core functionality but improve the experience of using Rezerved. They do not identify you or track your behaviour.
            </p>

            <div className="mt-2">
              <div className="rounded-lg px-4 py-3.5 space-y-1.5" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-app-text">Floorplan help prompt</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(212,145,93,0.15)', color: 'rgba(212,145,93,0.85)' }}
                  >
                    localStorage
                  </span>
                </div>
                <p className="text-xs text-app-text-secondary leading-relaxed">
                  When you view an interactive table floorplan for the first time, Rezerved shows a brief hint explaining how to interact with the map. Once you have seen or dismissed this hint, a simple flag is saved in localStorage so the hint is not shown again on future visits. No personal data is stored — only a boolean flag.
                </p>
              </div>
            </div>
          </Section>

          <Section id="s6" title="6. Third-party tracking and analytics">
            <p>
              <strong className="text-app-text font-semibold">Rezerved does not currently use any third-party analytics, advertising, profiling, session replay, or tracking tools.</strong>
            </p>
            <p>
              Specifically, as of the date of this policy, Rezerved does not load or use:
            </p>
            <ul className="list-none space-y-1 pl-0">
              {[
                'Google Analytics or Google Tag Manager',
                'Facebook Pixel or Meta advertising tools',
                'Hotjar, Clarity, FullStory or session replay tools',
                'Mixpanel, Segment, Amplitude or product analytics platforms',
                'Advertising networks or retargeting pixels',
                'Third-party chat or support widgets that set tracking cookies',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>
              If Rezerved adds any non-essential analytics or marketing technologies in the future, this policy will be updated and any required consent controls will be put in place before those technologies are used.
            </p>
          </Section>

          <Section id="s7" title="7. Payment providers">
            <p>
              Some bookings on Rezerved require a deposit. Where a deposit is required, payment processing is handled securely via a third-party payment provider.
            </p>
            <p>
              Rezerved does not load payment provider scripts (such as Stripe.js or SumUp SDK) directly in the browser. Deposit payments are processed server-side via Rezerved's backend. As a result, payment providers do not currently set cookies or browser storage items through the Rezerved platform.
            </p>
            <p>
              If this changes — for example, if a client-side payment form is introduced — this policy will be updated to reflect any storage set by the payment provider.
            </p>
          </Section>

          <Section id="s8" title="8. Managing browser storage">
            <p>
              You can view, clear, or block browser storage at any time using your browser's built-in developer tools or privacy settings.
            </p>
            <ul className="list-none space-y-1.5 pl-0">
              {[
                ['Google Chrome', 'Settings → Privacy and Security → Site Settings → View permissions and data stored across sites'],
                ['Mozilla Firefox', 'Settings → Privacy & Security → Cookies and Site Data → Manage Data'],
                ['Safari (macOS)', 'Settings → Privacy → Manage Website Data'],
                ['Safari (iOS)', 'Settings → Safari → Advanced → Website Data'],
                ['Microsoft Edge', 'Settings → Cookies and Site Permissions → Cookies and Site Data → See all cookies and site data'],
              ].map(([browser, path]) => (
                <li key={browser} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span><strong className="text-app-text font-semibold">{browser}:</strong> {path}</span>
                </li>
              ))}
            </ul>
            <p>
              Clearing localStorage on rezerved.co.uk will sign you out of any active staff or admin session and clear the floorplan help flag. Clearing sessionStorage will end any active booking session, which may release an in-progress table hold.
            </p>
          </Section>

          <Section id="s9" title="9. Future changes">
            <p>
              This policy reflects the current state of Rezerved's storage usage. As the platform develops, the types of storage used may change.
            </p>
            <p>
              If Rezerved introduces non-essential storage — such as analytics cookies, advertising pixels, or third-party tracking — we will update this policy before those changes go live and will implement any consent mechanisms required by applicable law.
            </p>
            <p>
              We will update the "Last updated" date at the top of this page whenever material changes are made. The latest version is always available at rezerved.co.uk/cookie-policy.
            </p>
          </Section>

          <Section id="s10" title="10. Contact details">
            <p>
              If you have questions about this Cookie &amp; Storage Policy, please contact us at:
            </p>
            <p>
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline font-medium">
                info@rezerved.co.uk
              </a>
            </p>
            <p>
              For information about how we handle your personal data more broadly, please read our{' '}
              <a href="/privacy-policy" className="text-app-accent hover:underline">Privacy Policy</a>.
            </p>
          </Section>

        </div>

        {/* Bottom return navigation */}
        <div className="mt-8 space-y-4 pb-4">

          {preserveHold && holdCtx && (
            holdExpired ? (
              <div
                className="rounded-xl px-4 py-4 flex items-start gap-3"
                style={{ background: 'rgba(180,50,50,0.14)', border: '1px solid rgba(200,80,80,0.30)' }}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgba(220,120,120,0.90)' }} />
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(235,200,200,0.85)' }}>
                  Your table hold has expired. Please return to the booking page to choose your table again.
                </p>
              </div>
            ) : hasActiveHold ? (
              <div
                className="rounded-xl px-4 py-3.5 flex items-center gap-3"
                style={{ background: 'rgba(212,145,93,0.10)', border: '1px solid rgba(212,145,93,0.25)' }}
              >
                <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.85)' }} />
                <p className="text-sm" style={{ color: 'rgba(212,145,93,0.85)' }}>
                  Your table is still being held while you review this policy.{' '}
                  {timeRemaining !== null && (
                    <span className="font-semibold">{formatRemaining(timeRemaining)} remaining.</span>
                  )}
                </p>
              </div>
            ) : null
          )}

          <BackButton label={label} onClick={handleBack} />
        </div>

      </div>
    </Layout>
  );
}
