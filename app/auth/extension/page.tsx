'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession, SessionProvider } from 'next-auth/react';

// Icon component props
interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

// Icon components
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

function ExtensionAuthContent() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [hasCalledCallback, setHasCalledCallback] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const { data: session, status: sessionStatus } = useSession();

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

  const handleOAuthCallback = async () => {
    // Prevent multiple calls
    if (hasCalledCallback || status === 'loading' || status === 'success') {
      return;
    }

    try {
      setHasCalledCallback(true);
      setStatus('loading');
      
      // Fetch extension tokens
      const response = await fetch('/api/auth/extension-token', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get extension tokens');
      }

      const data = await response.json();

      // Send tokens back to extension via postMessage (content script bridge will forward)
      const message = {
        type: 'EXTENSION_AUTH_SUCCESS',
        tokens: data,
      };
      
      // Retry sending message multiple times to handle race condition with content script injection
      let attempts = 0;
      const maxAttempts = 10;
      const sendInterval = setInterval(() => {
        attempts++;
        window.postMessage(message, window.location.origin);
        if (window.opener) {
          window.opener.postMessage(message, window.location.origin);
        }
        if (attempts >= maxAttempts) {
          clearInterval(sendInterval);
        }
      }, 200);
      
      // Set success status after a brief delay
      setTimeout(() => {
        setStatus('success');
        clearInterval(sendInterval);
        setTimeout(() => {
          try {
            window.close();
          } catch (e) {
            // Ignore - extension will close it
          }
        }, 1500);
      }, 500);
    } catch (err) {
      console.error('OAuth callback error:', err);
      setHasCalledCallback(false);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStatus('error');
      
      const errorMessage = {
        type: 'EXTENSION_AUTH_ERROR',
        error: err instanceof Error ? err.message : 'Authentication failed',
      };
      window.postMessage(errorMessage, window.location.origin);
      if (window.opener) {
        window.opener.postMessage(errorMessage, window.location.origin);
      }
    }
  };

  useEffect(() => {
    // Check if this is an OAuth callback
    const params = new URLSearchParams(window.location.search);
    const callback = params.get('callback');
    
    // If we have a session and callback param, fetch tokens
    if (callback === 'oauth' && sessionStatus === 'authenticated' && session && !hasCalledCallback) {
      handleOAuthCallback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionStatus, hasCalledCallback]);

  // Theme colors (matching AuthModal)
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

  const handleEmailAuth = async (e: React.FormEvent) => {
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

        // Auto sign in after successful signup
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Account created. Please log in.');
          setMode('login');
          setIsLoading(false);
        } else {
          // Fetch extension tokens after signup
          await handleOAuthCallback();
        }
      } else {
        // Login flow
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Invalid credentials');
          setIsLoading(false);
        } else {
          // Fetch extension tokens after login
          await handleOAuthCallback();
        }
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google') => {
    setError('');
    setIsLoading(true);
    
    try {
      await signIn(provider, { callbackUrl: `${window.location.origin}/auth/extension?callback=oauth` });
    } catch (err) {
      setError('Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  if (status === 'success') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: isDark ? 'hsl(220 15% 8%)' : '#fafafa',
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          boxShadow: '0 4px 12px rgba(34, 197, 94, 0.25)',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17L4 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 600,
          marginBottom: '8px',
          color: textForeground,
          letterSpacing: '-0.02em',
        }}>Successfully signed in!</h1>
        <p style={{
          color: textMuted,
          fontSize: '14px',
        }}>This window will close automatically...</p>
      </div>
    );
  }

  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: isDark ? 'hsl(220 15% 6%)' : '#e5e5e5',
      }}
    >
      <div 
        style={{ 
          width: '100%',
          maxWidth: '420px',
          backgroundColor: cardBg,
          borderColor: borderColor,
          borderRadius: '0',
          border: `1px solid ${isDark ? 'hsl(0 0% 15%)' : 'hsl(220 15% 85%)'}`,
          boxShadow: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div 
          style={{ 
            borderBottom: `1px solid ${borderColor}`,
            padding: '24px',
            position: 'relative',
          }}
        >
          <h2 
            style={{ 
              fontSize: '20px',
              fontWeight: 700,
              fontFamily: 'var(--font-display), system-ui, sans-serif',
              color: textForeground,
              marginBottom: '4px',
            }}
          >
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h2>
          <p 
            style={{ 
              fontSize: '14px',
              marginTop: '4px',
              color: textMuted,
            }}
          >
            {mode === 'login' 
              ? 'Sign in to access your account' 
              : 'Get 200 daily requests with a free account'}
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* OAuth buttons */}
          <div style={{ marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => handleOAuthSignIn('google')}
              disabled={isLoading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '10px 16px',
                borderRadius: '0',
                border: `1px solid ${inputBorder}`,
                fontWeight: 500,
                transition: 'all 0.2s',
                backgroundColor: 'transparent',
                color: textForeground,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <GoogleIcon className="w-5 h-5" />
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', borderTop: `1px solid ${borderColor}` }} />
            </div>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              <span 
                style={{ 
                  fontSize: '12px',
                  padding: '0 8px',
                  backgroundColor: cardBg,
                  color: textMuted,
                }}
              >
                or continue with email
              </span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailAuth}>
            {mode === 'signup' && (
              <div style={{ marginBottom: '16px' }}>
                <label 
                  htmlFor="name" 
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '6px',
                    color: textForeground,
                  }}
                >
                  Name
                </label>
                <div style={{ position: 'relative' }}>
                  <UserIcon 
                    style={{ 
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '16px',
                      height: '16px',
                      color: textMuted,
                    }}
                  />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    style={{
                      width: '100%',
                      paddingLeft: '40px',
                      paddingRight: '16px',
                      paddingTop: '10px',
                      paddingBottom: '10px',
                      borderRadius: '8px',
                      border: `1px solid ${inputBorder}`,
                      fontSize: '14px',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      backgroundColor: inputBg,
                      color: textForeground,
                      outline: 'none',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = inputFocus;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}40`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = inputBorder;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label 
                htmlFor="email" 
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '6px',
                  color: textForeground,
                }}
              >
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <MailIcon 
                  style={{ 
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '16px',
                    height: '16px',
                    color: textMuted,
                  }}
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={{
                    width: '100%',
                    paddingLeft: '40px',
                    paddingRight: '16px',
                    paddingTop: '10px',
                    paddingBottom: '10px',
                    borderRadius: '0',
                    border: `1px solid ${inputBorder}`,
                    fontSize: '14px',
                    transition: 'border-color 0.2s',
                    backgroundColor: inputBg,
                    color: textForeground,
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = inputFocus;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = inputBorder;
                  }}
                  autoComplete="email"
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label 
                htmlFor="password" 
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '6px',
                  color: textForeground,
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <LockIcon 
                  style={{ 
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '16px',
                    height: '16px',
                    color: textMuted,
                  }}
                />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  style={{
                    width: '100%',
                    paddingLeft: '40px',
                    paddingRight: '16px',
                    paddingTop: '10px',
                    paddingBottom: '10px',
                    borderRadius: '0',
                    border: `1px solid ${inputBorder}`,
                    fontSize: '14px',
                    transition: 'border-color 0.2s',
                    backgroundColor: inputBg,
                    color: textForeground,
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = inputFocus;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = inputBorder;
                  }}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>
            </div>

            {error && (
              <div 
                style={{
                  fontSize: '14px',
                  padding: '12px',
                  borderRadius: '0',
                  marginBottom: '16px',
                  color: destructiveColor,
                  backgroundColor: destructiveBg,
                  border: `1px solid ${destructiveColor}40`,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: '0',
                fontWeight: 600,
                transition: 'all 0.2s',
                boxShadow: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                backgroundColor: primaryColor,
                color: '#ffffff',
                border: 'none',
                fontSize: '14px',
              }}
            >
              {isLoading ? (
                <>
                  <LoaderIcon style={{ width: '16px', height: '16px' }} />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                mode === 'login' ? 'Sign in' : 'Create account'
              )}
            </button>
          </form>

          {/* Toggle mode */}
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
            <span style={{ color: textMuted }}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
              }}
              style={{
                fontWeight: 500,
                transition: 'color 0.2s',
                color: primaryColor,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = primaryHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = primaryColor;
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExtensionAuthPage() {
  return (
    <SessionProvider>
      <ExtensionAuthContent />
    </SessionProvider>
  );
}
