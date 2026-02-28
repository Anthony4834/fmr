'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ContactFormContentProps {
  variant: 'modal' | 'page';
  initialEmail?: string;
}

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

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

const idPrefix = (variant: 'modal' | 'page') => (variant === 'page' ? 'contact-page-' : 'contact-');

export default function ContactFormContent({ variant, initialEmail = '' }: ContactFormContentProps) {
  const prefix = idPrefix(variant);
  const [email, setEmail] = useState(initialEmail);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

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

  const handleBackToForm = () => {
    setSuccess(false);
    setReferenceId(null);
    setError('');
  };

  const inputBase =
    'w-full border text-sm transition-colors focus:outline-none focus:border-[var(--primary-blue)] disabled:opacity-50';
  const inputStyle = {
    backgroundColor: 'var(--modal-input-bg)',
    borderColor: 'var(--modal-input-border)',
    color: 'var(--modal-text)',
  } as const;
  const labelStyle = { color: 'var(--modal-text)' };
  const mutedStyle = { color: 'var(--modal-text-muted)' };

  if (success) {
    return (
      <div>
        {/* Success panel: left accent bar, no heavy border */}
        <div
          className="relative rounded-none p-6 pl-[calc(1.5rem+4px)]"
          style={{
            backgroundColor: 'var(--modal-input-bg)',
          }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ backgroundColor: 'var(--primary-blue)' }}
          />

          <div className="flex gap-3 items-start">
            <div
              className="flex-shrink-0 w-6 h-6 mt-0.5 flex items-center justify-center"
              style={{ backgroundColor: 'var(--primary-blue)', color: '#fff' }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold pt-px" style={labelStyle}>
              Thanks for contacting us
            </p>
          </div>

          {referenceId && (
            <div className="mt-3">
              <p className="text-xs font-medium mb-2" style={mutedStyle}>
                Reference ID
              </p>
              <code
                className="inline-block px-3 py-2 rounded-none text-sm font-mono border"
                style={{
                  backgroundColor: 'var(--modal-bg)',
                  borderColor: 'var(--modal-input-border)',
                  color: 'var(--modal-text)',
                }}
              >
                {referenceId}
              </code>
            </div>
          )}

          <p
            className="mt-4 max-w-[22rem] text-sm leading-relaxed"
            style={{ ...mutedStyle, lineHeight: 1.5 }}
          >
            We've received your message and will get back to you soon. Save your reference ID for your records.
          </p>
        </div>

        {variant === 'page' && (
          <div className="flex flex-row justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={handleBackToForm}
              className="h-11 px-4 text-sm font-medium border transition-colors hover:opacity-90 rounded-none"
              style={{
                backgroundColor: 'transparent',
                borderColor: 'var(--modal-input-border)',
                color: 'var(--modal-text-muted)',
              }}
            >
              Back to form
            </button>
            <Link
              href="/"
              className="h-11 px-4 text-sm font-semibold text-center transition-opacity hover:opacity-95 flex items-center justify-center rounded-none"
              style={{ backgroundColor: 'var(--primary-blue)', color: '#ffffff' }}
            >
              Go home
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor={`${prefix}email`}
          className="block text-sm font-medium mb-2"
          style={labelStyle}
        >
          Email
        </label>
        <div className="relative">
          <MailIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={mutedStyle}
          />
          <input
            id={`${prefix}email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className={`${inputBase} pl-10 pr-4 py-2.5`}
            style={inputStyle}
            autoComplete="email"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor={`${prefix}subject`}
          className="block text-sm font-medium mb-2"
          style={labelStyle}
        >
          Subject
        </label>
        <input
          id={`${prefix}subject`}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief description of your message"
          required
          maxLength={200}
          className={`${inputBase} px-4 py-2.5`}
          style={inputStyle}
        />
      </div>

      <div>
        <label
          htmlFor={`${prefix}message`}
          className="block text-sm font-medium mb-2"
          style={labelStyle}
        >
          Message
        </label>
        <textarea
          id={`${prefix}message`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what's on your mind..."
          required
          rows={5}
          maxLength={2000}
          className={`${inputBase} px-4 py-2.5 resize-none`}
          style={inputStyle}
        />
        <p className="mt-1.5 text-xs text-right" style={mutedStyle}>
          {message.length} / 2000
        </p>
      </div>

      {error && (
        <div
          className="text-sm px-4 py-3 border"
          style={{
            color: 'var(--destructive)',
            backgroundColor: 'var(--destructive-muted)',
            borderColor: 'var(--destructive)',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full px-4 py-2.5 font-semibold text-sm transition-opacity disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--primary-blue)', color: '#ffffff' }}
      >
        {isLoading ? (
          <>
            <LoaderIcon className="w-4 h-4" />
            Sending...
          </>
        ) : (
          'Send message'
        )}
      </button>
    </form>
  );
}
