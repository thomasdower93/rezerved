import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { getReservationByToken, getReservationByCode } from '../services/reservations';
import { Ticket, ArrowLeft } from 'lucide-react';

interface ManageReservationLookupPageProps {
  onReservationFound: (token: string) => void;
  onBack: () => void;
  onStaffLogin: () => void;
  preLaunchMode?: boolean;
}

function normaliseCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s*-\s*/g, '-');
}

export function ManageReservationLookupPage({
  onReservationFound,
  onBack,
  onStaffLogin,
  preLaunchMode = false,
}: ManageReservationLookupPageProps) {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      setError('Please enter your reservation code');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const normalised = normaliseCode(code);

      if (/^FD-[A-Z0-9]{6}$/.test(normalised)) {
        const reservation = await getReservationByCode(normalised, email.trim());
        if (reservation) {
          onReservationFound(reservation.manage_token);
          return;
        }
        setError("We couldn't find a reservation matching that code and email address. Please check both and try again.");
        setLoading(false);
        return;
      }

      // Legacy path: treat input as a raw manage_token URL or token
      let token = normalised;
      try {
        const url = new URL(code.trim());
        const tokenParam = url.searchParams.get('token');
        if (tokenParam) token = tokenParam;
      } catch {
        // not a URL
      }

      const reservation = await getReservationByToken(token);
      if (!reservation) {
        setError("This reservation link has expired or is no longer valid. Please look up your reservation using your reservation code and email address.");
        setLoading(false);
        return;
      }

      onReservationFound(token);
    } catch (err) {
      setError('An error occurred while looking up your reservation. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout onStaffLogin={onStaffLogin} preLaunchMode={preLaunchMode}>
      <div className="max-w-md mx-auto">
        <Button variant="secondary" onClick={onBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          {preLaunchMode ? 'Back to Launch Page' : 'Back to Home'}
        </Button>

        <div className="premium-card rounded-2xl p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-app-accent/10 border border-app-accent/20 flex items-center justify-center">
              <Ticket className="w-8 h-8 text-app-accent" strokeWidth={1.75} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-app-text text-center mb-2">
            Manage Your Reservation
          </h1>
          <p className="text-center text-app-text-secondary mb-8 text-sm leading-relaxed">
            Enter your reservation code and email to view or cancel your booking.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Reservation Code"
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(null); }}
              placeholder="Enter your code"
              disabled={loading}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              required
            />

            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="The email you booked with"
              disabled={loading}
              required
            />

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || !code.trim() || !email.trim()}
            >
              {loading ? 'Looking up...' : 'Find Reservation'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-app-border text-center">
            <p className="text-sm text-app-text-secondary">
              You can find your reservation code in the confirmation email or on the confirmation page after booking.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
