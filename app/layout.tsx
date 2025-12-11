import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'fmr.fyi - Fair Market Rent Data',
  description: 'Search Fair Market Rent data by address, city, ZIP code, or county. Find HUD FMR and SAFMR data instantly.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}

