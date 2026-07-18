import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { CheckCircle, Copy, Calendar, Clock, Users, Utensils, MessageSquare, Banknote, AlertCircle, RefreshCw } from 'lucide-react';
import { Reservation } from '../lib/types';
import { getReservationByToken } from '../services/reservations';
import { getPaymentForReservation, formatDepositAmount } from '../services/deposits';
import { formatDuration, getReservationDuration } from '../lib/utils';
import type { ReservationPayment } from '../lib/types';

interface ConfirmationPageProps {
  token: string;
  reservationCode?: string;
  emailSent?: boolean;
  emailError?: string;
  customerEmail?: string;
  depositOutcome?: 'paid' | 'cancelled' | null;
  awaitingAcceptance?: boolean;
  onNewBooking: () => void;
  onStaffLogin: () => void;
  onManageReservation: () => void;
  onOpenChat?: () => void;
}

export function ConfirmationPage({ token, reservationCode: codeProp, emailSent, emailError, customerEmail, depositOutcome, awaitingAcceptance, onNewBooking, onStaffLogin, onManageReservation, onOpenChat }: ConfirmationPageProps) {
  const [reservation, setReservation] = useState<(Reservation & { table_name?: string }) | null>(null);
  const [payment, setPayment] = useState<ReservationPayment | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getReservationByToken(token)
      .then(res => {
        setReservation(res);
        if (res && res.payment_required) {
          getPaymentForReservation(res.id).then(p => setPayment(p)).catch(() => {});
        }
      })
      .catch(console.error);
  }, [token]);

  // Prefer the prop (available immediately); fall back to what Supabase returns
  const displayCode = codeProp || reservation?.reservation_code || null;

  const copyToClipboard = () => {
    if (!displayCode) return;
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasPreorder = reservation?.preorder_items && reservation.preorder_items.length > 0;

  const formatDate = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHour}:${displayMinutes} ${ampm}`;
  };

  const depositCancelled = depositOutcome === 'cancelled' ||
    reservation?.status === 'payment_failed' ||
    reservation?.status === 'pending_payment';
  const depositPaid = payment?.status === 'paid' || depositOutcome === 'paid';
  const isAwaitingAcceptance = awaitingAcceptance === true || reservation?.status === 'pending_acceptance';

  return (
    <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} bookingStep="confirmation">
      <div className="max-w-3xl mx-auto">

        {/* Hero panel */}
        <div className="rounded-2xl overflow-hidden shadow-2xl mb-6 border border-white/[0.06]" style={{ background: 'linear-gradient(160deg, #141210 0%, #0e0c0a 60%, #111009 100%)' }}>
          <div className="px-8 pt-10 pb-8 text-center border-b border-white/[0.06]">
            <div className="flex justify-center mb-5">
              <div className="relative">
                {depositCancelled ? (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(180,50,50,0.18)', border: '1.5px solid rgba(200,80,80,0.35)' }}>
                    <AlertCircle className="w-8 h-8" style={{ color: 'rgba(220,100,100,0.90)' }} strokeWidth={2} />
                  </div>
                ) : isAwaitingAcceptance ? (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(180,120,35,0.18)', border: '1.5px solid rgba(220,160,70,0.35)' }}>
                    <Clock className="w-8 h-8" style={{ color: 'rgba(230,175,85,0.95)' }} strokeWidth={2} />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(52,110,72,0.18)', border: '1.5px solid rgba(80,160,100,0.35)' }}>
                    <CheckCircle className="w-8 h-8" style={{ color: 'rgba(100,185,130,0.90)' }} strokeWidth={2} />
                  </div>
                )}
              </div>
            </div>

            {depositCancelled ? (
              <>
                <h1 className="text-3xl font-bold mb-2" style={{ color: 'rgba(240,232,218,0.96)', letterSpacing: '-0.01em' }}>
                  Booking Not Confirmed
                </h1>
                <p className="text-sm font-medium" style={{ color: 'rgba(220,100,100,0.72)' }}>
                  Deposit payment was not completed.
                </p>
              </>
            ) : isAwaitingAcceptance ? (
              <>
                <h1 className="text-3xl font-bold mb-2" style={{ color: 'rgba(240,232,218,0.96)', letterSpacing: '-0.01em' }}>
                  Request Received
                </h1>
                <p className="text-sm font-medium" style={{ color: 'rgba(230,175,85,0.78)' }}>
                  The restaurant is reviewing your reservation request.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-bold mb-2" style={{ color: 'rgba(240,232,218,0.96)', letterSpacing: '-0.01em' }}>
                  Reservation Confirmed
                </h1>
                <p className="text-sm font-medium" style={{ color: 'rgba(185,170,148,0.72)' }}>
                  We look forward to welcoming you.
                </p>
              </>
            )}
          </div>

          {/* Deposit cancelled/failed state — offer retry */}
          {depositCancelled && reservation && (
            <div className="px-8 py-5 border-b border-white/[0.06]">
              <div className="rounded-xl px-4 py-4 space-y-3" style={{ background: 'rgba(200,60,60,0.10)', border: '1px solid rgba(200,80,80,0.25)' }}>
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgba(220,100,100,0.85)' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'rgba(235,200,200,0.92)' }}>Payment not completed</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(200,160,160,0.75)' }}>
                      Your reservation is not confirmed. The deposit payment was not completed or was cancelled. The table hold will be released automatically.
                    </p>
                  </div>
                </div>
                <button
                  onClick={onNewBooking}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full justify-center"
                  style={{ background: 'rgba(200,60,60,0.20)', color: 'rgba(235,200,200,0.90)', border: '1px solid rgba(200,80,80,0.30)' }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Deposit paid banner */}
          {depositPaid && reservation?.deposit_amount_pence && (
            <div className="px-8 py-4 border-b border-white/[0.06]">
              <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(52,110,72,0.15)', border: '1px solid rgba(80,160,100,0.25)' }}>
                <Banknote className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(100,185,130,0.85)' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'rgba(200,235,210,0.92)' }}>
                    Deposit paid: {formatDepositAmount(reservation.deposit_amount_pence)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(160,210,175,0.72)' }}>
                    Your deposit will be deducted from your bill at the restaurant.
                  </p>
                </div>
              </div>
            </div>
          )}

          {reservation && !depositCancelled && (
            <div className="px-8 py-6">
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(212,145,93,0.75)' }}>
                Reservation Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.80)' }} />
                  <div>
                    <div className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'rgba(185,170,148,0.50)', fontSize: '10px' }}>Date</div>
                    <div className="text-sm font-semibold" style={{ color: 'rgba(235,225,208,0.92)' }}>{formatDate(reservation.start_time)}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.80)' }} />
                  <div>
                    <div className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'rgba(185,170,148,0.50)', fontSize: '10px' }}>Time</div>
                    <div className="text-sm font-semibold" style={{ color: 'rgba(235,225,208,0.92)' }}>{formatTime(reservation.start_time)}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <Users className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.80)' }} />
                  <div>
                    <div className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'rgba(185,170,148,0.50)', fontSize: '10px' }}>Party Size</div>
                    <div className="text-sm font-semibold" style={{ color: 'rgba(235,225,208,0.92)' }}>{reservation.party_size} {reservation.party_size === 1 ? 'Guest' : 'Guests'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <Utensils className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.80)' }} />
                  <div>
                    <div className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'rgba(185,170,148,0.50)', fontSize: '10px' }}>Table</div>
                    <div className="text-sm font-semibold" style={{ color: 'rgba(235,225,208,0.92)' }}>{reservation.table_name || 'Assigned'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="premium-card rounded-2xl p-8">
          {/* What happens next */}
          <div className="bg-gradient-to-br from-app-bg-tertiary to-app-bg rounded-xl p-6 mb-8 text-left border border-app-border">
            <h2 className="font-bold text-app-text mb-5 text-base uppercase tracking-wider text-sm" style={{ color: 'rgba(212,145,93,0.85)', letterSpacing: '0.08em', fontSize: '11px' }}>What happens next</h2>
            <ul className="space-y-4 text-app-text">
              <li className="flex items-start gap-4">
                <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full" style={{ background: 'rgba(212,145,93,0.13)', border: '1px solid rgba(212,145,93,0.30)', color: 'rgba(212,145,93,0.95)' }}>
                  1
                </span>
                <div className="flex-1">
                  <div className="font-semibold text-app-text mb-1">{isAwaitingAcceptance ? 'Restaurant Review' : 'Email Confirmation'}</div>
                  {isAwaitingAcceptance ? (
                    <div className="text-sm text-app-text-secondary">
                      Your requested table is being kept unavailable while the restaurant responds. This is not a confirmed reservation yet.
                    </div>
                  ) : emailSent === true ? (
                    <div className="text-sm text-app-text-secondary">
                      Booking confirmed — confirmation sent to {customerEmail || 'your email'}.
                    </div>
                  ) : emailSent === false ? (
                    <div className="text-sm">
                      <div className="text-amber-600 dark:text-amber-400 font-medium mb-1">
                        Booking confirmed — confirmation email may be delayed.
                      </div>
                      <div className="text-xs text-app-text-tertiary">
                        Your reservation is secure. Save your code below to manage your booking.
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-app-text-secondary">
                      A confirmation email has been sent with all the details.
                    </div>
                  )}
                </div>
              </li>
              <li className="flex items-start gap-4">
                <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full" style={{ background: 'rgba(212,145,93,0.13)', border: '1px solid rgba(212,145,93,0.30)', color: 'rgba(212,145,93,0.95)' }}>
                  2
                </span>
                <div>
                  <div className="font-semibold text-app-text mb-1">{isAwaitingAcceptance ? 'Watch for an Update' : 'Manage Your Booking'}</div>
                  <div className="text-sm text-app-text-secondary">
                    {isAwaitingAcceptance
                      ? 'We will email or text you as soon as the restaurant accepts or declines your request.'
                      : 'Use your reservation code below to view or cancel if needed.'}
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full" style={{ background: 'rgba(212,145,93,0.13)', border: '1px solid rgba(212,145,93,0.30)', color: 'rgba(212,145,93,0.95)' }}>
                  3
                </span>
                <div>
                  <div className="font-semibold text-app-text mb-1">{isAwaitingAcceptance ? 'Confirmation Follows Acceptance' : 'Arrive On Time'}</div>
                  <div className="text-sm text-app-text-secondary">
                    {isAwaitingAcceptance
                      ? 'Once accepted, you will receive final confirmation and any required deposit payment link.'
                      : <>Please arrive on time. Your table is reserved for approximately{' '}{formatDuration(getReservationDuration(reservation?.reservation_duration_minutes))}.</>}
                  </div>
                </div>
              </li>
            </ul>
          </div>

          {/* Pre-order summary */}
          {hasPreorder && (
            <div className="rounded-xl p-6 mb-8 text-left border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Utensils className="w-4 h-4" style={{ color: 'rgba(185,155,80,0.75)' }} />
                <h2 className="font-bold text-app-text text-base">Your Pre-Order</h2>
              </div>
              <div className="space-y-2 mb-4">
                {reservation!.preorder_items!.map((item, index) => (
                  <div key={index} className="flex justify-between text-app-text py-2 border-b border-white/[0.06] last:border-0">
                    <span className="font-medium text-sm">
                      {item.quantity} × {item.name}
                    </span>
                    <span className="font-semibold text-sm">
                      £{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-3 flex justify-between font-bold text-app-text" style={{ background: 'rgba(212,145,93,0.10)', border: '1px solid rgba(212,145,93,0.22)' }}>
                <span>Total</span>
                <span style={{ color: 'rgba(212,145,93,0.95)' }}>£{reservation!.preorder_total!.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Email failure notice — booking is still confirmed */}
          {emailError && !emailSent && !isAwaitingAcceptance && (
            <div className="rounded-xl px-5 py-4 mb-6 border" style={{ background: 'rgba(212,145,93,0.10)', borderColor: 'rgba(212,145,93,0.30)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'rgba(212,145,93,0.92)' }}>
                Your booking is confirmed, but we couldn't send the confirmation email. Please save your reservation code below.
              </p>
            </div>
          )}

          {/* Reservation code */}
          <div className="rounded-xl p-6 mb-6 border" style={{ background: 'rgba(212,145,93,0.06)', borderColor: 'rgba(212,145,93,0.22)' }}>
            <h3 className="font-bold text-app-text mb-1 text-base">
              {isAwaitingAcceptance ? 'Your Request Code' : 'Your Reservation Code'}
            </h3>
            <p className="text-sm text-app-text-secondary mb-4">
              Save this code. You may need it to manage or discuss your booking.
            </p>
            {displayCode ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={displayCode}
                  readOnly
                  className="flex-1 px-4 py-3 rounded-xl text-base font-mono select-all font-semibold tracking-widest"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,145,93,0.28)', color: 'rgba(235,225,208,0.92)', outline: 'none', letterSpacing: '0.12em' }}
                />
                <Button variant="secondary" onClick={copyToClipboard} className="px-4">
                  {copied ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-app-text-secondary">
                Your code is in your confirmation email.
              </p>
            )}
          </div>

          {onOpenChat && (
            <button
              onClick={onOpenChat}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-medium border transition-colors mb-3"
              style={{ borderColor: 'rgba(212,145,93,0.30)', color: 'rgba(212,145,93,0.90)', background: 'rgba(212,145,93,0.06)' }}
            >
              <MessageSquare className="w-4 h-4" />
              Message the Restaurant
            </button>
          )}

          <Button size="lg" onClick={onNewBooking} className="w-full shadow-lg hover:shadow-xl transition-shadow">
            Make Another Reservation
          </Button>

          <p className="text-center text-xs mt-4 leading-relaxed" style={{ color: 'rgba(185,170,148,0.40)' }}>
            This booking is subject to Rezerved's{' '}
            <a
              href="/booking-terms"
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.55)' }}
            >
              Booking Terms
            </a>{' '}
            and the restaurant's{' '}
            <a
              href="/cancellation-policy"
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.55)' }}
            >
              cancellation, deposit and no-show policy
            </a>.
          </p>
        </div>
      </div>
    </Layout>
  );
}
