import React, { useState } from 'react';
import { RezervdLogo } from '../components/RezervdLogo';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

interface SignUpPageProps {
  onSuccess?: () => void;
  onLogin?: () => void;
  onBack?: () => void;
}

export function SignUpPage({ onSuccess, onLogin, onBack }: SignUpPageProps = {}) {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, name);

      const urlParams = new URLSearchParams(window.location.search);
      const returnTo = urlParams.get('returnTo');

      if (returnTo) {
        window.location.href = returnTo;
      } else if (onSuccess) {
        onSuccess();
      } else {
        window.history.pushState({}, '', '/customer/dashboard');
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="customer-shell">
      <header className="customer-header glass-header border-b border-app-border/60 dark:border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 sm:h-[72px]">
          <div className="flex items-center min-w-0">
            <RezervdLogo size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                if (onLogin) {
                  onLogin();
                } else {
                  window.history.pushState({}, '', '/login');
                  window.location.reload();
                }
              }}
              variant="secondary"
              size="sm"
            >
              Sign In
            </Button>
            <Button
              onClick={() => {
                if (onBack) {
                  onBack();
                } else {
                  window.history.pushState({}, '', '/');
                  window.location.reload();
                }
              }}
              variant="secondary"
              size="sm"
            >
              Bookings
            </Button>
          </div>
        </div>
      </header>

      <div className="customer-scroll">
        <main className="customer-main flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="premium-card rounded-2xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-app-text mb-2">Create Account</h1>
              <p className="text-app-text-secondary">Sign up to manage your reservations</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-app-text mb-2">
                  Full Name
                </label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-app-text mb-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-app-text mb-2">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-app-text mb-2">
                  Confirm Password
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full py-3"
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Sign Up'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-app-text-secondary">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    if (onLogin) {
                      onLogin();
                    } else {
                      window.history.pushState({}, '', '/login');
                      window.location.reload();
                    }
                  }}
                  className="text-app-accent hover:text-app-accent/80 font-medium"
                >
                  Sign in
                </button>
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-app-border text-center">
              <button
                onClick={() => {
                  if (onBack) {
                    onBack();
                  } else {
                    window.history.pushState({}, '', '/');
                    window.location.reload();
                  }
                }}
                className="text-sm text-app-text-secondary hover:text-app-text"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
        </main>
      </div>
    </div>
  );
}
