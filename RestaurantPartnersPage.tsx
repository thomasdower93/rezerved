import React, { useState } from 'react';
import { LayoutDashboard, Utensils, Grid3x3 as Grid3X3, CreditCard, Plug, CheckCircle, ArrowRight, ArrowDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { PreLaunchHeader } from '../components/PreLaunchHeader';
import { supabase } from '../lib/supabase';

// ── Mock dashboard card ────────────────────────────────────────────────────────

function MockDashboardCard() {
  const slots = [
    { time: '12:00', covers: 8, filled: true },
    { time: '13:00', covers: 14, filled: true },
    { time: '18:00', covers: 6, filled: false },
    { time: '19:00', covers: 42, filled: true, peak: true },
    { time: '20:00', covers: 28, filled: true },
    { time: '21:00', covers: 10, filled: false },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm mx-auto select-none"
      style={{
        background: 'linear-gradient(155deg, #16130f 0%, #0e0c09 70%, #13110d 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Dashboard header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(212,145,93,0.70)' }}>
          Today's bookings
        </p>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-3xl font-bold" style={{ color: 'rgba(240,232,218,0.97)' }}>42</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(185,170,148,0.55)' }}>covers</p>
          </div>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-1"
            style={{ background: 'rgba(212,145,93,0.15)', border: '1px solid rgba(212,145,93,0.28)', color: 'rgba(212,145,93,0.90)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            7:30 PM peak
          </div>
        </div>
      </div>

      {/* Booking grid */}
      <div className="px-5 py-4">
        <p className="text-xs mb-3" style={{ color: 'rgba(185,170,148,0.50)' }}>Booking grid — today</p>
        <div className="space-y-1.5">
          {slots.map(slot => (
            <div key={slot.time} className="flex items-center gap-3">
              <span className="text-xs w-10 flex-shrink-0 font-mono" style={{ color: 'rgba(185,170,148,0.50)' }}>
                {slot.time}
              </span>
              <div className="flex-1 rounded-full overflow-hidden h-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (slot.covers / 50) * 100)}%`,
                    background: slot.peak
                      ? 'rgba(212,145,93,0.85)'
                      : slot.filled
                      ? 'rgba(212,145,93,0.40)'
                      : 'rgba(255,255,255,0.12)',
                  }}
                />
              </div>
              <span className="text-xs w-6 text-right flex-shrink-0 font-medium" style={{ color: slot.peak ? 'rgba(212,145,93,0.90)' : 'rgba(185,170,148,0.50)' }}>
                {slot.covers}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Table selection badge */}
      <div className="px-5 pb-5">
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(212,145,93,0.08)', border: '1px solid rgba(212,145,93,0.22)' }}
        >
          <Utensils className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.80)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: 'rgba(212,145,93,0.88)' }}>Table selection enabled</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(185,170,148,0.55)' }}>Guests choose their table at booking</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Feature card ───────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(212,145,93,0.12)', border: '1px solid rgba(212,145,93,0.24)' }}
      >
        {icon}
      </div>
      <div>
        <p className="font-bold text-sm mb-1.5" style={{ color: 'rgba(240,232,218,0.95)' }}>{title}</p>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(185,170,148,0.70)' }}>{body}</p>
      </div>
    </div>
  );
}

// ── Timeline step ──────────────────────────────────────────────────────────────

function TimelineStep({ number, title, body, last }: { number: number; title: string; body: string; last?: boolean }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: 'rgba(212,145,93,0.16)', border: '1.5px solid rgba(212,145,93,0.40)', color: 'rgba(212,145,93,0.95)' }}
        >
          {number}
        </div>
        {!last && (
          <div className="w-px flex-1 mt-2" style={{ background: 'rgba(212,145,93,0.18)', minHeight: '32px' }} />
        )}
      </div>
      <div className="pb-8 pt-1">
        <p className="font-bold text-sm mb-1" style={{ color: 'rgba(240,232,218,0.95)' }}>{title}</p>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(185,170,148,0.68)' }}>{body}</p>
      </div>
    </div>
  );
}

