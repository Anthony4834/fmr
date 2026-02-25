'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ContactModal from '@/app/components/ContactModal';

export default function FooterV2() {
  const [showContactModal, setShowContactModal] = useState(false);
  const currentYear = new Date().getFullYear();
  
  const productLinks = [
    { href: '/', label: 'Search' },
    { href: '/explorer', label: 'Explorer' },
    { href: '/map', label: 'Investment Map' },
    { href: 'https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb', label: 'Chrome Extension', external: true },
  ];
  
  const resourceLinks: Array<{ href: string; label: string; onClick?: () => void; isButton?: boolean }> = [
    { href: '/what-is-fmr', label: 'What is FMR?' },
    { href: '/what-is-safmr', label: 'What is SAFMR?' },
    { href: '/faq', label: 'FAQ' },
    { href: '/data-sources', label: 'Data Sources' },
    { href: '#', label: 'Contact', onClick: () => setShowContactModal(true), isButton: true },
  ];
  
  const browseLinks = [
    { href: '/best-states-section-8', label: 'Best States for Section 8' },
    { href: '/highest-fmr-states', label: 'Highest FMR States' },
    { href: '/counties', label: 'Counties' },
    { href: '/cities', label: 'Cities' },
  ];

  return (
    <footer 
      className="py-10 sm:py-12 md:py-16 border-t"
      style={{ 
        backgroundColor: 'var(--modal-bg)',
        borderColor: 'var(--modal-divider)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Main footer content */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 sm:gap-8 md:gap-10 mb-8 sm:mb-12">
          {/* Brand column */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 sm:gap-2.5 mb-3 sm:mb-4">
              <div 
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: 'hsl(192 85% 42%)' }}
              >
                <Image
                  src="/icon.png"
                  alt="fmr.fyi"
                  width={36}
                  height={36}
                  className="w-full h-full object-contain"
                />
              </div>
              <span 
                className="font-display font-semibold text-lg sm:text-xl tracking-tight"
                style={{ color: 'var(--modal-text)' }}
              >
                fmr.fyi
              </span>
            </Link>
            <p 
              className="text-xs sm:text-sm leading-relaxed max-w-xs mb-3 sm:mb-4"
              style={{ 
                color: 'var(--modal-text-muted)',
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
              }}
            >
              The fastest way to find HUD Fair Market Rent data. Built for Section 8 investors who want to make data-driven decisions.
            </p>
            <p 
              className="text-xs"
              style={{ 
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
              }}
            >
              Data sourced from HUD and updated annually.
            </p>
          </div>
          
          {/* Product links */}
          <div>
            <h3 
              className="font-semibold text-xs sm:text-sm mb-3 sm:mb-4"
              style={{ 
                color: 'var(--modal-text)',
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
              }}
            >
              Product
            </h3>
            <ul className="space-y-2 sm:space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs sm:text-sm transition-colors inline-flex items-center gap-1"
                      style={{ 
                        color: 'var(--modal-text-muted)',
                        fontFamily: 'var(--font-sans), system-ui, sans-serif',
                      }}
                    >
                      {link.label}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-xs sm:text-sm transition-colors"
                      style={{ 
                        color: 'var(--modal-text-muted)',
                        fontFamily: 'var(--font-sans), system-ui, sans-serif',
                      }}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
          
          {/* Resources links */}
          <div>
            <h3 
              className="font-semibold text-xs sm:text-sm mb-3 sm:mb-4"
              style={{ 
                color: 'var(--modal-text)',
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
              }}
            >
              Resources
            </h3>
            <ul className="space-y-2 sm:space-y-2.5">
              {resourceLinks.map((link) => (
                <li key={link.href}>
                  {link.isButton ? (
                    <button
                      onClick={link.onClick}
                      className="text-xs sm:text-sm transition-colors text-left hover:opacity-80"
                      style={{ 
                        color: 'var(--modal-text-muted)',
                        fontFamily: 'var(--font-sans), system-ui, sans-serif',
                      }}
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-xs sm:text-sm transition-colors"
                      style={{ 
                        color: 'var(--modal-text-muted)',
                        fontFamily: 'var(--font-sans), system-ui, sans-serif',
                      }}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
          
          {/* Browse links */}
          <div>
            <h3 
              className="font-semibold text-xs sm:text-sm mb-3 sm:mb-4"
              style={{ 
                color: 'var(--modal-text)',
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
              }}
            >
              Browse
            </h3>
            <ul className="space-y-2 sm:space-y-2.5">
              {browseLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs sm:text-sm transition-colors"
                    style={{ 
                      color: 'var(--modal-text-muted)',
                      fontFamily: 'var(--font-sans), system-ui, sans-serif',
                    }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Bottom bar */}
        <div 
          className="pt-6 sm:pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4"
          style={{ borderColor: 'var(--modal-divider)' }}
        >
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <p 
              className="text-xs sm:text-sm"
              style={{ 
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
              }}
            >
              © {currentYear} fmr.fyi. All rights reserved.
            </p>
            <Link
              href="/privacy"
              className="text-xs sm:text-sm transition-colors hover:opacity-80"
              style={{ 
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
              }}
            >
              Privacy Policy
            </Link>
          </div>
          <p 
            className="text-xs"
            style={{ 
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-sans), system-ui, sans-serif',
            }}
          >
            Not affiliated with HUD. For informational purposes only.
          </p>
        </div>
      </div>
      <ContactModal isOpen={showContactModal} onClose={() => setShowContactModal(false)} />
    </footer>
  );
}
