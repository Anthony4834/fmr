'use client';

import { useState, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

// Icon component props
interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

// Icon components
const XIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const MailIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const LockIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const UserIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const LoaderIcon = ({ className, style }: IconProps) => (
  <svg className={`animate-spin ${className}`} style={style} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

// Google icon
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);


export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'verification' | 'forgot-password'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Check theme
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

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError('');
      setEmail('');
      setPassword('');
      setName('');
      setVerificationCode(['', '', '', '', '', '']);
      setResendCooldown(0);
    }
  }, [isOpen, initialMode]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Theme colors
  const bgOverlay = isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)';
  const cardBg = isDark ? 'hsl(220 15% 12%)' : '#ffffff';
  const borderColor = isDark ? 'hsl(0 0% 20%)' : 'hsl(220 15% 88%)';
  const textForeground = isDark ? 'hsl(0 0% 98%)' : 'hsl(220 30% 12%)';
  const textMuted = isDark ? 'hsl(0 0% 60%)' : 'hsl(220 15% 45%)';
  const primaryColor = isDark ? 'hsl(192 85% 52%)' : 'hsl(192 85% 42%)';
  const primaryHover = isDark ? 'hsl(192 85% 48%)' : 'hsl(192 85% 38%)';
  const inputBg = isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)';
  const inputBorder = isDark ? 'hsl(0 0% 25%)' : 'hsl(220 15% 85%)';
  const inputFocus = primaryColor;
  const destructiveColor = isDark ? 'hsl(0 70% 60%)' : 'hsl(0 65% 50%)';
  const destructiveBg = isDark ? 'hsl(0 70% 60% / 0.15)' : 'hsl(0 65% 50% / 0.05)';

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        // Sign up flow
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Failed to create account');
          setIsLoading(false);
          return;
        }

        // Show verification screen
        if (data.requiresVerification) {
          setMode('verification');
          setResendCooldown(60);
        } else {
          // Should not happen, but handle gracefully
          setError('Account created. Please verify your email.');
        }
      } else if (mode === 'forgot-password') {
        // Forgot password flow
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Failed to send reset link');
          setIsLoading(false);
          return;
        }

        // Show success message
        setError('');
        alert('If an account exists, you will receive a password reset link');
        setMode('login');
        setEmail('');
      } else {
        // Login flow
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Invalid credentials');
        } else {
          onClose();
          window.location.reload();
        }
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerification = async (codeOverride?: string) => {
    const code = codeOverride || verificationCode.join('');
    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid verification code');
        setIsLoading(false);
        return;
      }

      // Auto sign in after verification
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Email verified. Please log in.');
        setMode('login');
      } else {
        onClose();
        window.location.reload();
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to resend code');
      } else {
        setResendCooldown(60);
        setError('');
        alert('Verification code sent to your email');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newCode = [...verificationCode];
    newCode[index] = value.slice(-1); // Only take last character
    setVerificationCode(newCode);

    // Auto-advance to next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (newCode.every(digit => digit !== '') && newCode.join('').length === 6) {
      // Use the newCode directly to avoid race condition
      handleVerification(newCode.join(''));
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').slice(0, 6);
    if (/^\d{6}$/.test(pasted)) {
      const newCode = pasted.split('');
      setVerificationCode(newCode);
      // Auto-submit with the pasted code directly to avoid race condition
      handleVerification(pasted);
    }
  };

  const handleOAuthSignIn = async (provider: 'google') => {
    setError('');
    setIsLoading(true);
    
    try {
      await signIn(provider, { callbackUrl: window.location.href });
    } catch (err) {
      setError('Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50"
      style={{ backgroundColor: bgOverlay }}
      onClick={onClose}
    >
      <div 
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-lg overflow-hidden"
        style={{ 
          backgroundColor: cardBg,
          borderColor: borderColor,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="border-b p-6 relative"
          style={{ borderColor: borderColor }}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" style={{ color: textMuted }} />
          </button>
          
          <h2 
            className="text-xl font-display font-bold"
            style={{ color: textForeground }}
          >
            {mode === 'login' ? 'Welcome back' 
             : mode === 'signup' ? 'Create an account'
             : mode === 'verification' ? 'Verify your email'
             : 'Reset password'}
          </h2>
          <p 
            className="text-sm mt-1"
            style={{ color: textMuted }}
          >
            {mode === 'login' 
              ? 'Sign in to access your account' 
              : mode === 'signup'
              ? 'Get 200 daily requests with a free account'
              : mode === 'verification'
              ? 'Enter the 6-digit code sent to your email'
              : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {mode === 'verification' ? (
            /* Verification Code Input */
            <div className="space-y-4">
              <div className="flex gap-2 justify-center">
                {verificationCode.map((digit, index) => (
                  <input
                    key={index}
                    id={`code-${index}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onPaste={index === 0 ? handleCodePaste : undefined}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !digit && index > 0) {
                        const prevInput = document.getElementById(`code-${index - 1}`);
                        prevInput?.focus();
                      }
                    }}
                    className="w-12 h-14 text-center text-xl font-semibold rounded-lg border focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: inputBg,
                      borderColor: inputBorder,
                      color: textForeground,
                    }}
                    autoFocus={index === 0}
                  />
                ))}
              </div>

              {error && (
                <div 
                  className="text-sm p-3 rounded-lg"
                  style={{ 
                    color: destructiveColor,
                    backgroundColor: destructiveBg,
                  }}
                >
                  {error}
                </div>
              )}

              <div className="text-center space-y-2">
              <button
                type="button"
                onClick={() => handleVerification()}
                disabled={isLoading || verificationCode.join('').length !== 6}
                  className="w-full px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: primaryColor,
                    color: '#ffffff',
                  }}
                >
                  {isLoading ? (
                    <>
                      <LoaderIcon className="w-4 h-4" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Email'
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 text-sm">
                  <span style={{ color: textMuted }}>Didn't receive a code?</span>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCooldown > 0 || isLoading}
                    className="font-medium transition-colors hover:underline disabled:opacity-50"
                    style={{ color: primaryColor }}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setVerificationCode(['', '', '', '', '', '']);
                    setError('');
                  }}
                  className="text-sm font-medium transition-colors hover:underline"
                  style={{ color: textMuted }}
                >
                  Wrong email?
                </button>
              </div>
            </div>
          ) : mode === 'forgot-password' ? (
            /* Forgot Password Form */
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <label 
                  htmlFor="forgot-email" 
                  className="text-sm font-medium"
                  style={{ color: textForeground }}
                >
                  Email
                </label>
                <div className="relative">
                  <MailIcon 
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
                    style={{ color: textMuted }}
                  />
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2"
                    style={{ 
                      backgroundColor: inputBg,
                      borderColor: inputBorder,
                      color: textForeground,
                    }}
                    autoComplete="email"
                  />
                </div>
              </div>

              {error && (
                <div 
                  className="text-sm p-3 rounded-lg"
                  style={{ 
                    color: destructiveColor,
                    backgroundColor: destructiveBg,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  backgroundColor: primaryColor,
                  color: '#ffffff',
                }}
              >
                {isLoading ? (
                  <>
                    <LoaderIcon className="w-4 h-4" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setEmail('');
                    setError('');
                  }}
                  className="font-medium transition-colors hover:underline"
                  style={{ color: primaryColor }}
                >
                  Back to login
                </button>
              </div>
            </form>
          ) : (
            /* Login/Signup Form */
            <>
              {/* OAuth buttons */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleOAuthSignIn('google')}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border font-medium transition-all hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    borderColor: inputBorder,
                    color: textForeground,
                  }}
                >
                  <GoogleIcon className="w-5 h-5" />
                  Continue with Google
                </button>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" style={{ borderColor: borderColor }} />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span 
                    className="px-2"
                    style={{ backgroundColor: cardBg, color: textMuted }}
                  >
                    or continue with email
                  </span>
                </div>
              </div>

              {/* Email form */}
              <form onSubmit={handleEmailSignIn} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label 
                  htmlFor="name" 
                  className="text-sm font-medium"
                  style={{ color: textForeground }}
                >
                  Name
                </label>
                <div className="relative">
                  <UserIcon 
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
                    style={{ color: textMuted }}
                  />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2"
                    style={{ 
                      backgroundColor: inputBg,
                      borderColor: inputBorder,
                      color: textForeground,
                    }}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label 
                htmlFor="email" 
                className="text-sm font-medium"
                style={{ color: textForeground }}
              >
                Email
              </label>
              <div className="relative">
                <MailIcon 
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
                  style={{ color: textMuted }}
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2"
                  style={{ 
                    backgroundColor: inputBg,
                    borderColor: inputBorder,
                    color: textForeground,
                  }}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label 
                  htmlFor="password" 
                  className="text-sm font-medium"
                  style={{ color: textForeground }}
                >
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot-password');
                      setError('');
                    }}
                    className="text-xs font-medium transition-colors hover:underline"
                    style={{ color: primaryColor }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <LockIcon 
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
                  style={{ color: textMuted }}
                />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2"
                  style={{ 
                    backgroundColor: inputBg,
                    borderColor: inputBorder,
                    color: textForeground,
                  }}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>
            </div>

            {error && (
              <div 
                className="text-sm p-3 rounded-lg"
                style={{ 
                  color: destructiveColor,
                  backgroundColor: destructiveBg,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: primaryColor,
                color: '#ffffff',
                boxShadow: `0 4px 14px ${primaryColor}40`,
              }}
            >
              {isLoading ? (
                <>
                  <LoaderIcon className="w-4 h-4" />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                mode === 'login' ? 'Sign in' : 'Create account'
              )}
            </button>
              </form>

              {/* Toggle mode */}
              <div className="text-center text-sm">
                <span style={{ color: textMuted }}>
                  {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setError('');
                  }}
                  className="font-medium transition-colors hover:underline"
                  style={{ color: primaryColor }}
                >
                  {mode === 'login' ? 'Sign up' : 'Log in'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