// ── Field ──────────────────────────────────────────────────────────────────────

function Field({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(185,170,148,0.85)' }}>
        {label}{required && <span className="ml-1" style={{ color: 'rgba(212,145,93,0.80)' }}>*</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs" style={{ color: 'rgba(220,100,100,0.90)' }}>{error}</p>}
    </div>
  );
}

const inputCls = 'w-full px-4 py-2.5 rounded-xl text-sm transition-colors outline-none focus:ring-2';
const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(235,225,208,0.92)',
};

// ── Main page ──────────────────────────────────────────────────────────────────

const FEATURES = [
  'Online bookings',
  'Customer table selection',
  'Daily booking grid',
  'Deposits for larger parties',
  'Website booking link',
  'Walk-ins / telephone bookings',
  'POS or SumUp integration',
] as const;

interface FormState {
  restaurant_name: string;
  contact_name: string;
  email: string;
  phone: string;
  website_or_social: string;
  address: string;
  town_city: string;
  current_booking_method: string;
  current_booking_system: string;
  approximate_covers: string;
  interested_features: string[];
  contact_consent: boolean;
}

const emptyForm: FormState = {
  restaurant_name: '',
  contact_name: '',
  email: '',
  phone: '',
  website_or_social: '',
  address: '',
  town_city: '',
  current_booking_method: '',
  current_booking_system: '',
  approximate_covers: '',
  interested_features: [],
  contact_consent: false,
};

interface FieldErrors {
  restaurant_name?: string;
  email?: string;
  contact_consent?: string;
}

interface RestaurantPartnersPageProps {
  onBack?: () => void;
}

