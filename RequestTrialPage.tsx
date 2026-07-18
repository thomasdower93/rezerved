import React, { useState, useRef } from 'react';
import { RezervdLogo } from '../components/RezervdLogo';
import { AlertCircle, CheckCircle2, ChevronLeft } from 'lucide-react';
import { submitTrialRequest } from '../services/trialRequests';

interface RequestTrialPageProps {
  onBack: () => void;
  onPrivacyPolicy: () => void;
}

const BOOKING_SYSTEMS = [
  'None',
  'ResDiary',
  'resOS',
  'OpenTable',
  'Quandoo',
  'SevenRooms',
  'SumUp / POS booking tool',
  'Other',
];

const INTEREST_OPTIONS = [
  'Online bookings',
  'Table / floor plan management',
  'Walk-ins and phone bookings',
  'Daily sheet / grid view',
  'Deposits',
  'POS integration',
  'Website booking link',
  'Other',
];

type FieldErrors = Partial<Record<string, string>>;

const INITIAL_FORM = {
  restaurant_name: '',
  contact_name: '',
  email: '',
  phone: '',
  location: '',
  current_booking_system: 'None',
  website: '',
  covers: '',
  interests: [] as string[],
  message: '',
  consent_to_contact: false,
};

function validate(form: typeof INITIAL_FORM): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.restaurant_name.trim()) errors.restaurant_name = 'Restaurant name is required';
  if (!form.location.trim()) errors.location = 'Location is required';
  if (!form.contact_name.trim()) errors.contact_name = 'Contact name is required';
  if (!form.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Please enter a valid email address';
  }
  if (!form.phone.trim()) errors.phone = 'Phone number is required';
  if (!form.consent_to_contact) errors.consent_to_contact = 'You must agree to be contacted';
  return errors;
}

