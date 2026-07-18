import { supabase } from '../lib/supabase';
import { User } from '../lib/types';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchUserWithRetry(authUserId: string, maxRetries = 3): Promise<User | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!error && user) {
      return user;
    }

    if (attempt < maxRetries) {
      console.log(`User profile not ready, retrying (${attempt}/${maxRetries})...`);
      await sleep(attempt * 500);
    } else {
      console.error('Failed to fetch user profile after retries:', error);
      return null;
    }
  }
  return null;
}

export async function signUp(email: string, password: string, name: string): Promise<User> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        full_name: name,
      },
    },
  });

  if (authError) {
    console.error('Signup auth error:', authError);

    if (authError.message.includes('already registered')) {
      throw new Error('This email is already registered. Please sign in instead.');
    }
    if (authError.message.includes('password')) {
      throw new Error('Password is too weak. Please use a stronger password.');
    }
    if (authError.message.includes('email')) {
      throw new Error('Invalid email address. Please check and try again.');
    }

    throw new Error(authError.message);
  }

  if (!authData.user) {
    throw new Error('Failed to create account. Please try again.');
  }

  const user = await fetchUserWithRetry(authData.user.id);

  if (!user) {
    console.error('User profile not created for auth user:', authData.user.id);
    throw new Error('Account created but profile setup failed. Please contact support or try signing in.');
  }

  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-welcome-email`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        name,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Welcome email API error:', {
        status: response.status,
        statusText: response.statusText,
        error: result
      });
    } else {
      console.log('Welcome email sent successfully:', result);
    }
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }

  return user;
}

export async function login(email: string, password: string): Promise<User> {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    throw new Error('Invalid credentials');
  }

  if (!authData.user) {
    throw new Error('Invalid credentials');
  }

  let { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (userError) {
    throw new Error('User profile not found');
  }

  if (!user) {
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        auth_user_id: authData.user.id,
        email: authData.user.email!,
        name: authData.user.user_metadata?.name || authData.user.user_metadata?.full_name || authData.user.email!.split('@')[0],
        role: 'customer',
      })
      .select('*')
      .single();

    if (insertError || !newUser) {
      throw new Error('User profile not found');
    }

    user = newUser;
  }

  return user;
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
  sessionStorage.removeItem('user');
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return null;
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    if (!user) {
      console.warn('No user profile found for authenticated session');
      return null;
    }

    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const rateLimitKey = 'password_reset_attempts';
  const rateLimitWindow = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 3;

  try {
    const storedData = localStorage.getItem(rateLimitKey);
    if (storedData) {
      const { attempts, firstAttempt } = JSON.parse(storedData);
      const now = Date.now();

      if (now - firstAttempt < rateLimitWindow) {
        if (attempts >= maxAttempts) {
          const minutesRemaining = Math.ceil((rateLimitWindow - (now - firstAttempt)) / 60000);
          throw new Error(`Too many reset attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`);
        }
        localStorage.setItem(rateLimitKey, JSON.stringify({
          attempts: attempts + 1,
          firstAttempt
        }));
      } else {
        localStorage.setItem(rateLimitKey, JSON.stringify({
          attempts: 1,
          firstAttempt: now
        }));
      }
    } else {
      localStorage.setItem(rateLimitKey, JSON.stringify({
        attempts: 1,
        firstAttempt: Date.now()
      }));
    }
  } catch {
    // Continue if localStorage is unavailable
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) {
    console.error('Password reset request error:', error);
    throw new Error('Failed to send password reset email. Please try again.');
  }
}

export async function resetPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    console.error('Password reset error:', error);
    if (error.message.includes('password')) {
      throw new Error('Password is too weak. Please use a stronger password.');
    }
    throw new Error('Failed to reset password. Please try again.');
  }
}
