import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../AuthProvider';
import { useCurrentUser } from '../useCurrentUser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Replaces Mendix Main.Login and Main.Login_PWA.
 *
 * One responsive page, not two (ADR-007). Field workers log in on site, so
 * keep it usable one-handed.
 */

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { signIn } = useAuth();
  const { loading, isAuthenticated } = useCurrentUser();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  if (loading) return <Spinner />;

  if (isAuthenticated) {
    // Send them back where RequireAuth intercepted them.
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
    } catch (err) {
      // Deliberately vague: distinguishing "no such user" from "wrong password"
      // tells an attacker which emails are registered.
      setFormError(err instanceof Error ? 'Email or password is incorrect.' : 'Could not sign in.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-brand-800">AquaFix</h1>
          <p className="mt-1 text-sm text-slate-500">Asset inspection and incident management</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            {...register('email')}
            error={errors.email?.message}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            error={errors.password?.message}
          />

          {formError && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  );
}