export function RequestTrialPage({ onBack, onPrivacyPolicy }: RequestTrialPageProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  // Honeypot: hidden field — bots fill it, humans don't
  const [honeypot, setHoneypot] = useState('');
  const submitLockRef = useRef(false);

  const setField = <K extends keyof typeof INITIAL_FORM>(key: K, value: typeof INITIAL_FORM[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const toggleInterest = (item: string) => {
    setForm(prev => ({
      ...prev,
      interests: prev.interests.includes(item)
        ? prev.interests.filter(i => i !== item)
        : [...prev.interests, item],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    // Honeypot check — silently succeed without saving
    if (honeypot) {
      setSubmitted(true);
      return;
    }

    // Prevent double-submit
    if (submitLockRef.current || submitting) return;

    const fieldErrors = validate(form);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await submitTrialRequest({
        restaurant_name: form.restaurant_name.trim(),
        contact_name: form.contact_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        current_booking_system: form.current_booking_system,
        website: form.website.trim() || undefined,
        covers: form.covers.trim() || undefined,
        interests: form.interests.length > 0 ? form.interests : undefined,
        message: form.message.trim() || undefined,
        consent_to_contact: true,
      });
      setSubmitted(true);
    } catch {
      setServerError('Something went wrong. Please try again or email us directly.');
      submitLockRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: '#0a0a0a' }}>
      {/* Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/backgrounds/dark-website-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'saturate(1.05) contrast(1.05)',
        }}
      />
      <div
        className="absolute inset-0 z-0"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0.95) 100%)' }}
      />

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
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-16 sm:h-[72px] gap-2">
              <button onClick={onBack} className="flex items-center min-w-0">
                <RezervdLogo size="sm" linkToHome={false} />
              </button>
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-xs transition-colors duration-200 flex-shrink-0"
                style={{ color: 'rgba(255,255,255,0.4)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-16">
          <div className="w-full max-w-xl">

            {submitted ? (
              /* ── Success state ── */
              <div
                className="rounded-2xl p-8 sm:p-10 text-center"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
                  style={{ background: 'rgba(212,145,93,0.15)' }}
                >
                  <CheckCircle2 className="w-8 h-8" style={{ color: 'rgb(212,145,93)' }} />
                </div>
                <h1 className="text-2xl font-bold mb-3" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  Request received
                </h1>
                <p className="text-base leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  Thanks — your trial request has been sent. We'll contact you shortly to discuss setup and trial access.
                </p>
                <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  No account has been created yet.
                </p>
                <button
                  onClick={onBack}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.75)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.11)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                >
                  Back to Rezerved
                </button>
              </div>
            ) : (
              <>
                {/* Heading */}
                <div className="text-center mb-8">
                  <p
                    className="text-xs font-light tracking-widest uppercase mb-4"
                    style={{ color: 'rgba(212,145,93,0.75)', letterSpacing: '0.2em' }}
                  >
                    For restaurants
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'rgba(255,255,255,0.95)' }}>
                    Request a Rezerved trial
                  </h1>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Tell us about your restaurant and we'll contact you to set up a trial dashboard.
                  </p>
                </div>

                {/* Form card */}
                <form
                  onSubmit={handleSubmit}
                  noValidate
                  className="rounded-2xl p-6 sm:p-8 space-y-5"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {/* Honeypot — hidden from users, filled only by bots */}
                  <div style={{ position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
                    <input
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={e => setHoneypot(e.target.value)}
                    />
                  </div>

                  {serverError && (
                    <div
                      className="flex items-center gap-2 p-3 rounded-xl text-sm"
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'rgb(252,165,165)' }}
                    >
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {serverError}
                    </div>
                  )}

                  <SectionLabel>Your restaurant</SectionLabel>

                  <Field label="Restaurant name" required error={errors.restaurant_name}>
                    <TextInput
                      value={form.restaurant_name}
                      onChange={v => setField('restaurant_name', v)}
                      placeholder="e.g. The Golden Bistro"
                      hasError={!!errors.restaurant_name}
                    />
                  </Field>

                  <Field label="Location / town" required error={errors.location}>
                    <TextInput
                      value={form.location}
                      onChange={v => setField('location', v)}
                      placeholder="e.g. Edinburgh"
                      hasError={!!errors.location}
                    />
                  </Field>

                  <Field label="Restaurant website" error={errors.website}>
                    <TextInput
                      value={form.website}
                      onChange={v => setField('website', v)}
                      placeholder="https://..."
                      type="url"
                    />
                  </Field>

                  <Field label="Number of covers / seats" error={errors.covers}>
                    <TextInput
                      value={form.covers}
                      onChange={v => setField('covers', v)}
                      placeholder="e.g. 40"
                    />
                  </Field>

                  <SectionLabel>Your details</SectionLabel>

                  <Field label="Contact name" required error={errors.contact_name}>
                    <TextInput
                      value={form.contact_name}
                      onChange={v => setField('contact_name', v)}
                      placeholder="Full name"
                      hasError={!!errors.contact_name}
                    />
                  </Field>

                  <Field label="Email address" required error={errors.email}>
                    <TextInput
                      value={form.email}
                      onChange={v => setField('email', v)}
                      placeholder="you@restaurant.com"
                      type="email"
                      hasError={!!errors.email}
                    />
                  </Field>

                  <Field label="Phone number" required error={errors.phone}>
                    <TextInput
                      value={form.phone}
                      onChange={v => setField('phone', v)}
                      placeholder="+44..."
                      type="tel"
                      hasError={!!errors.phone}
                    />
                  </Field>

                  <SectionLabel>Current setup</SectionLabel>

                  <Field label="Current booking system" required>
                    <SelectInput
                      value={form.current_booking_system}
                      onChange={v => setField('current_booking_system', v)}
                      options={BOOKING_SYSTEMS}
                    />
                  </Field>

                  <SectionLabel>
                    What are you most interested in?{' '}
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(optional)</span>
                  </SectionLabel>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {INTEREST_OPTIONS.map(item => {
                      const checked = form.interests.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleInterest(item)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm transition-all duration-150"
                          style={{
                            background: checked ? 'rgba(212,145,93,0.15)' : 'rgba(255,255,255,0.04)',
                            border: checked ? '1px solid rgba(212,145,93,0.45)' : '1px solid rgba(255,255,255,0.08)',
                            color: checked ? 'rgb(212,145,93)' : 'rgba(255,255,255,0.6)',
                          }}
                        >
                          <span
                            className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                            style={{
                              background: checked ? 'rgba(212,145,93,0.25)' : 'rgba(255,255,255,0.06)',
                              border: checked ? '1px solid rgba(212,145,93,0.6)' : '1px solid rgba(255,255,255,0.15)',
                            }}
                          >
                            {checked && <span className="block w-2 h-2 rounded-sm" style={{ background: 'rgb(212,145,93)' }} />}
                          </span>
                          {item}
                        </button>
                      );
                    })}
                  </div>

                  <Field label="Additional notes">
                    <textarea
                      value={form.message}
                      onChange={e => setField('message', e.target.value)}
                      placeholder="Anything else you'd like us to know..."
                      rows={3}
                      className="w-full rounded-xl px-4 py-3 text-sm resize-none transition-all duration-200 outline-none"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.85)',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,145,93,0.5)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    />
                  </Field>

                  {/* Consent */}
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <button
                        type="button"
                        onClick={() => {
                          setField('consent_to_contact', !form.consent_to_contact);
                          if (errors.consent_to_contact) setErrors(prev => ({ ...prev, consent_to_contact: undefined }));
                        }}
                        className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center mt-0.5 transition-all duration-150"
                        style={{
                          background: form.consent_to_contact ? 'rgba(212,145,93,0.25)' : 'rgba(255,255,255,0.06)',
                          border: form.consent_to_contact
                            ? '1px solid rgba(212,145,93,0.6)'
                            : errors.consent_to_contact
                              ? '1px solid rgba(239,68,68,0.6)'
                              : '1px solid rgba(255,255,255,0.2)',
                        }}
                        aria-checked={form.consent_to_contact}
                        role="checkbox"
                      >
                        {form.consent_to_contact && (
                          <span className="block w-2.5 h-2.5 rounded-sm" style={{ background: 'rgb(212,145,93)' }} />
                        )}
                      </button>
                      <span className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        I agree to be contacted by Rezerved about my trial request and understand my details will be handled according to the{' '}
                        <button
                          type="button"
                          onClick={onPrivacyPolicy}
                          className="underline transition-colors duration-150"
                          style={{ color: 'rgba(212,145,93,0.85)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'rgb(212,145,93)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(212,145,93,0.85)'; }}
                        >
                          Privacy Policy
                        </button>
                        .<span style={{ color: 'rgba(239,68,68,0.8)' }}> *</span>
                      </span>
                    </label>
                    {errors.consent_to_contact && (
                      <p className="mt-1.5 ml-8 text-xs" style={{ color: 'rgb(252,165,165)' }}>
                        {errors.consent_to_contact}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                    style={{
                      background: submitting
                        ? 'rgba(212,145,93,0.4)'
                        : 'linear-gradient(135deg, rgb(212,145,93) 0%, rgb(191,131,84) 100%)',
                      color: '#fff',
                      boxShadow: submitting ? 'none' : '0 4px 20px rgba(212,145,93,0.35)',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={e => { if (!submitting) e.currentTarget.style.boxShadow = '0 6px 28px rgba(212,145,93,0.5)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = submitting ? 'none' : '0 4px 20px rgba(212,145,93,0.35)'; }}
                  >
                    {submitting ? 'Sending...' : 'Send trial request'}
                  </button>
                </form>
              </>
            )}
          </div>
        </main>

        <div className="text-center pb-6 pt-2">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {'\u00A9'} {new Date().getFullYear()} Rezerved. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Small shared sub-components ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-semibold tracking-widest uppercase pt-1"
      style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.13em' }}
    >
      {children}
    </p>
  );
}

function Field({ label, required, error, children }: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {label}
        {required && <span style={{ color: 'rgba(239,68,68,0.8)' }}> *</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs flex items-center gap-1" style={{ color: 'rgb(252,165,165)' }}>
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', hasError }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hasError?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200 outline-none"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: hasError ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.85)',
      }}
      onFocus={e => { e.currentTarget.style.borderColor = hasError ? 'rgba(239,68,68,0.7)' : 'rgba(212,145,93,0.5)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = hasError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'; }}
    />
  );
}

function SelectInput({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200 outline-none appearance-none"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.85)',
      }}
      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,145,93,0.5)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
    >
      {options.map(opt => (
        <option key={opt} value={opt} style={{ background: '#1a1a1a' }}>{opt}</option>
      ))}
    </select>
  );
}
