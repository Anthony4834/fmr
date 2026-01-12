'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

export default function NavV2({ isReady = false }: { isReady?: boolean }) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -12 }}
      animate={isReady ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
      transition={{ duration: 0.4, delay: isReady ? 0.1 : 0 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
      style={{
        backgroundColor: 'hsl(210 20% 98% / 0.8)',
        borderColor: 'hsl(220 15% 88%)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: 'hsl(192 85% 42%)' }}
          >
            <Image
              src="/icon.png"
              alt="fmr.fyi"
              width={32}
              height={32}
              className="w-full h-full object-contain"
            />
          </div>
          <span 
            className="font-display font-semibold text-lg tracking-tight"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            fmr.fyi
          </span>
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <a 
            href="#features" 
            className="text-sm transition-colors"
            style={{ color: 'hsl(220 15% 45%)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(220 30% 12%)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(220 15% 45%)'}
          >
            Features
          </a>
          <a 
            href="#how-it-works" 
            className="text-sm transition-colors"
            style={{ color: 'hsl(220 15% 45%)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(220 30% 12%)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(220 15% 45%)'}
          >
            How It Works
          </a>
          <Link 
            href="/explorer"
            className="text-sm transition-colors"
            style={{ color: 'hsl(220 15% 45%)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(220 30% 12%)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(220 15% 45%)'}
          >
            Explorer
          </Link>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="hidden sm:inline-flex px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{ 
              color: 'hsl(220 30% 12%)',
              backgroundColor: 'transparent',
            }}
          >
            Search
          </Link>
          <Link
            href="/"
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg text-white transition-colors"
            style={{ backgroundColor: 'hsl(192 85% 42%)' }}
          >
            Get Started
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
