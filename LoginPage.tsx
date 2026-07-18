import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../contexts/AuthContext';
import { Lock, ArrowLeft } from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
  onBack: () => void;
  onStaffLogin?: () => void;
  onForgotPassword?: () => void;
  onSignUp?: () => void;
}

export function LoginPage({ onSuccess, onBack, onStaffLogin, onForgotPassword, onSignUp }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user, login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (user) {
      onSuccess();
    }
  }, [user, onSuccess]);

  if (user) {
    return null;
  }

  return (
    <Layout onStaffLogin={onStaffLogin}>
      <div className="max-w-md mx-auto">
        <Button variant="secondary" onClick={onBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back to Home
        </Button>

        <div className="premium-card rounded-2xl p-8">
          <div className="flex items-center justify-center mb-6">
            <Lock className="w-12 h-12 text-app-accent" />
          </div>

          <h1 className="text-3xl font-bold text-app-text text-center mb-2">
            Sign In
          </h1>
          <p className="text-center text-app-text-secondary mb-8">
            Access your account
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

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />

            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  if (onForgotPassword) {
                    onForgotPassword();
                  } else {
                    window.history.pushState({}, '', '/forgot-password');
                    window.location.reload();
                  }
                }}
                className="text-sm text-app-accent hover:text-app-accent/80 font-medium"
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-app-text-secondary">
              Don't have an account?{' '}
              <button
                onClick={() => {
                  if (onSignUp) {
                    onSignUp();
                  } else {
                    window.history.pushState({}, '', '/signup');
                    window.location.reload();
                  }
                }}
                className="text-app-accent hover:text-app-accent/80 font-medium"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
