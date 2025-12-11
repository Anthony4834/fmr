import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FMR Search',
  description: 'Search Fair Market Rent data by address, city, ZIP code, or county',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

