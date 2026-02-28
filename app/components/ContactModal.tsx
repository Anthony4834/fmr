'use client';

import BaseModal from './BaseModal';
import ContactFormContent from './ContactFormContent';
import { useSession } from 'next-auth/react';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const XIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const { data: session } = useSession();

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
        <ContactFormContent
          key={isOpen ? 'open' : 'closed'}
          variant="modal"
          initialEmail={session?.user?.email ?? ''}
        />
      </div>
    </BaseModal>
  );
}
