'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      setIsDark(theme === 'dark');
    };
    
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    const tokenParam = searchParams.get('token');

    if (!emailParam || !tokenParam) {
      setError('Invalid or missing reset link');
      return;
    }

    setEmail(decodeURIComponent(emailParam));
    setToken(tokenParam);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password');
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const bgOverlay = isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)';
  const cardBg = isDark ? 'hsl(220 15% 12%)' : '#ffffff';
  const borderColor = isDark ? 'hsl(0 0% 20%)' : 'hsl(220 15% 88%)';
  const textForeground = isDark ? 'hsl(0 0% 98%)' : 'hsl(220 30% 12%)';
  const textMuted = isDark ? 'hsl(0 0% 60%)' : 'hsl(220 15% 45%)';
  const primaryColor = isDark ? 'hsl(192 85% 52%)' : 'hsl(192 85% 42%)';
  const inputBg = isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)';
  const inputBorder = isDark ? 'hsl(0 0% 25%)' : 'hsl(220 15% 85%)';
  const destructiveColor = isDark ? 'hsl(0 70% 60%)' : 'hsl(0 65% 50%)';
  const destructiveBg = isDark ? 'hsl(0 70% 60% / 0.15)' : 'hsl(0 65% 50% / 0.05)';

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgOverlay }}>
        <div 
          className="w-full max-w-md rounded-lg border shadow-lg p-8 text-center"
          style={{ backgroundColor: cardBg, borderColor: borderColor }}
        >
          <h2 className="text-2xl font-bold mb-4" style={{ color: textForeground }}>
            Password Reset Successful
          </h2>
          <p style={{ color: textMuted }}>
            Your password has been updated. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgOverlay }}>
      <div 
        className="w-full max-w-md rounded-lg border shadow-lg p-8"
        style={{ backgroundColor: cardBg, borderColor: borderColor }}
      >
        <h2 className="text-2xl font-bold mb-2" style={{ color: textForeground }}>
          Reset Password
        </h2>
        <p className="text-sm mb-6" style={{ color: textMuted }}>
          Enter your new password below
        </p>

        {error && (
          <div 
            className="text-sm p-3 rounded-lg mb-4"
            style={{ 
              color: destructiveColor,
              backgroundColor: destructiveBg,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label 
              htmlFor="password" 
              className="block text-sm font-medium mb-1"
              style={{ color: textForeground }}
            >
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              className="w-full px-4 py-2 rounded-lg border text-sm"
              style={{ 
                backgroundColor: inputBg,
                borderColor: inputBorder,
                color: textForeground,
              }}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label 
              htmlFor="confirmPassword" 
              className="block text-sm font-medium mb-1"
              style={{ color: textForeground }}
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
              minLength={8}
              className="w-full px-4 py-2 rounded-lg border text-sm"
              style={{ 
                backgroundColor: inputBg,
                borderColor: inputBorder,
                color: textForeground,
              }}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !token || !email}
            className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: primaryColor,
              color: '#ffffff',
            }}
          >
            {isLoading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border shadow-lg p-8 text-center">
          <p>Loading...</p>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
