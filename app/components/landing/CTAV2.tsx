'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

// Icons
const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const ArrowRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

export default function CTAV2() {
  return (
    <section 
      className="relative py-12 sm:py-16 md:py-32 overflow-hidden border-t sm:border-t-0"
      style={{ backgroundColor: 'hsl(210 20% 98%)', borderColor: 'hsl(220 15% 90%)' }}
    >
      {/* Subtle gradient overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, hsl(192 85% 42% / 0.03), transparent)',
        }}
      />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
        >
          {/* Badge */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <div 
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-6 sm:mb-8"
              style={{ 
                backgroundColor: 'hsl(192 85% 42% / 0.08)',
                color: 'hsl(192 85% 38%)',
              }}
            >
              <SparklesIcon className="w-4 h-4" />
              <span 
                className="text-xs sm:text-sm font-medium"
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                Start analyzing markets today
              </span>
            </div>
          </motion.div>
          
          {/* Heading */}
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 sm:mb-6"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Ready to find your next{' '}
            <span 
              className="relative inline-block"
              style={{ color: 'hsl(192 85% 42%)' }}
            >
              Section 8 investment
              {/* Subtle underline accent - hidden on small screens */}
              <svg 
                className="hidden sm:block absolute -bottom-1 left-0 w-full h-2"
                viewBox="0 0 200 8"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 7 Q50 0 100 4 T200 4"
                  fill="none"
                  stroke="hsl(192 85% 42% / 0.3)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            ?
          </motion.h2>
          
          {/* Description */}
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base sm:text-lg md:text-xl mb-8 sm:mb-10 max-w-2xl mx-auto"
            style={{ 
              color: 'hsl(220 15% 45%)',
              fontFamily: "var(--font-sans), system-ui, sans-serif",
            }}
          >
            Join investors using fmr.fyi to identify high-yield rental markets with confidence.
          </motion.p>
          
          {/* Buttons */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
          >
            <Link
              href="/"
              className="group w-full sm:w-auto h-11 sm:h-12 px-6 sm:px-8 inline-flex items-center justify-center gap-2 rounded-xl text-white font-medium transition-all duration-200 shadow-lg text-sm sm:text-base"
              style={{ 
                backgroundColor: 'hsl(192 85% 42%)',
                fontFamily: "var(--font-sans), system-ui, sans-serif",
                boxShadow: '0 4px 14px hsl(192 85% 42% / 0.25)',
              }}
            >
              Start Free
              <ArrowRightIcon className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto h-11 sm:h-12 px-6 sm:px-8 inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 border text-sm sm:text-base"
              style={{ 
                backgroundColor: 'hsl(0 0% 100%)',
                borderColor: 'hsl(220 15% 88%)',
                color: 'hsl(220 30% 12%)',
                fontFamily: "var(--font-sans), system-ui, sans-serif",
              }}
            >
              <Image
                src="/chrome.png"
                alt="Chrome"
                width={18}
                height={18}
                className="rounded"
              />
              <span className="hidden xs:inline">Install</span> Chrome Extension
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
