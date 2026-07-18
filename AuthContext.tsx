import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../lib/types';
import { getCurrentUser, login as authLogin, logout as authLogout, signUp as authSignUp } from '../services/auth';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isCustomer: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let initialLoadDone = false;

    const loadUser = async () => {
      try {
        // Set realtime auth from the existing session before fetching the user
        // profile so that any channels created after this point are authenticated.
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
        }

        const currentUser = await getCurrentUser();
        if (mounted) {
          setUser(currentUser);
          setLoading(false);
          initialLoadDone = true;
        }
      } catch (error) {
        console.error('Error loading user:', error);
        if (mounted) {
          setUser(null);
          setLoading(false);
          initialLoadDone = true;
        }
      }
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // Keep the Realtime websocket authenticated with the current session token.
      // Without this the realtime connection uses the anon role even when the user
      // is signed in, so postgres_changes events filtered by RLS never arrive.
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      } else if (event === 'SIGNED_OUT') {
        supabase.realtime.setAuth(null);
      }

      if (event === 'TOKEN_REFRESHED') return;

      (async () => {
        if (event === 'SIGNED_IN' && session?.user) {
          try {
            const currentUser = await getCurrentUser();
            if (mounted) {
              setUser(currentUser);
              if (!initialLoadDone) {
                setLoading(false);
                initialLoadDone = true;
              }
            }
          } catch (error) {
            console.error('Error loading user after sign in:', error);
            if (mounted) {
              setUser(null);
              if (!initialLoadDone) {
                setLoading(false);
                initialLoadDone = true;
              }
            }
          }
        } else if (event === 'PASSWORD_RECOVERY') {
          if (!initialLoadDone && mounted) {
            setLoading(false);
            initialLoadDone = true;
          }
        } else if (event === 'SIGNED_OUT') {
          const legacyUser = sessionStorage.getItem('user');
          if (!legacyUser && mounted) {
            setUser(null);
          }
          if (!initialLoadDone && mounted) {
            setLoading(false);
            initialLoadDone = true;
          }
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const user = await authLogin(email, password);
    setUser(user);
    if (!user.auth_user_id) {
      sessionStorage.setItem('user', JSON.stringify(user));
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    const user = await authSignUp(email, password, name);
    setUser(user);
  };

  const logout = async () => {
    await authLogout();
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const isCustomer = user?.role === 'customer';

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isStaff, isCustomer, login, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
