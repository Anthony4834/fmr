'use client';

import { motion } from 'framer-motion';

export default function ScreenshotShowcase({ isReady = false }: { isReady?: boolean }) {
  return (
    <div className="relative mt-8 sm:mt-16 md:mt-20">
      {/* SVG definitions for clipPaths */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="macbook-screen-clip">
            <rect x="6%" y="7.5%" width="88%" height="84.5%" rx="0.35%" ry="0.35%" />
          </clipPath>
          <clipPath id="iphone-screen-clip">
            <rect x="3%" y="4%" width="94%" height="92%" rx="2.67%" ry="2.67%" />
          </clipPath>
        </defs>
      </svg>

      {/* Mobile: MacBook with phone overlay, scaled down */}
      <div className="sm:hidden relative w-full">
        {/* MacBook */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, delay: isReady ? 0.25 : 0 }}
          className="relative w-full"
          style={{ aspectRatio: '3460 / 2060', maxWidth: '100%' }}
        >
          <img
            src="/landing/svg/macbook.svg"
            alt="Desktop app screenshot"
            className="w-full h-full object-contain relative z-10"
            style={{ filter: 'drop-shadow(0 8px 20px rgba(0, 0, 0, 0.1))' }}
          />
          <div 
            className="absolute overflow-hidden"
            style={{ 
              top: '7.5%',
              left: '6%',
              width: '88%',
              height: '84.5%',
              clipPath: 'inset(0 round 0.35%)',
              WebkitClipPath: 'inset(0 round 0.35%)',
              borderRadius: '0.35%',
              zIndex: 1
            }}
          >
            <img
              src="/landing/png/macbook_page.png"
              alt="Desktop app screenshot"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center center', display: 'block' }}
            />
          </div>
        </motion.div>

        {/* Phone overlay on mobile */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, delay: isReady ? 0.35 : 0 }}
          className="absolute"
          style={{ 
            width: '22%',
            minWidth: '70px',
            right: '5%',
            bottom: '-4%',
            zIndex: 10
          }}
        >
          <div className="relative w-full" style={{ aspectRatio: '1502 / 2948' }}>
            <img
              src="/landing/svg/iphone.svg"
              alt="Mobile app screenshot"
              className="w-full h-full object-contain relative z-10"
              style={{ filter: 'drop-shadow(0 6px 15px rgba(0, 0, 0, 0.15))' }}
            />
            <div 
              className="absolute overflow-hidden"
              style={{ 
                top: '4.5%',
                left: '3%',
                width: '94%',
                height: '90%',
                clipPath: 'inset(0 round 2.67%)',
                WebkitClipPath: 'inset(0 round 2.67%)',
                borderRadius: '2.67%',
                zIndex: 1
              }}
            >
              <img
                src="/landing/png/iphone_page.png"
                alt="Mobile app screenshot"
                className="w-full h-full object-contain"
                style={{ objectPosition: 'center center', display: 'block' }}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tablet/Desktop: MacBook with phone overlay */}
      <div className="hidden sm:block relative w-full overflow-visible">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, delay: isReady ? 0.25 : 0 }}
          className="relative w-full"
          style={{ aspectRatio: '3460 / 2060', maxWidth: '100%' }}
        >
          <img
            src="/landing/svg/macbook.svg"
            alt="Desktop app screenshot"
            className="w-full h-full object-contain relative z-10"
            style={{ filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.1))' }}
          />
          <div 
            className="absolute overflow-hidden"
            style={{ 
              top: '7.5%',
              left: '6%',
              width: '88%',
              height: '84.5%',
              clipPath: 'inset(0 round 0.35%)',
              WebkitClipPath: 'inset(0 round 0.35%)',
              borderRadius: '0.35%',
              zIndex: 1
            }}
          >
            <img
              src="/landing/png/macbook_page.png"
              alt="Desktop app screenshot"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center center', display: 'block' }}
            />
          </div>
        </motion.div>

        {/* Phone overlay - positioned on right */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, delay: isReady ? 0.35 : 0 }}
          className="absolute"
          style={{ 
            width: '180px',
            maxWidth: '25%',
            right: '3%',
            bottom: '-2%',
            zIndex: 10
          }}
        >
          <div className="relative w-full" style={{ aspectRatio: '1502 / 2948' }}>
            <img
              src="/landing/svg/iphone.svg"
              alt="Mobile app screenshot"
              className="w-full h-full object-contain relative z-10"
              style={{ filter: 'drop-shadow(0 10px 30px rgba(0, 0, 0, 0.15))' }}
            />
            <div 
              className="absolute overflow-hidden"
              style={{ 
                top: '4.5%',
                left: '3%',
                width: '94%',
                height: '90%',
                clipPath: 'inset(0 round 2.67%)',
                WebkitClipPath: 'inset(0 round 2.67%)',
                borderRadius: '2.67%',
                zIndex: 1
              }}
            >
              <img
                src="/landing/png/iphone_page.png"
                alt="Mobile app screenshot"
                className="w-full h-full object-contain"
                style={{ objectPosition: 'center center', display: 'block' }}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
