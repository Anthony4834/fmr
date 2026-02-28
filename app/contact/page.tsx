import type { Metadata } from 'next';
import Link from 'next/link';
import ContactPageClient from './ContactPageClient';

export const metadata: Metadata = {
  title: 'Contact | fmr.fyi',
  description: 'Contact fmr.fyi – send feedback, report issues, or ask questions about Fair Market Rent data.',
  alternates: { canonical: 'https://fmr.fyi/contact' },
};

export default function ContactPage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 pt-12 pb-8 antialiased"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-[420px]">
        <div
          className="rounded-none border p-8 overflow-hidden"
          style={{
            backgroundColor: 'var(--modal-bg)',
            borderColor: 'var(--modal-border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
          }}
        >
          <Link
            href="/"
            className="text-sm font-medium hover:opacity-70 transition-opacity inline-block mb-6"
            style={{ color: 'var(--modal-text-muted)' }}
          >
            ← Back to search
          </Link>

          <h1
            className="text-xl font-semibold tracking-tight"
            style={{ color: 'var(--modal-text)' }}
          >
            Contact us
          </h1>
          <p
            className="text-sm mt-2 opacity-90"
            style={{ color: 'var(--modal-text-muted)' }}
          >
            Send feedback, report issues, or ask questions.
          </p>

          <div className="mt-6">
            <ContactPageClient />
          </div>
        </div>
      </div>
    </main>
  );
}
