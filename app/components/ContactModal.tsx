'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Icon component props
interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

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

const LoaderIcon = ({ className, style }: IconProps) => (
  <svg className={`animate-spin ${className}`} style={style} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

export default function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const { data: session } = useSession();
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);

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

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccess(false);
      setReferenceId(null);
      // Autofill email if user is logged in
      setEmail(session?.user?.email || '');
      setSubject('');
      setMessage('');
    }
  }, [isOpen, session?.user?.email]);

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
  const inputBg = isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)';
  const inputBorder = isDark ? 'hsl(0 0% 25%)' : 'hsl(220 15% 85%)';
  const destructiveColor = isDark ? 'hsl(0 70% 60%)' : 'hsl(0 65% 50%)';
  const destructiveBg = isDark ? 'hsl(0 70% 60% / 0.15)' : 'hsl(0 65% 50% / 0.05)';
  const successColor = isDark ? 'hsl(142 70% 50%)' : 'hsl(142 70% 40%)';
  const successBg = isDark ? 'hsl(142 70% 50% / 0.15)' : 'hsl(142 70% 40% / 0.1)';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, subject, message }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send message');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setReferenceId(data.referenceId || null);
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
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
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-lg overflow-hidden max-h-[90vh] overflow-y-auto"
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
            Contact Us
          </h2>
          <p 
            className="text-sm mt-1"
            style={{ color: textMuted }}
          >
            Send us feedback, report issues, or ask questions
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {success ? (
            <div 
              className="p-6 rounded-lg border"
              style={{ 
                backgroundColor: cardBg,
                borderColor: isDark ? 'hsl(142 70% 30%)' : 'hsl(142 70% 40%)',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: isDark ? 'hsl(142 70% 50%)' : 'hsl(142 70% 40%)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold mb-2" style={{ color: textForeground }}>
                    Message sent successfully
                  </p>
                  {referenceId && (
                    <div className="mb-3">
                      <p className="text-xs mb-1.5" style={{ color: textMuted }}>
                        Reference ID:
                      </p>
                      <code 
                        className="block px-3 py-2 rounded border text-sm font-mono"
                        style={{ 
                          backgroundColor: inputBg,
                          borderColor: inputBorder,
                          color: textForeground,
                        }}
                      >
                        {referenceId}
                      </code>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed" style={{ color: textMuted }}>
                    We've received your message and will get back to you soon. Please save your reference ID for your records.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label 
                  htmlFor="contact-email" 
                  className="text-sm font-medium"
                  style={{ color: textForeground }}
                >
                  Your Email
                </label>
                <div className="relative">
                  <MailIcon 
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
                    style={{ color: textMuted }}
                  />
                  <input
                    id="contact-email"
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
                <label 
                  htmlFor="contact-subject" 
                  className="text-sm font-medium"
                  style={{ color: textForeground }}
                >
                  Subject
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your message"
                  required
                  maxLength={200}
                  className="w-full px-4 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2"
                  style={{ 
                    backgroundColor: inputBg,
                    borderColor: inputBorder,
                    color: textForeground,
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label 
                  htmlFor="contact-message" 
                  className="text-sm font-medium"
                  style={{ color: textForeground }}
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what's on your mind..."
                  required
                  rows={6}
                  maxLength={2000}
                  className="w-full px-4 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 resize-none"
                  style={{ 
                    backgroundColor: inputBg,
                    borderColor: inputBorder,
                    color: textForeground,
                  }}
                />
                <p className="text-xs" style={{ color: textMuted }}>
                  {message.length} / 2000 characters
                </p>
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
                  'Send Message'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
