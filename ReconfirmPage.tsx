import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, AlertTriangle, Calendar, Clock, Users, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RezervdLogo } from '../components/RezervdLogo';

interface ReconfirmPageProps {
  action: 'confirm' | 'cancel';
  token: string;
  onManageBooking: (manageToken: string) => void;
}

type Status = 'loading' | 'confirmed' | 'cancelled' | 'already_confirmed' | 'already_cancelled' | 'error';

interface ReservationInfo {
  customer_name: string;
  restaurant_name: string;
  start_time: string;
  party_size: number;
  reservation_code?: string | null;
  manage_token?: string | null;
}

const GOLD = 'rgba(212,145,93,1)';
const GOLD_80 = 'rgba(212,145,93,0.80)';
const GOLD_DIM = 'rgba(212,145,93,0.18)';
const GOLD_BORDER = 'rgba(212,145,93,0.28)';
const TEXT_PRIMARY = 'rgba(240,232,218,0.96)';
const TEXT_SECONDARY = 'rgba(185,170,148,0.75)';
const TEXT_MUTED = 'rgba(185,170,148,0.45)';
const CARD_BG = 'rgba(14,12,10,0.82)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const INNER_BG = 'rgba(255,255,255,0.04)';
const INNER_BORDER = 'rgba(255,255,255,0.07)';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${(h % 12) || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function ReconfirmPage({ action, token, onManageBooking }: ReconfirmPageProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [reservation, setReservation] = useState<ReservationInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('This link is invalid. No token was provided.');
      return;
    }

    async function processAction() {
      try {
        if (action === 'confirm') {
          const { data, error } = await supabase.rpc(
            'confirm_reservation_by_reconfirmation_token',
            { p_token: token }
          );

          if (error) throw new Error(error.message);

          if (data?.error) {
            if (data.error === 'invalid_or_expired_token') {
              setErrorMessage('This confirmation link is invalid or has expired. Please contact the restaurant directly.');
            } else if (data.error === 'reservation_not_active') {
              setErrorMessage('This reservation is no longer active and cannot be confirmed.');
            } else {
              setErrorMessage('Unable to confirm your booking. Please contact the restaurant directly.');
            }
            setStatus('error');
            return;
          }

          setReservation({
            customer_name:    data.customer_name,
            restaurant_name:  data.restaurant_name,
            start_time:       data.start_time,
            party_size:       data.party_size,
            reservation_code: data.reservation_code,
            manage_token:     data.manage_token,
          });
          setStatus(data.already_confirmed ? 'already_confirmed' : 'confirmed');

        } else {
          const { data, error } = await supabase.rpc(
            'cancel_reservation_by_reconfirmation_token',
            { p_token: token }
          );

          if (error) throw new Error(error.message);

          if (data?.error) {
            if (data.error === 'invalid_or_expired_token') {
              setErrorMessage('This cancellation link is invalid or has expired. Please contact the restaurant directly.');
            } else if (data.error === 'reservation_not_cancellable') {
              setErrorMessage('This reservation cannot be cancelled using this link. Please contact the restaurant directly.');
            } else {
              setErrorMessage('Unable to cancel your booking. Please contact the restaurant directly.');
            }
            setStatus('error');
            return;
          }

          setReservation({
            customer_name:    data.customer_name,
            restaurant_name:  data.restaurant_name,
            start_time:       data.start_time,
            party_size:       data.party_size,
            reservation_code: data.reservation_code,
            manage_token:     data.manage_token,
          });
          setStatus(data.already_cancelled ? 'already_cancelled' : 'cancelled');
        }

      } catch (err) {
        console.error('[ReconfirmPage] Error:', err);
        setErrorMessage('Something went wrong. Please try again or contact the restaurant directly.');
        setStatus('error');
      }
    }

    processAction();
  }, [action, token]);

  const isConfirmFlow = action === 'confirm';

  const stateConfig: Record<Status, { icon: React.ReactNode; title: string; subtitle: string; iconRing: string; iconColor: string }> = {
    loading: {
      icon: <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: GOLD }} />,
      title: isConfirmFlow ? 'Confirming your booking…' : 'Cancelling your booking…',
      subtitle: 'Please wait a moment.',
      iconRing: 'rgba(212,145,93,0.15)',
      iconColor: GOLD_BORDER,
    },
    confirmed: {
      icon: <CheckCircle style={{ width: 28, height: 28, color: 'rgba(100,185,130,0.90)' }} strokeWidth={2} />,
      title: 'Booking confirmed',
      subtitle: 'Thank you — your table is confirmed. We look forward to seeing you.',
      iconRing: 'rgba(52,110,72,0.18)',
      iconColor: 'rgba(80,160,100,0.35)',
    },
    already_confirmed: {
      icon: <CheckCircle style={{ width: 28, height: 28, color: 'rgba(100,185,130,0.90)' }} strokeWidth={2} />,
      title: 'Already confirmed',
      subtitle: 'Your booking has already been confirmed. We look forward to seeing you.',
      iconRing: 'rgba(52,110,72,0.18)',
      iconColor: 'rgba(80,160,100,0.35)',
    },
    cancelled: {
      icon: <XCircle style={{ width: 28, height: 28, color: 'rgba(220,80,80,0.85)' }} strokeWidth={2} />,
      title: 'Booking cancelled',
      subtitle: 'Your booking has been cancelled and the table has been released.',
      iconRing: 'rgba(120,30,30,0.22)',
      iconColor: 'rgba(180,60,60,0.35)',
    },
    already_cancelled: {
      icon: <XCircle style={{ width: 28, height: 28, color: 'rgba(160,100,100,0.80)' }} strokeWidth={2} />,
      title: 'Already cancelled',
      subtitle: 'This booking was already cancelled.',
      iconRing: 'rgba(80,40,40,0.22)',
      iconColor: 'rgba(140,70,70,0.28)',
    },
    error: {
      icon: <AlertTriangle style={{ width: 28, height: 28, color: 'rgba(240,160,50,0.90)' }} strokeWidth={2} />,
      title: 'Unable to process',
      subtitle: errorMessage,
      iconRing: 'rgba(120,80,20,0.20)',
      iconColor: 'rgba(200,130,30,0.30)',
    },
  };

  const cfg = stateConfig[status] ?? stateConfig.error;

  return (
    <div
      className="dark"
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a0a',
      }}
    >
      {/* Bokeh background */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: 'url(/restaurant-bokeh-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.18,
          zIndex: 0,
        }}
      />
      {/* Vignette overlay */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.72) 100%)',
          zIndex: 1,
        }}
      />

      {/* Header */}
      <header
        style={{
          position: 'relative',
          zIndex: 10,
          borderBottom: `1px solid ${CARD_BORDER}`,
          background: 'rgba(10,9,8,0.70)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }} className="sm:!h-[72px]">
          <RezervdLogo size="sm" />
          <span style={{ fontSize: 10, color: TEXT_MUTED, letterSpacing: '0.16em', textTransform: 'uppercase', display: 'none' }} className="sm:inline-block">
            Dine with intention
          </span>
        </div>
      </header>

      {/* Main content */}
      <main
        style={{
          position: 'relative',
          zIndex: 10,
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 'clamp(24px, 5vw, 56px) 16px clamp(48px, 8vw, 80px)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 560 }}>

          {/* Main card */}
          <div
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 20,
              overflow: 'hidden',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.30)',
            }}
          >
            {/* Hero section */}
            <div
              style={{
                padding: 'clamp(32px,5vw,48px) clamp(24px,5vw,40px) clamp(24px,4vw,36px)',
                borderBottom: `1px solid ${CARD_BORDER}`,
                textAlign: 'center',
                background: 'linear-gradient(160deg, rgba(20,18,14,0.60) 0%, rgba(10,9,8,0.40) 100%)',
              }}
            >
              {/* Icon ring */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: cfg.iconRing,
                    border: `1.5px solid ${cfg.iconColor}`,
                  }}
                >
                  {cfg.icon}
                </div>
              </div>

              <h1
                style={{
                  fontSize: 'clamp(20px, 4vw, 26px)',
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  margin: '0 0 10px',
                  fontFamily: 'Georgia, serif',
                  letterSpacing: '-0.01em',
                }}
              >
                {cfg.title}
              </h1>
              <p style={{ color: TEXT_SECONDARY, fontSize: 14, margin: 0, lineHeight: 1.65 }}>
                {cfg.subtitle}
              </p>

              {/* Extra cancelled note */}
              {status === 'cancelled' && reservation && (
                <p style={{ color: TEXT_MUTED, fontSize: 12, margin: '14px 0 0', lineHeight: 1.6 }}>
                  If you cancelled by mistake, contact {reservation.restaurant_name} directly to rebook.
                </p>
              )}
            </div>

            {/* Booking details */}
            {reservation && status !== 'loading' && (
              <div style={{ padding: 'clamp(20px,4vw,32px) clamp(24px,5vw,40px)' }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: GOLD_80,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    margin: '0 0 16px',
                  }}
                >
                  {status === 'cancelled' || status === 'already_cancelled' ? 'Cancelled Booking' : 'Confirmed Booking'}
                </p>

                {/* Restaurant name */}
                <p style={{ color: TEXT_PRIMARY, fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>
                  {reservation.restaurant_name}
                </p>

                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: reservation.reservation_code ? 16 : 0 }}>
                  <DetailTile icon={<Calendar style={{ width: 14, height: 14, color: GOLD_80, flexShrink: 0 }} />} label="Date" value={formatDate(reservation.start_time)} />
                  <DetailTile icon={<Clock style={{ width: 14, height: 14, color: GOLD_80, flexShrink: 0 }} />} label="Time" value={formatTime(reservation.start_time)} />
                  <DetailTile icon={<Users style={{ width: 14, height: 14, color: GOLD_80, flexShrink: 0 }} />} label="Guests" value={`${reservation.party_size} ${reservation.party_size === 1 ? 'guest' : 'guests'}`} />
                </div>

                {/* Reservation code pill */}
                {reservation.reservation_code && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: GOLD_DIM,
                      border: `1px solid ${GOLD_BORDER}`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      marginTop: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Booking ref</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '0.10em', fontFamily: 'monospace' }}>
                      {reservation.reservation_code}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {status !== 'loading' && (
              <div
                style={{
                  padding: 'clamp(16px,3vw,24px) clamp(24px,5vw,40px) clamp(24px,4vw,36px)',
                  borderTop: `1px solid ${CARD_BORDER}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {reservation?.manage_token && (
                  <button
                    onClick={() => onManageBooking(reservation.manage_token!)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '13px 20px',
                      borderRadius: 12,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: `linear-gradient(135deg, rgba(212,145,93,0.90) 0%, rgba(191,121,70,0.90) 100%)`,
                      border: 'none',
                      color: '#1a0f05',
                      letterSpacing: '0.01em',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    Manage booking
                    <ArrowRight style={{ width: 15, height: 15 }} />
                  </button>
                )}
                <a
                  href="/"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '12px 20px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: INNER_BG,
                    border: `1px solid ${CARD_BORDER}`,
                    color: TEXT_SECONDARY,
                    textDecoration: 'none',
                    transition: 'border-color 0.2s, color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = GOLD_BORDER;
                    e.currentTarget.style.color = TEXT_PRIMARY;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = CARD_BORDER;
                    e.currentTarget.style.color = TEXT_SECONDARY;
                  }}
                >
                  Make another reservation
                </a>
              </div>
            )}
          </div>

          {/* Footer brand note */}
          <p style={{ textAlign: 'center', fontSize: 11, color: TEXT_MUTED, marginTop: 24, letterSpacing: '0.06em' }}>
            Rezerved · Dine with intention
          </p>
        </div>
      </main>
    </div>
  );
}

function DetailTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: INNER_BG,
        border: `1px solid ${INNER_BORDER}`,
        borderRadius: 12,
        padding: '10px 14px',
      }}
    >
      {icon}
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUTED, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>{value}</div>
      </div>
    </div>
  );
}
