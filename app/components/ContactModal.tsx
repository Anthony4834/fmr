'use client';

import { useState, useEffect } from 'react';
import BaseModal from './BaseModal';
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

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidth="500px">
        {/* Header */}
        <div 
          className="border-b p-6 relative"
          style={{ borderColor: 'var(--modal-border)' }}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" style={{ color: 'var(--modal-text-muted)' }} />
          </button>
          
          <h2 
            className="text-xl font-display font-bold"
            style={{ color: 'var(--modal-text)' }}
          >
            Contact Us
          </h2>
          <p 
            className="text-sm mt-1"
            style={{ color: 'var(--modal-text-muted)' }}
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
                backgroundColor: 'var(--modal-bg)',
                borderColor: 'var(--success)',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--success)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold mb-2" style={{ color: 'var(--modal-text)' }}>
                    Message sent successfully
                  </p>
                  {referenceId && (
                    <div className="mb-3">
                      <p className="text-xs mb-1.5" style={{ color: 'var(--modal-text-muted)' }}>
                        Reference ID:
                      </p>
                      <code 
                        className="block px-3 py-2 rounded border text-sm font-mono"
                        style={{ 
                          backgroundColor: 'var(--modal-input-bg)',
                          borderColor: 'var(--modal-input-border)',
                          color: 'var(--modal-text)',
                        }}
                      >
                        {referenceId}
                      </code>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--modal-text-muted)' }}>
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
                  style={{ color: 'var(--modal-text)' }}
                >
                  Your Email
                </label>
                <div className="relative">
                  <MailIcon 
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
                    style={{ color: 'var(--modal-text-muted)' }}
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
                      backgroundColor: 'var(--modal-input-bg)',
                      borderColor: 'var(--modal-input-border)',
                      color: 'var(--modal-text)',
                    }}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label 
                  htmlFor="contact-subject" 
                  className="text-sm font-medium"
                  style={{ color: 'var(--modal-text)' }}
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
                    backgroundColor: 'var(--modal-input-bg)',
                    borderColor: 'var(--modal-input-border)',
                    color: 'var(--modal-text)',
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label 
                  htmlFor="contact-message" 
                  className="text-sm font-medium"
                  style={{ color: 'var(--modal-text)' }}
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
                    backgroundColor: 'var(--modal-input-bg)',
                    borderColor: 'var(--modal-input-border)',
                    color: 'var(--modal-text)',
                  }}
                />
                <p className="text-xs" style={{ color: 'var(--modal-text-muted)' }}>
                  {message.length} / 2000 characters
                </p>
              </div>

              {error && (
                <div 
                  className="text-sm p-3 rounded-lg"
                  style={{ 
                    color: 'var(--destructive)',
                    backgroundColor: 'var(--destructive-muted)',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--primary-blue)', color: '#ffffff' }}
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
    </BaseModal>
  );
}
