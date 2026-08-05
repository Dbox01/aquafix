import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/lib/database.types';

/**
 * Slice 0 — auth session and profile.
 *
 * Replaces Mendix DS_Account_CurrentUser.
 *
 * NOTE: nothing in here is security. Role checks in React decide what to show;
 * RLS decides what can actually be read or written. Assume every check here is
 * bypassable, because it is. (CLAUDE.md, RLS rules)
 */

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load the profile whenever the signed-in user changes.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let cancelled = false;
    setLoading(true);

    supabase
      .from('profile')
      .select('id, email, full_name, role, active, created_at, updated_at')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;

        if (error) {
          // A signed-in user with no profile row means the signup trigger did
          // not fire. Every policy will silently deny — fail loudly instead of
          // leaving them in a broken half-logged-in state.
          console.error('Could not load profile for signed-in user', error);
          setProfile(null);
          setLoading(false);
          return;
        }

        // Suspended accounts are blocked at the door rather than by adding
        // `and active` to every policy in the system. (spec 00, open questions)
        if (!data.active) {
          void supabase.auth.signOut();
          setProfile(null);
          setLoading(false);
          return;
        }

        setProfile(data);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, role: profile?.role ?? null, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