export function RestaurantPartnersPage({ onBack }: RestaurantPartnersPageProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const formRef = React.useRef<HTMLDivElement>(null);
  const featuresRef = React.useRef<HTMLDivElement>(null);

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleFeature = (feat: string) => {
    setForm(prev => ({
      ...prev,
      interested_features: prev.interested_features.includes(feat)
        ? prev.interested_features.filter(f => f !== feat)
        : [...prev.interested_features, feat],
    }));
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!form.restaurant_name.trim()) errs.restaurant_name = 'Please enter your restaurant name.';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Please enter a valid email address.';
    }
    if (!form.contact_consent) errs.contact_consent = 'Please tick the checkbox to continue.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('restaurant_leads').insert({
        restaurant_name: form.restaurant_name.trim(),
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        website_or_social: form.website_or_social.trim() || null,
        address: form.address.trim() || null,
        town_city: form.town_city.trim() || null,
        current_booking_method: form.current_booking_method.trim() || null,
        current_booking_system: form.current_booking_system.trim() || null,
        approximate_covers: form.approximate_covers.trim() || null,
        interested_features: form.interested_features.length > 0 ? form.interested_features : null,
        contact_consent: form.contact_consent,
        source: 'restaurant_partners_page',
        status: 'lead_submitted',
      });
      if (error) throw error;
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('Something went wrong. Please try again or email us at info@rezerved.co.uk.');
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollToFeatures = () => featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div
      className="customer-shell"
      style={{ color: 'rgba(240,232,218,0.96)' }}
    >
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
            <button
              onClick={scrollToForm}
              className="text-xs sm:text-sm font-semibold px-3 py-2 sm:px-4 rounded-xl transition-all duration-200 hover:opacity-90 whitespace-nowrap"
              style={{ background: 'rgba(212,145,93,0.90)', color: '#0a0a08' }}
            >
              Register now
            </button>
          </div>
        }
      />

      <div className="customer-scroll"><div className="customer-main max-w-5xl mx-auto px-4 sm:px-6 pb-20" style={{ width: '100%' }}>

        {/* ── Hero ── */}
        <section className="pt-14 pb-16 lg:pt-20 lg:pb-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">

            {/* Left — copy */}
            <div className="animate-slideUp">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
                style={{ background: 'rgba(212,145,93,0.12)', border: '1px solid rgba(212,145,93,0.30)', color: 'rgba(212,145,93,0.90)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                Restaurant early access
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-5" style={{ color: 'rgba(240,232,218,0.97)', letterSpacing: '-0.02em' }}>
                Bring table-selection<br className="hidden sm:block" /> bookings to your<br className="hidden sm:block" /> restaurant.
              </h1>

              <p className="text-base sm:text-lg leading-relaxed mb-3" style={{ color: 'rgba(185,170,148,0.80)' }}>
                Rezerved gives restaurants a modern way to take bookings, manage covers, and let guests choose where they sit before they arrive.
              </p>
              <p className="text-sm mb-8" style={{ color: 'rgba(185,170,148,0.48)' }}>
                Launching with selected restaurants from August 1st.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <button
                  onClick={scrollToForm}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                  style={{ background: 'rgba(212,145,93,0.90)', color: '#0a0a08' }}
                >
                  Register my restaurant
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={scrollToFeatures}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-80"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(185,170,148,0.85)' }}
                >
                  See what Rezerved offers
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right — mock dashboard */}
            <div className="animate-slideInRight">
              <MockDashboardCard />
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section ref={featuresRef} className="pb-16 scroll-mt-20">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2 text-center" style={{ color: 'rgba(212,145,93,0.70)' }}>
            What you get
          </p>
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'rgba(240,232,218,0.96)' }}>
            Everything your restaurant needs
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={<LayoutDashboard className="w-5 h-5" style={{ color: 'rgba(212,145,93,0.90)' }} />}
              title="Live booking dashboard"
              body="Manage reservations, covers and guest details in one place, updated in real time."
            />
            <FeatureCard
              icon={<Utensils className="w-5 h-5" style={{ color: 'rgba(212,145,93,0.90)' }} />}
              title="Customer table selection"
              body="Let guests choose available tables before they arrive — your layout, their preference."
            />
            <FeatureCard
              icon={<Grid3X3 className="w-5 h-5" style={{ color: 'rgba(212,145,93,0.90)' }} />}
              title="Daily booking grid"
              body="See incoming covers clearly across the day. Spot peaks and gaps at a glance."
            />
            <FeatureCard
              icon={<CreditCard className="w-5 h-5" style={{ color: 'rgba(212,145,93,0.90)' }} />}
              title="Deposits and larger party controls"
              body="Support deposits, booking rules and restaurant-specific settings for larger groups."
            />
            <FeatureCard
              icon={<Plug className="w-5 h-5" style={{ color: 'rgba(212,145,93,0.90)' }} />}
              title="POS and payment integrations"
              body="Rezerved is being shaped around real restaurant workflows, including deposit-taking and future POS integrations."
            />
            <FeatureCard
              icon={<ChevronRight className="w-5 h-5" style={{ color: 'rgba(212,145,93,0.90)' }} />}
              title="Your launch, your timeline"
              body="We configure your dashboard and listing before you go live. Launch when you're ready."
            />
          </div>
        </section>

        {/* ── Launch process ── */}
        <section className="pb-16">
          <div className="max-w-xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2 text-center" style={{ color: 'rgba(212,145,93,0.70)' }}>
              How it works
            </p>
            <h2 className="text-2xl font-bold text-center mb-10" style={{ color: 'rgba(240,232,218,0.96)' }}>
              From registration to launch
            </h2>

            <div>
              <TimelineStep number={1} title="Register interest" body="Tell us about your restaurant using the form below." />
              <TimelineStep number={2} title="Setup review" body="We check your venue details and booking needs, and follow up if we need anything." />
              <TimelineStep number={3} title="Dashboard prepared" body="Your account and restaurant profile are configured and ready to review." />
              <TimelineStep number={4} title="Go live" body="Your listing can start accepting bookings from launch." last />
            </div>
          </div>
        </section>

        {/* ── Restaurant form ── */}
        <section ref={formRef} className="pb-8 scroll-mt-20">
          {submitted ? (
            <div
              className="rounded-2xl px-8 py-12 text-center"
              style={{ background: 'rgba(52,110,72,0.12)', border: '1px solid rgba(80,160,100,0.25)' }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(52,110,72,0.20)', border: '1.5px solid rgba(80,160,100,0.40)' }}>
                <CheckCircle className="w-7 h-7" style={{ color: 'rgba(100,185,130,0.95)' }} />
              </div>
              <h2 className="text-2xl font-bold mb-3" style={{ color: 'rgba(240,232,218,0.97)' }}>
                Thanks — your restaurant has been registered for early access.
              </h2>
              <p className="text-base max-w-md mx-auto" style={{ color: 'rgba(185,170,148,0.75)' }}>
                We'll review your details and contact you about preparing your Rezerved dashboard.
              </p>
            </div>
          ) : (
            <div
              className="rounded-2xl p-6 sm:p-8"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <h2 className="text-xl font-bold mb-1.5" style={{ color: 'rgba(240,232,218,0.96)' }}>
                Register my restaurant
              </h2>
              <p className="text-sm mb-7" style={{ color: 'rgba(185,170,148,0.60)' }}>
                Tell us about your venue and we'll be in touch to get you set up.
              </p>

              <form onSubmit={handleSubmit} noValidate className="space-y-5">

                {/* Row 1 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Restaurant name" required error={errors.restaurant_name}>
                    <input
                      type="text"
                      className={inputCls}
                      style={{ ...inputStyle, ...(errors.restaurant_name ? { borderColor: 'rgba(220,100,100,0.60)' } : {}) }}
                      placeholder="The Golden Bistro"
                      value={form.restaurant_name}
                      onChange={e => { set('restaurant_name', e.target.value); setErrors(p => ({ ...p, restaurant_name: undefined })); }}
                    />
                  </Field>
                  <Field label="Contact name">
                    <input
                      type="text"
                      className={inputCls}
                      style={inputStyle}
                      placeholder="Your name"
                      value={form.contact_name}
                      onChange={e => set('contact_name', e.target.value)}
                    />
                  </Field>
                </div>

                {/* Row 2 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Email address" required error={errors.email}>
                    <input
                      type="email"
                      className={inputCls}
                      style={{ ...inputStyle, ...(errors.email ? { borderColor: 'rgba(220,100,100,0.60)' } : {}) }}
                      placeholder="you@restaurant.co.uk"
                      value={form.email}
                      onChange={e => { set('email', e.target.value); setErrors(p => ({ ...p, email: undefined })); }}
                    />
                  </Field>
                  <Field label="Phone number">
                    <input
                      type="tel"
                      className={inputCls}
                      style={inputStyle}
                      placeholder="+44 7700 000000"
                      value={form.phone}
                      onChange={e => set('phone', e.target.value)}
                    />
                  </Field>
                </div>

                {/* Row 3 */}
                <Field label="Restaurant website or social page">
                  <input
                    type="text"
                    className={inputCls}
                    style={inputStyle}
                    placeholder="https://www.yourrestaurant.co.uk"
                    value={form.website_or_social}
                    onChange={e => set('website_or_social', e.target.value)}
                  />
                </Field>

                {/* Row 4 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Restaurant address">
                    <input
                      type="text"
                      className={inputCls}
                      style={inputStyle}
                      placeholder="123 High Street"
                      value={form.address}
                      onChange={e => set('address', e.target.value)}
                    />
                  </Field>
                  <Field label="Town / city">
                    <input
                      type="text"
                      className={inputCls}
                      style={inputStyle}
                      placeholder="Manchester"
                      value={form.town_city}
                      onChange={e => set('town_city', e.target.value)}
                    />
                  </Field>
                </div>

                {/* Row 5 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Current booking method">
                    <input
                      type="text"
                      className={inputCls}
                      style={inputStyle}
                      placeholder="e.g. Phone, walk-in, website"
                      value={form.current_booking_method}
                      onChange={e => set('current_booking_method', e.target.value)}
                    />
                  </Field>
                  <Field label="Current booking system">
                    <input
                      type="text"
                      className={inputCls}
                      style={inputStyle}
                      placeholder="e.g. OpenTable, none"
                      value={form.current_booking_system}
                      onChange={e => set('current_booking_system', e.target.value)}
                    />
                  </Field>
                </div>

                {/* Row 6 */}
                <Field label="Approximate number of covers">
                  <input
                    type="text"
                    className={inputCls}
                    style={inputStyle}
                    placeholder="e.g. 40–60"
                    value={form.approximate_covers}
                    onChange={e => set('approximate_covers', e.target.value)}
                  />
                </Field>

                {/* Feature interest */}
                <div>
                  <p className="block text-sm font-medium mb-3" style={{ color: 'rgba(185,170,148,0.85)' }}>
                    Features you're interested in
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {FEATURES.map(feat => {
                      const checked = form.interested_features.includes(feat);
                      return (
                        <label
                          key={feat}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-150"
                          style={{
                            background: checked ? 'rgba(212,145,93,0.10)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${checked ? 'rgba(212,145,93,0.30)' : 'rgba(255,255,255,0.08)'}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFeature(feat)}
                            className="w-4 h-4 rounded flex-shrink-0"
                            style={{ accentColor: 'rgba(212,145,93,0.90)' }}
                          />
                          <span className="text-xs font-medium" style={{ color: checked ? 'rgba(212,145,93,0.88)' : 'rgba(185,170,148,0.72)' }}>
                            {feat}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Consent */}
                <div>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.contact_consent}
                      onChange={e => { set('contact_consent', e.target.checked); setErrors(p => ({ ...p, contact_consent: undefined })); }}
                      className="mt-0.5 w-4 h-4 rounded flex-shrink-0"
                      style={{ accentColor: 'rgba(212,145,93,0.90)' }}
                    />
                    <span className="text-xs leading-relaxed" style={{ color: 'rgba(185,170,148,0.75)' }}>
                      I agree for Rezerved to contact me about setting up my restaurant account.
                    </span>
                  </label>
                  {errors.contact_consent && (
                    <p className="mt-1.5 text-xs" style={{ color: 'rgba(220,100,100,0.90)' }}>{errors.contact_consent}</p>
                  )}
                </div>

                {submitError && (
                  <div
                    className="rounded-xl px-4 py-3 text-sm"
                    style={{ background: 'rgba(160,40,40,0.14)', border: '1px solid rgba(200,80,80,0.30)', color: 'rgba(220,140,140,0.90)' }}
                  >
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: submitting ? 'rgba(212,145,93,0.55)' : 'rgba(212,145,93,0.90)', color: '#0a0a08' }}
                >
                  {submitting ? 'Registering…' : 'Register restaurant'}
                </button>
              </form>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="pt-8 pb-2 border-t text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs">
            {[
              { label: 'Booking Terms', href: '/booking-terms' },
              { label: 'Cancellation Policy', href: '/cancellation-policy' },
              { label: 'Privacy Policy', href: '/privacy-policy' },
              { label: 'Cookie Policy', href: '/cookie-policy' },
            ].map(link => (
              <a
                key={link.href}
                href={link.href}
                className="hover:opacity-70 transition-opacity"
                style={{ color: 'rgba(212,145,93,0.45)' }}
              >
                {link.label}
              </a>
            ))}
          </div>
          <p className="mt-3 text-xs" style={{ color: 'rgba(185,170,148,0.25)' }}>
            &copy; {new Date().getFullYear()} Rezerved. All rights reserved.
          </p>
        </footer>

      </div></div>{/* end customer-main / customer-scroll */}
    </div>
  );
}
