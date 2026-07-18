import React, { useState, useRef } from 'react';
import { Calendar, Users, CheckCircle, ArrowRight, Utensils, Bell, Star, ArrowLeft, Lock } from 'lucide-react';
import { PreLaunchHeader } from '../components/PreLaunchHeader';
import { supabase } from '../lib/supabase';

// ── Stylised River Spice floorplan preview ────────────────────────────────────

function RiverSpiceMapSVG() {
  return (
    <svg
      viewBox="0 0 220 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <rect x="8" y="8" width="204" height="164" rx="8"
        fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.13)" strokeWidth="1.5" />
      <rect x="14" y="38" width="12" height="90" rx="3"
        fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.20)" strokeWidth="1" />
      {[0, 14, 28, 42, 56, 70].map((dy, i) => (
        <circle key={i} cx="33" cy={44 + dy} r="3.5"
          fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.75" />
      ))}
      {[48, 100, 152].map((x, i) => (
        <rect key={i} x={x} y="164" width="34" height="3.5" rx="1.5"
          fill="rgba(120,190,230,0.40)" stroke="rgba(120,190,230,0.60)" strokeWidth="0.5" />
      ))}
      <circle cx="72" cy="38" r="16"
        fill="rgba(212,145,93,0.18)" stroke="rgba(212,145,93,0.95)" strokeWidth="1.75" />
      <circle cx="72" cy="38" r="22"
        fill="none" stroke="rgba(212,145,93,0.30)" strokeWidth="1.25" strokeDasharray="4 3" />
      {[[-16,0],[16,0],[0,-16],[0,16]].map(([dx,dy],i) => (
        <circle key={i} cx={72+dx} cy={38+dy} r="3" fill="rgba(212,145,93,0.55)" />
      ))}
      <circle cx="122" cy="38" r="16"
        fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.25" />
      {[[-16,0],[16,0],[0,-16],[0,16]].map(([dx,dy],i) => (
        <circle key={i} cx={122+dx} cy={38+dy} r="3" fill="rgba(255,255,255,0.18)" />
      ))}
      {[78, 110, 142].map((cy, i) => (
        <g key={i}>
          <rect x="60" y={cy - 12} width="90" height="24" rx="5"
            fill="rgba(255,255,255,0.055)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          {[75, 105, 135].map((cx) => (
            <React.Fragment key={cx}>
              <circle cx={cx} cy={cy - 18} r="3" fill="rgba(255,255,255,0.14)" />
              <circle cx={cx} cy={cy + 18} r="3" fill="rgba(255,255,255,0.14)" />
            </React.Fragment>
          ))}
        </g>
      ))}
      {[38, 78, 118, 150].map((cy, i) => (
        <g key={i}>
          <rect x="172" y={cy - 13} width="30" height="26" rx="5"
            fill="rgba(255,255,255,0.055)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          <circle cx="166" cy={cy} r="3" fill="rgba(255,255,255,0.14)" />
          <circle cx="208" cy={cy} r="3" fill="rgba(255,255,255,0.14)" />
        </g>
      ))}
      <rect x="54" y="59" width="36" height="12" rx="4" fill="rgba(212,145,93,0.22)" />
      <text x="72" y="69" textAnchor="middle" fontSize="6" fontWeight="700"
        fontFamily="system-ui, sans-serif" fill="rgba(212,145,93,1)">Selected</text>
    </svg>
  );
}

function MockBookingCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm mx-auto select-none"
      style={{
        background: 'linear-gradient(155deg, #16130f 0%, #0e0c09 70%, #13110d 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(212,145,93,0.70)' }}>
          Choose your table
        </p>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-lg font-bold" style={{ color: 'rgba(240,232,218,0.96)' }}>River Spice</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(185,170,148,0.65)' }}>
                <Calendar className="w-3 h-3" />Friday 1 August
              </span>
              <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(185,170,148,0.65)' }}>
                <Users className="w-3 h-3" />2 guests
              </span>
            </div>
          </div>
          <div className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(212,145,93,0.15)', color: 'rgba(212,145,93,0.92)', border: '1px solid rgba(212,145,93,0.28)' }}>
            7:30 PM
          </div>
        </div>
      </div>
      <div className="px-4 pt-3 pb-2">
        <p className="text-xs mb-2" style={{ color: 'rgba(185,170,148,0.50)' }}>Select a table</p>
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ padding: '10px 10px 8px' }}>
            <RiverSpiceMapSVG />
          </div>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: 'rgba(212,145,93,0.10)', border: '1px solid rgba(212,145,93,0.25)' }}>
          <div className="min-w-0">
            <p className="text-xs font-semibold" style={{ color: 'rgba(212,145,93,0.88)' }}>T8 — Corner table</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(185,170,148,0.55)' }}>Seats 2 · Quiet spot</p>
          </div>
          <div className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
            style={{ background: 'rgba(212,145,93,0.85)' }}>
            <ArrowRight className="w-3.5 h-3.5 text-black" />
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 text-center">
        <p className="text-xs" style={{ color: 'rgba(185,170,148,0.30)' }}>
          Illustrative preview — restaurant layouts may vary.
        </p>
      </div>
    </div>
  );
}

function BenefitCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl p-5 flex gap-4 items-start"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(212,145,93,0.13)', border: '1px solid rgba(212,145,93,0.25)' }}>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-sm mb-1" style={{ color: 'rgba(240,232,218,0.95)' }}>{title}</p>
        <p className="text-xs leading-relaxed" style={{ color: 'rgba(185,170,148,0.65)' }}>{body}</p>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputCls = 'w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors focus:ring-2';
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(235,225,208,0.92)',
};
const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: 'rgba(220,100,100,0.60)',
};

// ── Inline signup form ─────────────────────────────────────────────────────────

interface InlineFormProps {
  onSuccess: (email: string, insertedId: string | null) => void;
}

function InlineSignupForm({ onSuccess }: InlineFormProps) {
  const [email, setEmail] = useState('');
  const [townCity, setTownCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [consentError, setConsentError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    let ok = true;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address.');
      ok = false;
    }
    if (!consent) {
      setConsentError('Please tick the checkbox to continue.');
      ok = false;
    }
    return ok;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('diner_waitlist')
        .insert({
          email: email.trim().toLowerCase(),
          town_city: townCity.trim() || null,
          marketing_consent: consent,
          source: 'early_access_page',
          status: 'new',
        })
        .select('id')
        .maybeSingle();
      if (error) throw error;
      onSuccess(email.trim().toLowerCase(), data?.id ?? null);
    } catch {
      // silent — don't expose DB errors
      onSuccess(email.trim().toLowerCase(), null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="space-y-3">
        <div>
          <input
            type="email"
            className={inputCls}
            style={emailError ? inputErrorStyle : inputStyle}
            placeholder="Your email address *"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError(''); }}
            autoComplete="email"
          />
          {emailError && (
            <p className="mt-1 text-xs" style={{ color: 'rgba(220,100,100,0.90)' }}>{emailError}</p>
          )}
        </div>

        <input
          type="text"
          className={inputCls}
          style={inputStyle}
          placeholder="Town / city (optional)"
          value={townCity}
          onChange={e => setTownCity(e.target.value)}
          autoComplete="address-level2"
        />

        <div>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => { setConsent(e.target.checked); setConsentError(''); }}
              className="mt-0.5 w-4 h-4 rounded flex-shrink-0"
              style={{ accentColor: 'rgba(212,145,93,0.90)' }}
            />
            <span className="text-xs leading-relaxed" style={{ color: 'rgba(185,170,148,0.70)' }}>
              I agree to receive Rezerved launch updates and notifications when restaurants go live near me.
            </span>
          </label>
          {consentError && (
            <p className="mt-1 text-xs" style={{ color: 'rgba(220,100,100,0.90)' }}>{consentError}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: submitting ? 'rgba(212,145,93,0.55)' : 'rgba(212,145,93,0.90)', color: '#0a0a08' }}
        >
          {submitting ? 'Joining…' : 'Join early access'}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-xs" style={{ color: 'rgba(185,170,148,0.35)' }}>
          <Lock className="w-3 h-3" />
          No spam. Unsubscribe any time.
        </p>
      </div>
    </form>
  );
}

