import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { ArrowLeft, Clock, AlertTriangle } from 'lucide-react';
import { loadHoldContext, clearHoldContext } from './BookingPage';

interface BookingTermsPageProps {
  onStaffLogin: () => void;
  onManageReservation?: () => void;
  source?: 'booking-flow' | 'home' | 'footer' | 'manage-booking' | 'confirmation';
  preserveHold?: boolean;
  onBack?: () => void;
  preLaunchMode?: boolean;
}

function backLabel(source: BookingTermsPageProps['source']): string {
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

export function BookingTermsPage({
  onStaffLogin,
  onManageReservation,
  source,
  preserveHold,
  onBack,
  preLaunchMode,
}: BookingTermsPageProps) {
  const [holdExpired, setHoldExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const holdCtx = preserveHold ? loadHoldContext() : null;

  // Countdown timer if we're holding a table
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

  const handleLeave = () => {
    // User is navigating away from the booking flow — release hold context
    if (preserveHold) clearHoldContext();
    window.location.href = '/';
  };

  const label = backLabel(source);

  const formatRemaining = (ms: number) => {
    const totalSecs = Math.ceil(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const hasActiveHold = preserveHold && holdCtx && !holdExpired && timeRemaining !== null && timeRemaining > 0;

  return (
    <Layout
      onStaffLogin={onStaffLogin}
      onManageReservation={onManageReservation}
      preLaunchMode={preLaunchMode}
    >
      <div className="max-w-2xl mx-auto">

        {/* Top back button */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <BackButton label={label} onClick={handleBack} />

          {/* Hold status banner — inline at top */}
          {preserveHold && holdCtx && (
            holdExpired ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(180,50,50,0.18)', border: '1px solid rgba(200,80,80,0.35)', color: 'rgba(220,140,140,0.90)' }}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Hold expired
              </div>
            ) : timeRemaining !== null ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(212,145,93,0.12)', border: '1px solid rgba(212,145,93,0.30)', color: 'rgba(212,145,93,0.90)' }}>
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                Table held &middot; {formatRemaining(timeRemaining)}
              </div>
            ) : null
          )}
        </div>

        {/* Hold status notice card */}
        {preserveHold && holdCtx && (
          holdExpired ? (
            <div className="rounded-xl px-4 py-4 mb-6 flex items-start gap-3"
              style={{ background: 'rgba(180,50,50,0.14)', border: '1px solid rgba(200,80,80,0.30)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgba(220,120,120,0.90)' }} />
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(235,200,200,0.85)' }}>
                Your table hold has expired. Please return to the booking page to choose your table again.
              </p>
            </div>
          ) : hasActiveHold ? (
            <div className="rounded-xl px-4 py-3.5 mb-6 flex items-center gap-3"
              style={{ background: 'rgba(212,145,93,0.10)', border: '1px solid rgba(212,145,93,0.25)' }}>
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.85)' }} />
              <p className="text-sm" style={{ color: 'rgba(212,145,93,0.85)' }}>
                Your table is still being held while you review these terms.
              </p>
            </div>
          ) : null
        )}

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(212,145,93,0.75)' }}>
            Legal
          </p>
          <h1 className="text-2xl font-bold text-app-text mb-2">Rezerved Customer Booking Terms</h1>
          <p className="text-sm text-app-text-secondary">
            Last updated: May 2026 &nbsp;&middot;&nbsp; Version: 1.0
          </p>
        </div>

        <div className="premium-card rounded-2xl p-6 sm:p-8 mb-6">
          <p className="text-sm text-app-text-secondary leading-relaxed mb-4">
            These Booking Terms apply when you use Rezerved to make, manage, change or cancel a restaurant booking.
          </p>
          <p className="text-sm text-app-text-secondary leading-relaxed">
            Please read these terms carefully before confirming a booking. By making a booking through Rezerved, you agree to these Booking Terms and to any booking, cancellation, deposit or venue-specific rules shown to you during the booking process.
          </p>
        </div>

        <div className="premium-card rounded-2xl p-6 sm:p-8 space-y-0">

          <Section id="s1" title="1. About Rezerved">
            <p>Rezerved is an online restaurant booking platform.</p>
            <p>Rezerved allows customers to discover restaurants, view availability, make reservations, select or request tables where available, and manage bookings online.</p>
            <p>In these terms:</p>
            <ul className="list-none space-y-1 pl-0">
              {[
                ['"Rezerved", "we", "us" and "our"', 'means the company operating Rezerved, trading as Rezerved.'],
                ['"Customer", "you" and "your"', 'means the person making or managing a booking.'],
                ['"Restaurant"', 'means the restaurant, venue or hospitality business accepting bookings through Rezerved.'],
                ['"Booking"', 'means a restaurant reservation made through Rezerved.'],
                ['"Venue Policy"', "means the restaurant's own rules, including cancellation rules, deposit rules, late-arrival rules, table policies and any other booking conditions shown during the booking process."],
              ].map(([term, def]) => (
                <li key={term} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span><strong className="text-app-text font-semibold">{term}</strong> {def}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="s2" title="2. Rezerved's role">
            <p>Rezerved provides the technology that allows customers and restaurants to make and manage bookings.</p>
            <p>The restaurant is responsible for providing the dining experience, honouring accepted bookings, managing its availability, setting its own venue policies and delivering the services offered at the restaurant.</p>
            <p>Rezerved is not the restaurant and does not operate, own or control the restaurants listed on the platform.</p>
          </Section>

          <Section id="s3" title="3. Making a booking">
            <p>When you make a booking, you must provide accurate information, including your name, contact details, party size, booking date and booking time.</p>
            <p>You are responsible for checking that the booking details are correct before confirming the booking.</p>
            <p>A booking is only confirmed once you receive confirmation through Rezerved, usually by on-screen confirmation and/or email.</p>
            <p>We may send booking confirmations, reminders, manage-booking links, cancellation notices and other service messages relating to your booking.</p>
          </Section>

          <Section id="s4" title="4. Restaurant availability">
            <p>Restaurant availability is based on information provided by the restaurant and/or managed through the restaurant's Rezerved dashboard.</p>
            <p>Although Rezerved aims to display accurate availability, restaurants are responsible for keeping their availability, opening hours, table layout, booking rules and venue policies up to date.</p>
            <p>In rare cases, a restaurant may need to change, refuse or cancel a booking because of operational issues, incorrect availability, emergencies, private events, overbooking, closure or other reasons outside Rezerved's control.</p>
          </Section>

          <Section id="s5" title="5. Table selection and table requests">
            <p>Some restaurants may allow you to select, request or be recommended a specific table or seating area.</p>
            <p>Where table selection is available, Rezerved will pass your selection or request to the restaurant.</p>
            <p>Unless clearly stated otherwise during the booking process, specific table selection is not guaranteed. Restaurants may need to change table allocations due to party size, accessibility needs, operational requirements, table availability, staff decisions, safety reasons or other booking requirements.</p>
            <p>If a specific table is important to you, you should contact the restaurant directly before attending.</p>
          </Section>

          <Section id="s6" title="6. Special requests">
            <p>You may be able to add special requests to your booking, such as accessibility needs, celebration notes, high-chair requests or seating preferences.</p>
            <p>Rezerved will pass these requests to the restaurant where the feature is available, but we cannot guarantee that the restaurant will be able to fulfil them.</p>
            <p>For allergies, dietary requirements or accessibility requirements, you should contact the restaurant directly before your visit to confirm that your needs can be accommodated.</p>
          </Section>

          <Section id="s7" title="7. Deposits, prepayments and card details">
            <p>Some bookings may require a deposit, prepayment or card details to secure the reservation.</p>
            <p>If a deposit, prepayment or card requirement applies, the amount and relevant terms will be shown before you confirm the booking.</p>
            <p>By confirming a booking that requires a deposit or prepayment, you agree to the deposit, refund and cancellation terms shown during the booking process.</p>
            <p>Payment processing may be provided by a third-party payment provider. Rezerved does not store full card details unless expressly stated and supported by the relevant payment provider.</p>
            <p>Refunds, where applicable, may take time to appear depending on the payment provider, bank or card issuer.</p>
          </Section>

          <Section id="s8" title="8. Cancellations and changes by you">
            <p>You may be able to change or cancel your booking through Rezerved using the manage-booking link, reservation code or account features provided.</p>
            <p>Your ability to change or cancel a booking may depend on:</p>
            <ul className="list-none space-y-1 pl-0">
              {[
                "the restaurant's cancellation policy;",
                "the time remaining before the booking;",
                "whether a deposit or prepayment was required;",
                "the party size;",
                "the restaurant's availability; and",
                "any venue-specific rules shown during booking.",
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>If you cannot change or cancel your booking through Rezerved, you should contact the restaurant directly.</p>
            <p>Cancelling or changing a booking may affect whether any deposit is refundable.</p>
          </Section>

          <Section id="s9" title="9. Late arrivals and no-shows">
            <p>Restaurants may set their own late-arrival and no-show policies.</p>
            <p>If you arrive late, the restaurant may release your table, reduce your booking duration, move your party to another table or treat the booking as a no-show.</p>
            <p>If you do not attend your booking and do not cancel in accordance with the restaurant's policy, you may lose any deposit or prepayment connected with that booking.</p>
            <p>The restaurant's no-show or late-cancellation rules should be reviewed before you confirm the booking.</p>
          </Section>

          <Section id="s10" title="10. Cancellations or changes by the restaurant">
            <p>A restaurant may need to cancel or change a booking in certain circumstances, including but not limited to closure, staff shortages, emergency issues, incorrect availability, private events, operational requirements or safety concerns.</p>
            <p>Where Rezerved is notified of a restaurant cancellation or change, we will try to pass that information to you using the contact details provided with the booking.</p>
            <p>Rezerved is not responsible for losses caused by a restaurant cancelling, changing or failing to honour a booking, except where the issue is caused directly by Rezerved's own failure to provide the platform with reasonable care and skill.</p>
          </Section>

          <Section id="s11" title="11. Your responsibilities">
            <p>When using Rezerved, you agree that you will:</p>
            <ul className="list-none space-y-1 pl-0">
              {[
                'provide accurate booking and contact information;',
                'only make genuine bookings;',
                'not make duplicate, fake, abusive or fraudulent bookings;',
                'attend bookings on time or cancel them when you can no longer attend;',
                "comply with the restaurant's venue policies;",
                'treat restaurant staff and Rezerved support staff respectfully;',
                'not misuse manage-booking links, reservation codes or account features;',
                "not attempt to interfere with Rezerved's systems, security or availability.",
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>We may cancel bookings, restrict access or suspend use of Rezerved if we reasonably believe the platform is being misused.</p>
          </Section>

          <Section id="s12" title="12. Restaurant rules and conduct">
            <p>Restaurants may have their own rules, including dress codes, age restrictions, accessibility policies, allergy procedures, deposit rules, group booking rules and conduct expectations.</p>
            <p>You are responsible for reviewing and following any venue-specific rules shown before booking or communicated by the restaurant.</p>
            <p>The restaurant may refuse entry, cancel a booking or end a visit where it reasonably considers this necessary for safety, legal, operational or conduct reasons.</p>
          </Section>

          <Section id="s13" title="13. Pricing, menus and restaurant information">
            <p>Rezerved may display restaurant information, including descriptions, images, menus, opening hours, facilities, availability and booking rules.</p>
            <p>Restaurants are responsible for the accuracy of the information they provide or manage through Rezerved.</p>
            <p>Menus, prices, offers, availability and venue information may change. You should contact the restaurant directly if specific menu items, prices, allergens, accessibility arrangements or facilities are important to your booking.</p>
          </Section>

          <Section id="s14" title="14. Problems with a booking">
            <p>If there is a problem with your booking, you should first contact the restaurant directly, especially where the issue relates to the dining experience, service, food, table allocation, venue rules or restaurant operations.</p>
            <p>
              You may also contact Rezerved at:{' '}
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">
                info@rezerved.co.uk
              </a>
            </p>
            <p>Rezerved may help pass information between you and the restaurant, investigate platform issues or provide technical support, but Rezerved is not responsible for resolving disputes about the restaurant's food, service, staff, premises or dining experience.</p>
          </Section>

          <Section id="s15" title="15. Booking communications">
            <p>By making a booking, you agree that Rezerved may send you service communications relating to that booking.</p>
            <p>These may include:</p>
            <ul className="list-none space-y-1 pl-0">
              {[
                'booking confirmations;',
                'reminders;',
                'cancellation messages;',
                'manage-booking links;',
                'booking update messages;',
                'deposit or payment-related messages;',
                'restaurant notifications relating to your booking.',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>These service communications are not marketing emails.</p>
            <p>We will only send marketing communications where we are permitted to do so and where you have any required consent or opt-out rights.</p>
          </Section>

          <Section id="s16" title="16. Personal data">
            <p>Rezerved uses personal data to provide and manage bookings, operate the platform, send booking communications, support customers and restaurants, improve the service and comply with legal obligations.</p>
            <p>For more information about how we use personal data, please read our <a href="/privacy-policy" className="text-app-accent hover:underline">Privacy Policy</a>.</p>
          </Section>

          <Section id="s17" title="17. Platform availability">
            <p>Rezerved aims to provide a reliable booking platform, but we do not guarantee that the platform will always be available, uninterrupted or error-free.</p>
            <p>Access may be affected by maintenance, updates, internet issues, third-party services, hosting providers, payment providers, email providers, technical faults or events outside our control.</p>
            <p>Where possible, we may make changes to improve reliability, security, performance or functionality.</p>
          </Section>

          <Section id="s18" title="18. Our responsibility to you">
            <p>Rezerved will provide the platform with reasonable care and skill.</p>
            <p>Nothing in these terms excludes or limits liability where it would be unlawful to do so, including liability for death or personal injury caused by negligence, fraud, fraudulent misrepresentation or your statutory consumer rights.</p>
            <p>Rezerved is not responsible for:</p>
            <ul className="list-none space-y-1 pl-0">
              {[
                "the quality of the restaurant's food, drink, service or premises;",
                "the restaurant's decision to accept, reject, change or cancel a booking;",
                "inaccurate information supplied or managed by a restaurant;",
                "losses caused by you providing incorrect booking or contact details;",
                "losses caused by events outside our reasonable control;",
                "indirect or unforeseeable losses.",
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="s19" title="19. Changes to these Booking Terms">
            <p>We may update these Booking Terms from time to time.</p>
            <p>The version that applies to your booking will usually be the version in force when you made the booking, unless a change is required by law, security, platform operation or another important reason.</p>
            <p>The latest version will be available on the Rezerved website.</p>
          </Section>

          <Section id="s20" title="20. Contact">
            <p>
              If you have questions about these Booking Terms, you can contact Rezerved at:{' '}
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">
                info@rezerved.co.uk
              </a>
            </p>
            <p>For questions about a specific restaurant, menu, allergy, accessibility requirement, table allocation, cancellation decision or dining experience, you should contact the restaurant directly.</p>
          </Section>

          <Section id="s21" title="21. Governing law">
            <p>These Booking Terms are governed by the laws of England and Wales.</p>
            <p>If you are a consumer living elsewhere in the United Kingdom, you may also have rights under the laws that apply where you live.</p>
          </Section>

        </div>

        {/* Bottom back button + hold status repeat */}
        <div className="mt-8 space-y-4 pb-4">

          {preserveHold && holdCtx && (
            holdExpired ? (
              <div className="rounded-xl px-4 py-4 flex items-start gap-3"
                style={{ background: 'rgba(180,50,50,0.14)', border: '1px solid rgba(200,80,80,0.30)' }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgba(220,120,120,0.90)' }} />
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(235,200,200,0.85)' }}>
                  Your table hold has expired. Please return to the booking page to choose your table again.
                </p>
              </div>
            ) : hasActiveHold ? (
              <div className="rounded-xl px-4 py-3.5 flex items-center gap-3"
                style={{ background: 'rgba(212,145,93,0.10)', border: '1px solid rgba(212,145,93,0.25)' }}>
                <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.85)' }} />
                <p className="text-sm" style={{ color: 'rgba(212,145,93,0.85)' }}>
                  Your table is still being held while you review these terms.{' '}
                  {timeRemaining !== null && <span className="font-semibold">{formatRemaining(timeRemaining)} remaining.</span>}
                </p>
              </div>
            ) : null
          )}

          <BackButton label={label} onClick={handleBack} />

          {source !== 'booking-flow' && (
            <p className="text-xs text-app-text-tertiary">
              Not what you were looking for?{' '}
              <button
                onClick={handleLeave}
                className="underline hover:opacity-80 transition-opacity"
              >
                Go to home page
              </button>
            </p>
          )}
        </div>

      </div>
    </Layout>
  );
}
