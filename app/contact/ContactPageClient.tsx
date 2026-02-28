'use client';

import { useSession } from 'next-auth/react';
import ContactFormContent from '@/app/components/ContactFormContent';

export default function ContactPageClient() {
  const { data: session } = useSession();
  return (
    <ContactFormContent
      variant="page"
      initialEmail={session?.user?.email ?? ''}
    />
  );
}
