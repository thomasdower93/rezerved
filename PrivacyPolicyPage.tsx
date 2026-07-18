import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { ArrowLeft, Clock, AlertTriangle } from 'lucide-react';
import { loadHoldContext } from './BookingPage';

interface PrivacyPolicyPageProps {
  onStaffLogin: () => void;
  onManageReservation?: () => void;
  source?: 'booking-flow' | 'home' | 'footer' | 'manage-booking' | 'confirmation';
  preserveHold?: boolean;
  onBack?: () => void;
  preLaunchMode?: boolean;
}

function backLabel(source: PrivacyPolicyPageProps['source']): string {
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

export function PrivacyPolicyPage({
  onStaffLogin,
  onManageReservation,
  source,
  preserveHold,
  onBack,
  preLaunchMode,
}: PrivacyPolicyPageProps) {
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

  const hasActiveHold = preserveHold && holdCtx && !holdExpired && timeRemaining !== null && timeRemaining > 0;

  return (
    <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} preLaunchMode={preLaunchMode}>
      <div className="max-w-2xl mx-auto">

        {/* Top navigation row */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <BackButton label={label} onClick={handleBack} />

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

        {/* Hold status notice */}
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
          <h1 className="text-2xl font-bold text-app-text mb-2">Privacy Policy</h1>
          <p className="text-sm text-app-text-secondary">
            Last updated: May 2026 &nbsp;&middot;&nbsp; Version: 1.0
          </p>
        </div>

        {/* Intro card */}
        <div className="premium-card rounded-2xl p-6 sm:p-8 mb-6">
          <p className="text-sm text-app-text-secondary leading-relaxed mb-4">
            Rezerved is committed to protecting your personal data and respecting your privacy. This Privacy Policy explains what personal data we collect, why we collect it, how we use it, and what rights you have.
          </p>
          <p className="text-sm text-app-text-secondary leading-relaxed">
            Please read this policy carefully. By using Rezerved or making a booking through the platform, you acknowledge that your personal data will be used in accordance with this Privacy Policy.
          </p>
        </div>

        {/* Sections */}
        <div className="premium-card rounded-2xl p-6 sm:p-8 space-y-0">

          <Section id="s1" title="1. About this Privacy Policy">
            <p>This Privacy Policy applies to personal data collected and processed by Rezerved when you use the Rezerved website, booking platform, or any related services.</p>
            <p>It covers data collected when you browse Rezerved, search for restaurants, make a restaurant booking, manage or cancel a booking, contact us, or use any features available through the platform.</p>
            <p>It does not cover the privacy practices of individual restaurants. Once booking data is shared with a restaurant, that restaurant's own privacy policy applies to how they use your information.</p>
          </Section>

          <Section id="s2" title="2. Who we are">
            <p>Rezerved is an online restaurant booking platform operating at rezerved.co.uk.</p>
            <p>For the purposes of data protection law, Rezerved acts as the data controller for personal data collected and processed through the platform.</p>
            <p>
              If you have questions about how we handle your data, you can contact us at:{' '}
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">info@rezerved.co.uk</a>
            </p>
          </Section>

          <Section id="s3" title="3. What personal data we collect">
            <p>We collect the following categories of personal data:</p>
            <ul className="list-none space-y-1.5 pl-0">
              {[
                ['Booking details', 'name, date, time, party size, table selection, special requests, notes.'],
                ['Contact details', 'email address, phone number.'],
                ['Account data', 'email address, password (hashed), account preferences, booking history.'],
                ['Communication data', 'messages sent between you and the restaurant via Rezerved, chat history.'],
                ['Payment data', 'deposit amount, payment status, payment reference. We do not store full card numbers.'],
                ['Technical data', 'IP address, browser type, device type, pages visited, session identifiers, referral source.'],
                ['Usage data', 'how you interact with the platform, search queries, time on page, feature usage.'],
              ].map(([term, def]) => (
                <li key={term} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span><strong className="text-app-text font-semibold">{term}:</strong> {def}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="s4" title="4. How we collect personal data">
            <p>We collect personal data in the following ways:</p>
            <ul className="list-none space-y-1.5 pl-0">
              {[
                'Directly from you, when you make or manage a booking, create an account, fill in a form, or contact us.',
                'Automatically, when you visit the Rezerved website or platform, through cookies and similar technologies.',
                'From third parties, such as payment providers (deposit payment status) and analytics services.',
                'From restaurants, where a restaurant provides or updates information connected to your booking.',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="s5" title="5. Why we use personal data">
            <p>We use your personal data for the following purposes:</p>
            <ul className="list-none space-y-1.5 pl-0">
              {[
                'To process and manage restaurant bookings.',
                'To send booking confirmations, reminders, and booking-related service messages.',
                'To allow you to manage, change, or cancel bookings.',
                'To facilitate communication between you and restaurants.',
                'To process deposits and manage payment-related communications.',
                'To operate and improve the Rezerved platform.',
                'To ensure platform security and prevent fraudulent or abusive bookings.',
                'To comply with our legal and regulatory obligations.',
                'To respond to enquiries and support requests.',
                'To send marketing communications where you have consented or we have a legitimate interest and a lawful basis.',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="s6" title="6. Lawful bases for processing">
            <p>Under UK data protection law, we rely on the following lawful bases for processing your personal data:</p>
            <ul className="list-none space-y-1.5 pl-0">
              {[
                ['Contract', 'Processing is necessary to fulfil a booking you have made or to take steps at your request before making a booking.'],
                ['Legitimate interests', 'We process data to operate the platform, ensure security, improve the service, and communicate with restaurants and customers, where this does not override your rights.'],
                ['Legal obligation', 'We process data to comply with applicable legal requirements.'],
                ['Consent', 'Where we ask for your consent (for example, for marketing communications), we rely on that consent as the lawful basis. You can withdraw consent at any time.'],
              ].map(([term, def]) => (
                <li key={term} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span><strong className="text-app-text font-semibold">{term}:</strong> {def}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="s7" title="7. Booking data shared with restaurants">
            <p>When you make a booking through Rezerved, we share the following booking details with the restaurant:</p>
            <ul className="list-none space-y-1 pl-0">
              {[
                'Your name',
                'Your phone number',
                'Your email address',
                'Booking date, time, and party size',
                'Table selection or preference',
                'Special requests or notes you provided',
                'Booking status and reference',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>Restaurants use this data to manage their reservations and provide the dining experience. Once shared, the restaurant's own privacy policy governs how they handle your data.</p>
            <p>We do not share your payment card details with restaurants.</p>
          </Section>

          <Section id="s8" title="8. Payment and deposit information">
            <p>Some bookings require a deposit or prepayment. Where this applies, payment is processed by a third-party payment provider (such as SumUp or Stripe).</p>
            <p>Rezerved does not store your full card number, CVV, or bank account details. We receive only a payment reference, status (paid/failed/refunded), and the amount processed.</p>
            <p>Payment providers process your card data under their own privacy policies and security standards. You should review their privacy policy before making a payment.</p>
            <p>Deposit amounts and payment status are stored in connection with your booking record and may be shared with the restaurant.</p>
          </Section>

          <Section id="s9" title="9. Emails and booking communications">
            <p>When you make a booking, we will send you service communications including booking confirmations, reminders, manage-booking links, and any messages relating to your reservation.</p>
            <p>These are service communications, not marketing emails. You cannot opt out of booking service communications while a reservation is active, as they are necessary to manage your booking.</p>
            <p>We may also pass messages from the restaurant to you via email where the restaurant uses Rezerved's messaging feature.</p>
            <p>Where you have consented to marketing communications from a restaurant through Rezerved, we may send those separately. See section 17 for more information.</p>
          </Section>

          <Section id="s10" title="10. Restaurant dashboard and staff account data">
            <p>Restaurant staff and account holders who use the Rezerved staff dashboard have their own account data processed by Rezerved, including name, email address, role, and login activity.</p>
            <p>This data is used to provide and secure access to the restaurant management features and to attribute actions within the dashboard for audit and operational purposes.</p>
            <p>Restaurant account data is processed under a separate agreement between Rezerved and the restaurant business.</p>
          </Section>

          <Section id="s11" title="11. Analytics, cookies and similar technologies">
            <p>Rezerved uses cookies and similar technologies to operate the platform, remember your session, and understand how the platform is used.</p>
            <p>We may use analytics tools to collect aggregated and anonymised data about how visitors use the platform, including pages visited, features used, and booking funnel behaviour.</p>
            <p>You can manage cookie preferences through your browser settings. Disabling certain cookies may affect the functionality of the platform.</p>
            <p>We do not use cookies to track your activity across unrelated third-party websites.</p>
          </Section>

          <Section id="s12" title="12. Who we share personal data with">
            <p>We may share your personal data with the following categories of recipients:</p>
            <ul className="list-none space-y-1.5 pl-0">
              {[
                ['Restaurants', 'Booking details shared to allow the restaurant to fulfil your reservation (see section 7).'],
                ['Payment providers', 'Payment processing for deposits and prepayments (see section 8).'],
                ['Email service providers', 'Used to send booking confirmation and service emails on our behalf.'],
                ['Hosting and infrastructure providers', 'Cloud infrastructure used to operate and store platform data securely.'],
                ['Analytics providers', 'Aggregated and anonymised usage data to help us improve the platform.'],
                ['Legal and regulatory authorities', 'Where required by law, court order, or regulatory obligation.'],
              ].map(([term, def]) => (
                <li key={term} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span><strong className="text-app-text font-semibold">{term}:</strong> {def}</span>
                </li>
              ))}
            </ul>
            <p>We do not sell your personal data to third parties.</p>
          </Section>

          <Section id="s13" title="13. International transfers">
            <p>Some of our service providers and infrastructure partners may be based outside the UK or European Economic Area (EEA).</p>
            <p>Where personal data is transferred outside the UK or EEA, we take steps to ensure that appropriate safeguards are in place, such as standard contractual clauses or an adequacy decision.</p>
            <p>If you would like more information about the safeguards in place for international transfers, please contact us at <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">info@rezerved.co.uk</a>.</p>
          </Section>

          <Section id="s14" title="14. How long we keep personal data">
            <p>We retain personal data for as long as necessary to fulfil the purposes for which it was collected, including legal, regulatory, and operational requirements.</p>
            <p>Booking data is typically retained for a period of up to 3 years after the booking date, to allow for disputes, customer support, and legal compliance.</p>
            <p>Account data is retained while your account is active and for a reasonable period after account closure.</p>
            <p>Anonymised or aggregated data that cannot identify you may be retained for longer periods for analytical and platform improvement purposes.</p>
            <p>If you request deletion of your data, we will delete or anonymise your personal data unless we are required to retain it for legal or regulatory reasons.</p>
          </Section>

          <Section id="s15" title="15. How we protect personal data">
            <p>We take the security of your personal data seriously and implement appropriate technical and organisational measures to protect it against unauthorised access, loss, disclosure, or misuse.</p>
            <p>These measures include:</p>
            <ul className="list-none space-y-1 pl-0">
              {[
                'Encryption of data in transit using HTTPS/TLS.',
                'Encrypted storage of sensitive fields including passwords.',
                'Row-level security controls on database access.',
                'Access controls and authentication requirements for staff accounts.',
                'Regular review of security practices and infrastructure.',
              ].map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>No method of electronic transmission or storage is completely secure. While we take reasonable precautions, we cannot guarantee absolute security.</p>
          </Section>

          <Section id="s16" title="16. Your data protection rights">
            <p>Under UK data protection law, you have the following rights regarding your personal data:</p>
            <ul className="list-none space-y-1.5 pl-0">
              {[
                ['Right of access', 'You have the right to request a copy of the personal data we hold about you.'],
                ['Right to rectification', 'You have the right to request correction of inaccurate or incomplete personal data.'],
                ['Right to erasure', 'You have the right to request deletion of your personal data in certain circumstances.'],
                ['Right to restrict processing', 'You have the right to request that we limit how we use your data in certain circumstances.'],
                ['Right to data portability', 'You have the right to receive your data in a structured, machine-readable format in certain circumstances.'],
                ['Right to object', 'You have the right to object to processing based on legitimate interests, including for direct marketing.'],
                ['Rights related to automated decision-making', 'You have the right not to be subject to solely automated decisions that significantly affect you.'],
              ].map(([term, def]) => (
                <li key={term} className="flex gap-2">
                  <span className="text-app-accent flex-shrink-0">&#8212;</span>
                  <span><strong className="text-app-text font-semibold">{term}:</strong> {def}</span>
                </li>
              ))}
            </ul>
            <p>
              To exercise any of these rights, please contact us at{' '}
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">info@rezerved.co.uk</a>.
              We will respond to requests within one month.
            </p>
          </Section>

          <Section id="s17" title="17. Marketing communications">
            <p>We will only send you marketing communications where we have a lawful basis to do so — either your consent or, in limited circumstances, a legitimate interest.</p>
            <p>Where you have opted in to receive offers or updates from a restaurant through Rezerved, we may pass your email address to that restaurant for those purposes, or send communications on their behalf.</p>
            <p>You can opt out of marketing communications at any time by using the unsubscribe link in any marketing email, or by contacting us at <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">info@rezerved.co.uk</a>.</p>
            <p>Opting out of marketing will not affect booking service communications relating to active reservations.</p>
          </Section>

          <Section id="s18" title="18. Children">
            <p>Rezerved is not intended for use by children under the age of 16. We do not knowingly collect personal data from children under 16.</p>
            <p>If you believe we have inadvertently collected data from a child under 16, please contact us and we will take steps to delete it.</p>
          </Section>

          <Section id="s19" title="19. Changes to this Privacy Policy">
            <p>We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors.</p>
            <p>When we make material changes, we will update the "Last updated" date at the top of this page. Where required, we will notify you of significant changes.</p>
            <p>The latest version of this Privacy Policy is always available at rezerved.co.uk/privacy-policy.</p>
          </Section>

          <Section id="s20" title="20. Contact details">
            <p>
              If you have questions, concerns, or requests relating to this Privacy Policy or how we handle your personal data, please contact us at:
            </p>
            <p>
              <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline font-medium">
                info@rezerved.co.uk
              </a>
            </p>
            <p>We aim to respond to all enquiries within 5 working days.</p>
          </Section>

          <Section id="s21" title="21. Complaints">
            <p>If you are not satisfied with how we have handled your personal data, you have the right to make a complaint to the UK Information Commissioner's Office (ICO).</p>
            <p>
              The ICO can be contacted at:{' '}
              <a
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-app-accent hover:underline"
              >
                ico.org.uk
              </a>{' '}
              or by calling 0303 123 1113.
            </p>
            <p>We would appreciate the opportunity to address your concerns directly before you contact the ICO, so please reach out to us first at <a href="mailto:info@rezerved.co.uk" className="text-app-accent hover:underline">info@rezerved.co.uk</a>.</p>
          </Section>

        </div>

        {/* Bottom return navigation */}
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
                  Your table is still being held while you review this policy.{' '}
                  {timeRemaining !== null && <span className="font-semibold">{formatRemaining(timeRemaining)} remaining.</span>}
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
