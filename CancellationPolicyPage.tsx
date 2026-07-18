import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { ArrowLeft, Clock, AlertTriangle } from 'lucide-react';
import { loadHoldContext } from './BookingPage';

interface CancellationPolicyPageProps {
  onStaffLogin: () => void;
  onManageReservation?: () => void;
  source?: 'booking-flow' | 'home' | 'footer' | 'manage-booking' | 'confirmation';
  preserveHold?: boolean;
  onBack?: () => void;
  preLaunchMode?: boolean;
}

function backLabel(source: CancellationPolicyPageProps['source']): string {
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

export function CancellationPolicyPage({
  onStaffLogin,
  onManageReservation,
  source,
  preserveHold,
  onBack,
  preLaunchMode,
}: CancellationPolicyPageProps) {
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
          <h1 className="text-2xl font-bold text-app-text mb-2">
            Cancellation, Deposit &amp; No-Show Policy
          </h1>
          <p className="text-sm text-app-text-secondary">
            Last updated: May 2026 &nbsp;&middot;&nbsp; Version: 1.0
          </p>
        </div>

        {/* Intro card */}
        <div className="premium-card rounded-2xl p-6 sm:p-8 mb-6">
          <p className="text-sm text-app-text-secondary leading-relaxed mb-4">
            This policy explains how cancellations, deposits, no-shows and late arrivals are handled for bookings made through the Rezerved platform. It should be read alongside the restaurant's own policy, which is displayed during the booking process.
          </p>
          <p className="text-sm text-app-text-secondary leading-relaxed">
            If you have a specific question about a booking, please contact the restaurant directly in the first instance. Contact details for the restaurant are shown in your confirmation email and on the booking management page.
          </p>
        </div>

        {/* Sections */}
        <div className="premium-card rounded-2xl p-6 sm:p-8 space-y-0">

          <Section id="s1" title="1. About this policy">
            <p>
              This Cancellation, Deposit &amp; No-Show Policy applies to restaurant bookings made through the Rezerved platform at rezerved.co.uk.
            </p>
            <p>
              It sets out the general framework that applies to all bookings through Rezerved. Each restaurant may also set its own specific cancellation, deposit, refund, no-show and late-arrival rules. Where a restaurant has configured a specific policy, that policy is displayed during the booking process and in your booking confirmation. The restaurant's specific policy takes precedence for venue-specific terms.
            </p>
            <p>
              This policy should be read alongside Rezerved's{' '}
              <a href="/booking-terms" className="text-app-accent hover:underline">Booking Terms</a>{' '}
              and{' '}
              <a href="/privacy-policy" className="text-app-accent hover:underline">Privacy Policy</a>.
            </p>
          </Section>

          <Section id="s2" title="2. Rezerved's role">
            <p>
              Rezerved is a restaurant booking platform. Rezerved provides the technology that enables customers to discover restaurants, check availability, and make reservations.
            </p>
            <p>
              Rezerved is not a party to the contract between you and the restaurant. When you make a booking through Rezerved, you are entering into an agreement with the restaurant directly. The restaurant is responsible for delivering the dining experience, honouring the reservation, and applying its own cancellation, deposit, refund and no-show policies.
            </p>
            <p>
              Rezerved's role is limited to facilitating the booking and, where applicable, processing deposit payments on behalf of the restaurant.
            </p>
          </Section>

          <Section id="s3" title="3. Restaurant-specific policies">
            <p>
              Each restaurant using Rezerved may set its own specific terms for:
            </p>
            <ul className="list-none space-y-1 pl-0">
              {[
                'Cancellation deadlines and notice periods',
                'Deposit requirements and refund conditions',
                'No-show charges or deposit forfeitures',
                'Late-arrival grace periods and table release times',
                'Maximum party size and special booking conditions',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>
              You are responsible for reviewing the restaurant's specific policy before confirming your booking. The restaurant's policy is displayed on the booking confirmation screen before you finalise your reservation. By confirming a booking, you agree to the restaurant's policy as displayed at the time of booking.
            </p>
          </Section>

          <Section id="s4" title="4. Cancelling a booking">
            <p>
              You can cancel your booking at any time using the manage-booking link in your confirmation email or by visiting the booking management page at rezerved.co.uk/manage-reservation.
            </p>
            <p>
              Whether a cancellation affects a deposit or results in a charge depends on the restaurant's specific policy and the timing of your cancellation:
            </p>
            <ul className="list-none space-y-1.5 pl-0">
              <li className="flex gap-2">
                <span className="text-app-accent flex-shrink-0">&#8212;</span>
                <span>
                  <strong className="text-app-text font-semibold">Before the cancellation deadline:</strong> If you cancel before the restaurant's stated cancellation deadline, any refundable deposit should be returned to you in accordance with the restaurant's displayed policy.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-app-accent flex-shrink-0">&#8212;</span>
                <span>
                  <strong className="text-app-text font-semibold">After the cancellation deadline:</strong> If you cancel after the restaurant's cancellation deadline, the restaurant may be entitled to retain all or part of your deposit, provided this was clearly stated before you confirmed the booking.
                </span>
              </li>
            </ul>
            <p>
              The applicable cancellation deadline and refund conditions are always shown before you confirm a booking that requires a deposit.
            </p>
          </Section>

          <Section id="s5" title="5. Changing a booking">
            <p>
              You may be able to change your booking — including the date, time, or party size — using the manage-booking link in your confirmation email, subject to availability.
            </p>
            <p>
              Whether a booking change is permitted and whether it affects deposit terms depends on the restaurant's specific policy. Changes that reduce the party size below the deposit threshold, or that move the booking to a date or time the restaurant cannot accommodate, may result in cancellation rather than modification.
            </p>
            <p>
              If you are unable to change your booking online, please contact the restaurant directly.
            </p>
          </Section>

          <Section id="s6" title="6. Deposits and prepayments">
            <p>
              Some bookings through Rezerved require a deposit or prepayment. A deposit may be required based on party size, time of booking, or restaurant preference.
            </p>
            <p>
              Where a deposit is required, the following information will be displayed before you confirm your booking:
            </p>
            <ul className="list-none space-y-1 pl-0">
              {[
                'The deposit amount',
                'Whether the deposit is fixed or per person',
                'How the deposit is applied at the restaurant (typically deducted from your bill)',
                'The refund conditions, including the cancellation deadline',
                'The payment provider handling the transaction',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>
              You must agree to the deposit and cancellation terms before your booking is confirmed. If you do not complete the deposit payment, your booking will not be confirmed and your table hold will be released.
            </p>
          </Section>

          <Section id="s7" title="7. Refunds">
            <p>
              Refund entitlement depends on the restaurant's specific policy and the timing of your cancellation relative to the stated deadline.
            </p>
            <p>
              Where a refund is due, it will typically be returned to the original payment method used at the time of booking. Reserves the right to apply any refund processing fees or restrictions imposed by the payment provider, which will be made clear at the time of booking.
            </p>
            <p>
              Refund processing times vary depending on the payment provider and your card issuer. See section 12 for more information.
            </p>
            <p>
              Refunds are not available for non-refundable deposits after the cancellation deadline has passed, or where a deposit was explicitly described as non-refundable before confirmation.
            </p>
          </Section>

          <Section id="s8" title="8. Late cancellations">
            <p>
              A late cancellation is one made after the restaurant's stated cancellation deadline.
            </p>
            <p>
              If you cancel late, the restaurant may retain all or part of any deposit paid, in accordance with the policy displayed before you confirmed your booking. Rezerved will not override a restaurant's late-cancellation policy where that policy was clearly disclosed before booking.
            </p>
            <p>
              If you believe exceptional circumstances apply (for example, a medical emergency or bereavement), please contact the restaurant directly to discuss your situation. Restaurants retain discretion to apply goodwill refunds in exceptional cases.
            </p>
          </Section>

          <Section id="s9" title="9. No-shows">
            <p>
              A no-show occurs when a customer does not arrive for their reservation and has not cancelled in advance.
            </p>
            <p>
              If you do not attend your booking and have not cancelled, the restaurant may treat the booking as a no-show. Where a deposit was taken, the restaurant may retain the full deposit amount in the case of a no-show if this was stated in the booking policy shown before confirmation.
            </p>
            <p>
              Repeated no-shows may affect your ability to make future bookings through Rezerved.
            </p>
          </Section>

          <Section id="s10" title="10. Late arrivals">
            <p>
              Restaurants reserve tables for a fixed duration. If you arrive late, the following may apply depending on the restaurant's specific policy:
            </p>
            <ul className="list-none space-y-1.5 pl-0">
              <li className="flex gap-2">
                <span className="text-app-accent flex-shrink-0">&#8212;</span>
                <span>The restaurant may hold the table for a grace period (typically 15 minutes) before releasing it.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-app-accent flex-shrink-0">&#8212;</span>
                <span>If your table is released, the restaurant may treat the booking as a no-show.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-app-accent flex-shrink-0">&#8212;</span>
                <span>If you are seated late, the available dining time may be reduced to accommodate subsequent bookings.</span>
              </li>
            </ul>
            <p>
              The restaurant's late-arrival policy, where configured, is displayed before you confirm your booking. If you know you will be late, we recommend contacting the restaurant directly as soon as possible.
            </p>
          </Section>

          <Section id="s11" title="11. Restaurant cancellations">
            <p>
              Occasionally a restaurant may need to cancel a booking, for example due to unexpected closure, a private event, or circumstances beyond their control.
            </p>
            <p>
              If a restaurant cancels a booking, any deposit or prepayment you have made should normally be refunded in full unless there is a lawful reason it cannot be. Rezerved will work with the restaurant and payment provider to facilitate any refund due.
            </p>
            <p>
              Rezerved accepts no liability for loss, inconvenience, or costs arising from a restaurant's cancellation of a booking, including travel, accommodation, or other expenses. Claims for consequential losses should be directed to the restaurant.
            </p>
          </Section>

          <Section id="s12" title="12. Payment provider processing times">
            <p>
              Where a deposit is paid and a refund is due, the time taken to receive a refund depends on the payment provider, your card issuer, and your bank.
            </p>
            <p>
              Typical refund processing times are:
            </p>
            <ul className="list-none space-y-1 pl-0">
              {[
                'Card refunds: 3–10 working days from the date the refund is issued, depending on your card issuer.',
                'Bank transfers: processing times vary by bank.',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>
              Rezerved has no control over how quickly payment providers or banks process refunds after the refund is initiated. If a refund has not appeared within 10 working days, please contact us at{' '}
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">info@rezerved.co.uk</a>.
            </p>
          </Section>

          <Section id="s13" title="13. Disputes and chargebacks">
            <p>
              If you dispute a charge or wish to raise a concern about a deposit, you should first contact the restaurant directly with the details of your booking and the nature of your dispute.
            </p>
            <p>
              If you are unable to resolve the matter with the restaurant, you may contact Rezerved at{' '}
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">info@rezerved.co.uk</a>{' '}
              and we will endeavour to assist, though Rezerved's ability to resolve disputes between customers and restaurants is limited.
            </p>
            <p>
              If you initiate a chargeback with your bank or card issuer, you should be aware that chargebacks are a last resort. Initiating a chargeback for a deposit that was legitimately taken under a clearly disclosed policy may not succeed and may have consequences for your booking record.
            </p>
            <p>
              Your statutory rights as a consumer are not affected by this policy.
            </p>
          </Section>

          <Section id="s14" title="14. Contacting the restaurant">
            <p>
              For all questions specific to your booking — including cancellation requests, changes, refunds, late-arrival queries, and no-show disputes — your first point of contact should be the restaurant.
            </p>
            <p>
              The restaurant's contact details are shown in your booking confirmation email and on the booking management page accessible via your manage-booking link.
            </p>
            <p>
              You can also send a message to the restaurant directly through the Rezerved platform using the messaging feature on your booking management page.
            </p>
          </Section>

          <Section id="s15" title="15. Contacting Rezerved">
            <p>
              If you have a technical issue with the Rezerved platform — for example, you are unable to access your booking management link, you did not receive a confirmation email, or you believe there has been a technical error with your booking — please contact Rezerved at:
            </p>
            <p>
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline font-medium">
                info@rezerved.co.uk
              </a>
            </p>
            <p>
              Please include your reservation code, booking date, and the restaurant name when contacting us to allow us to investigate efficiently.
            </p>
          </Section>

          <Section id="s16" title="16. Changes to this policy">
            <p>
              Rezerved may update this policy from time to time to reflect changes in platform features, legal requirements, or payment provider arrangements.
            </p>
            <p>
              The most recent version of this policy is always available at rezerved.co.uk/cancellation-policy. The "Last updated" date at the top of this page reflects when material changes were last made.
            </p>
            <p>
              Where a booking has already been confirmed, the version of this policy in force at the time of booking applies to that specific reservation.
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
