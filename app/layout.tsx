import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import Script from "next/script";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import Analytics from "./components/Analytics";
import StructuredData from "./components/StructuredData";
import { ThemeProvider } from "./contexts/ThemeContext";
import { RateLimitProvider } from "./contexts/RateLimitContext";
import { AuthProvider } from "./contexts/AuthContext";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  title: "fmr.fyi - Fair Market Rent Data",
  description:
    "Search Fair Market Rent data by address, city, ZIP code, county, or parish. Find HUD FMR and SAFMR data instantly.",
  metadataBase: new URL("https://fmr.fyi"),
  verification: googleVerification ? { google: googleVerification } : undefined,
  icons: {
    icon: [
      { url: "/icon.png", sizes: "96x96", type: "image/png" },
    ],
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
    <html lang="en" className={`scroll-smooth ${spaceGrotesk.variable} ${ibmPlexSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Inline script for immediate theme application - must be first */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('theme');
                  var theme = stored || 'system';
                  var effectiveTheme = theme === 'system' 
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : theme;
                  document.documentElement.setAttribute('data-theme', effectiveTheme);
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'light');
                }
              })();
            `,
          }}
        />
        {/* Inline script for fetch interceptor - must run before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;
                var originalFetch = window.fetch;
                window.fetch = async function(input, init) {
                  var url = null;
                  if (typeof input === 'string') {
                    url = input;
                  } else if (input instanceof URL) {
                    url = input.href;
                  } else if (input instanceof Request) {
                    url = input.url;
                  }
                  
                  var response = await originalFetch(input, init);
                  
                  var isApiRoute = url && (url.startsWith('/api/') || url.includes('/api/'));
                  
                  if (response.status === 429 && isApiRoute) {
                    try {
                      var resetTimeHeader = response.headers.get('X-RateLimit-Reset');
                      if (resetTimeHeader) {
                        var resetTime = parseInt(resetTimeHeader, 10);
                        if (!isNaN(resetTime) && resetTime > 0) {
                          window.dispatchEvent(
                            new CustomEvent('rate-limit-exceeded', {
                              detail: { resetTime: resetTime }
                            })
                          );
                        }
                      }
                    } catch (e) {
                      console.error('Error handling rate limit:', e);
                    }
                  }
                  
                  return response;
                };
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <ThemeProvider>
            <RateLimitProvider>
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
            </RateLimitProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