// ── Post-signup restaurant suggestion ─────────────────────────────────────────

interface SuggestionPromptProps {
  insertedId: string | null;
  email: string;
}

function RestaurantSuggestionPrompt({ insertedId, email }: SuggestionPromptProps) {
  const [suggestion, setSuggestion] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = suggestion.trim();
    if (!value) return;
    setSending(true);
    try {
      if (insertedId) {
        await supabase
          .from('diner_waitlist')
          .update({ requested_restaurants: value })
          .eq('id', insertedId);
      } else {
        await supabase.from('diner_waitlist').insert({
          email,
          requested_restaurants: value,
          marketing_consent: false,
          source: 'early_access_suggestion',
          status: 'new',
        });
      }
    } catch {
      // silent
    } finally {
      setSending(false);
      setDone(true);
    }
  };

  if (done) {
    return (
      <p className="text-sm text-center" style={{ color: 'rgba(185,170,148,0.70)' }}>
        Thanks for the suggestion!
      </p>
    );
  }

  return (
    <form onSubmit={handleSend} className="mt-5 pt-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <p className="text-sm font-semibold mb-3" style={{ color: 'rgba(240,232,218,0.85)' }}>
        Want to suggest a restaurant?
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          className={inputCls}
          style={inputStyle}
          placeholder="Restaurant name"
          value={suggestion}
          onChange={e => setSuggestion(e.target.value)}
        />
        <button
          type="submit"
          disabled={sending || !suggestion.trim()}
          className="flex-shrink-0 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'rgba(212,145,93,0.20)', color: 'rgba(212,145,93,0.95)', border: '1px solid rgba(212,145,93,0.30)' }}
        >
          {sending ? '…' : 'Send suggestion'}
        </button>
      </div>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface EarlyAccessPageProps {
  onBack?: () => void;
}

export function EarlyAccessPage({ onBack }: EarlyAccessPageProps) {
  const [submitted, setSubmitted] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const formSectionRef = useRef<HTMLElement>(null);

  const scrollToForm = () => {
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="customer-shell" style={{ color: 'rgba(240,232,218,0.96)' }}>
      <PreLaunchHeader
        rightSlot={
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-all duration-200 flex-shrink-0"
                style={{ color: 'rgba(185,170,148,0.85)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
            {!submitted && (
              <button
                onClick={scrollToForm}
                className="text-xs sm:text-sm font-semibold px-3 py-2 sm:px-4 rounded-xl transition-all duration-200 whitespace-nowrap hover:opacity-90"
                style={{ background: 'rgba(212,145,93,0.90)', color: '#0a0a08' }}
              >
                Join early access
              </button>
            )}
          </div>
        }
      />

      <div className="customer-scroll">
        <div className="customer-main max-w-5xl mx-auto px-4 sm:px-6 pb-20" style={{ width: '100%' }}>

          {/* ── Hero + inline form ───────────────────────────────────────────── */}
          <section className="pt-10 pb-12 lg:pt-14 lg:pb-16">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">

              {/* Left — headline + form */}
              <div>
                {/* Launch pill */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
                  style={{ background: 'rgba(212,145,93,0.12)', border: '1px solid rgba(212,145,93,0.30)', color: 'rgba(212,145,93,0.90)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  Launching August 1st
                </div>

                <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-3"
                  style={{ color: 'rgba(240,232,218,0.97)', letterSpacing: '-0.02em' }}>
                  Be first to book<br className="hidden sm:block" /> with Rezerved.
                </h1>

                <p className="text-sm sm:text-base leading-relaxed mb-7" style={{ color: 'rgba(185,170,148,0.75)' }}>
                  Choose your exact table before you arrive. Join the launch list and we'll let you know when restaurants near you go live.
                </p>

                {/* ── Inline signup form / success ── */}
                {submitted ? (
                  <div className="rounded-2xl px-7 py-8"
                    style={{ background: 'rgba(52,110,72,0.12)', border: '1px solid rgba(80,160,100,0.25)' }}>
                    <div className="flex flex-col items-center text-center mb-1">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                        style={{ background: 'rgba(52,110,72,0.20)', border: '1.5px solid rgba(80,160,100,0.40)' }}>
                        <CheckCircle className="w-6 h-6" style={{ color: 'rgba(100,185,130,0.95)' }} />
                      </div>
                      <h2 className="text-xl font-bold mb-2" style={{ color: 'rgba(240,232,218,0.97)' }}>
                        You're on the list.
                      </h2>
                      <p className="text-sm" style={{ color: 'rgba(185,170,148,0.70)' }}>
                        We'll let you know when Rezerved launches near you.
                      </p>
                    </div>
                    <RestaurantSuggestionPrompt insertedId={insertedId} email={signupEmail} />
                  </div>
                ) : (
                  <div className="rounded-2xl p-5 sm:p-6"
                    style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    <p className="text-sm font-semibold mb-4" style={{ color: 'rgba(240,232,218,0.80)' }}>
                      Join early access — free, no card needed.
                    </p>
                    <InlineSignupForm onSuccess={(em, id) => { setSignupEmail(em); setInsertedId(id); setSubmitted(true); }} />
                  </div>
                )}

                {/* Social proof nudge */}
                {!submitted && (
                  <p className="mt-4 text-xs text-center" style={{ color: 'rgba(185,170,148,0.38)' }}>
                    Launching with selected Portsmouth &amp; South Coast restaurants first.
                  </p>
                )}
              </div>

              {/* Right — mock booking card (hidden on small mobile to reduce scroll) */}
              <div className="hidden sm:block lg:pt-4">
                <MockBookingCard />
              </div>
            </div>
          </section>

          {/* ── How it works ─────────────────────────────────────────────────── */}
          <section ref={formSectionRef} className="pb-14 scroll-mt-20">
            <h2 className="text-lg font-bold mb-5" style={{ color: 'rgba(240,232,218,0.88)' }}>
              Why join early access?
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <BenefitCard
                icon={<Utensils className="w-4 h-4" style={{ color: 'rgba(212,145,93,0.90)' }} />}
                title="Pick your seat"
                body="Choose your exact table before you arrive — window, quiet corner, or wherever you like."
              />
              <BenefitCard
                icon={<Bell className="w-4 h-4" style={{ color: 'rgba(212,145,93,0.90)' }} />}
                title="First to know"
                body="We'll notify you the moment a restaurant you'd love goes live on Rezerved near you."
              />
              <BenefitCard
                icon={<Star className="w-4 h-4" style={{ color: 'rgba(212,145,93,0.90)' }} />}
                title="Instant confirmation"
                body="Confirmed booking emails, easy management and clear cancellation — no phone calls needed."
              />
            </div>
          </section>

          {/* Footer */}
          <footer className="pt-6 pb-2 border-t text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              {[
                { label: 'Booking Terms', href: '/booking-terms' },
                { label: 'Cancellation Policy', href: '/cancellation-policy' },
                { label: 'Privacy Policy', href: '/privacy-policy' },
                { label: 'Cookie Policy', href: '/cookie-policy' },
              ].map(link => (
                <a key={link.href} href={link.href}
                  className="text-xs hover:opacity-70 transition-opacity"
                  style={{ color: 'rgba(212,145,93,0.45)' }}>
                  {link.label}
                </a>
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: 'rgba(185,170,148,0.25)' }}>
              &copy; {new Date().getFullYear()} Rezerved. All rights reserved.
            </p>
          </footer>

        </div>
      </div>
    </div>
  );
}
