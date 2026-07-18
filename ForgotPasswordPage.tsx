import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { requestPasswordReset } from '../services/auth';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

interface ForgotPasswordPageProps {
  onBack: () => void;
  onStaffLogin?: () => void;
}

export function ForgotPasswordPage({ onBack, onStaffLogin }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await requestPasswordReset(email);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Layout onStaffLogin={onStaffLogin}>
        <div className="max-w-md mx-auto">
          <div className="premium-card rounded-2xl p-8">
            <div className="flex items-center justify-center mb-6">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>

            <h1 className="text-3xl font-bold text-app-text text-center mb-2">
              Check Your Email
            </h1>
            <p className="text-center text-app-text-secondary mb-6">
              We've sent password reset instructions to <strong>{email}</strong>
            </p>

            <div className="space-y-4 text-sm text-app-text-secondary">
              <p>Please check your email and click the reset link to set a new password.</p>
              <p>If you don't see the email, check your spam folder.</p>
            </div>

            <div className="mt-8">
              <Button onClick={onBack} variant="secondary" className="w-full">
                Back to Sign In
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout onStaffLogin={onStaffLogin}>
      <div className="max-w-md mx-auto">
        <Button variant="secondary" onClick={onBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back to Sign In
        </Button>

        <div className="premium-card rounded-2xl p-8">
          <div className="flex items-center justify-center mb-6">
            <Mail className="w-12 h-12 text-app-accent" />
          </div>

          <h1 className="text-3xl font-bold text-app-text text-center mb-2">
            Reset Password
          </h1>
          <p className="text-center text-app-text-secondary mb-8">
            Enter your email address and we'll send you a link to reset your password
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
