import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import Script from "next/script";
import Analytics from "./components/Analytics";
import StructuredData from "./components/StructuredData";
import "./globals.css";

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  title: "fmr.fyi - Fair Market Rent Data",
  description:
    "Search Fair Market Rent data by address, city, ZIP code, county, or parish. Find HUD FMR and SAFMR data instantly.",
  metadataBase: new URL("https://fmr.fyi"),
  verification: googleVerification ? { google: googleVerification } : undefined,
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "fmr.fyi - Fair Market Rent Data",
    description:
      "Search Fair Market Rent data by address, city, ZIP code, county, or parish. Find HUD FMR and SAFMR data instantly.",
    url: "https://fmr.fyi",
    siteName: "fmr.fyi",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "fmr.fyi - Fair Market Rent Data",
    description:
      "Search Fair Market Rent data by address, city, ZIP code, county, or parish. Find HUD FMR and SAFMR data instantly.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-11417164379"
          strategy="afterInteractive"
        />
        <Script id="google-ads" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-11417164379');
          `}
        </Script>
        <Script id="google-ads-conversion" strategy="afterInteractive">
          {`
            if (typeof gtag !== 'undefined') {
              gtag('event', 'conversion', {'send_to': 'AW-11417164379/dz0wCKb8jvgYENu0kMQq'});
            }
          `}
        </Script>
        <Analytics />
        <StructuredData />
        <VercelAnalytics />
        {children}
      </body>
    </html>
  );
}
