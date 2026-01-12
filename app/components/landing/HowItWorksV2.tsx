'use client';

import { motion } from 'framer-motion';
import { Search, Calculator, TrendingUp, Chrome } from 'lucide-react';

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

function Badge({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span 
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${className}`}
      style={{ 
        border: '1px solid hsl(220 15% 88%)',
        backgroundColor: 'transparent',
        color: 'hsl(220 15% 45%)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export default function HowItWorksV2() {
  const steps = [
    {
      number: "01",
      title: "Search & Analyze",
      subtitle: "See what Section 8 actually pays",
      description: "Get FMR and SAFMR data for any address, ZIP, or city. Compare rent limits by bedroom and track trends.",
      icon: Search,
    },
    {
      number: "02",
      title: "Run the Numbers",
      subtitle: "Know your cash flow before you buy",
      description: "Input price and expenses. See monthly cash flow and ideal purchase price.",
      icon: Calculator,
    },
    {
      number: "03",
      title: "Choose the Right Market",
      subtitle: "Invest where the math works",
      description: "Find high-scoring ZIPs and counties with interactive maps and rankings.",
      icon: TrendingUp,
    },
    {
      number: "04",
      title: "Accelerate Your Search",
      subtitle: "Analyze listings in real time",
      description: "View FMR and cash flow projections directly on property listings — tailored to your financial strategy.",
      icon: Chrome,
    },
  ];

  return (
    <section 
      id="how-it-works" 
      className="py-8 sm:py-12 md:py-24 border-t sm:border-t-0" 
      style={{ backgroundColor: 'hsl(210 20% 98%)', borderColor: 'hsl(220 15% 90%)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Mobile header */}
        <div className="sm:hidden text-center mb-4">
          <Badge className="mb-2" style={{ border: '1px solid hsl(220 15% 88%)' }}>How It Works</Badge>
          <h2 
            className="font-display text-xl font-bold tracking-tight mb-1"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Search to decision{' '}
            <span style={{ color: 'hsl(192 85% 42%)' }}>in minutes</span>
          </h2>
        </div>

        {/* Desktop header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="hidden sm:block text-center mb-8 sm:mb-12 md:mb-16"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <Badge className="mb-3 sm:mb-4" style={{ border: '1px solid hsl(220 15% 88%)' }}>How It Works</Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3 sm:mb-4"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            From search to decision{' '}
            <span style={{ color: 'hsl(192 85% 42%)' }}>in minutes</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base sm:text-lg max-w-2xl mx-auto"
            style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            A streamlined workflow that turns rent data into confident investment decisions.
          </motion.p>
        </motion.div>

        {/* Mobile: Compact horizontal layout */}
        <div className="sm:hidden space-y-3">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="flex items-start gap-3 p-3 rounded-xl border"
              style={{ 
                backgroundColor: '#ffffff',
                borderColor: 'hsl(220 15% 88%)',
              }}
            >
              <div 
                className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'hsl(192 85% 42% / 0.1)' }}
              >
                <step.icon className="w-5 h-5" style={{ color: 'hsl(192 85% 42%)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span 
                    className="text-xs font-bold"
                    style={{ color: 'hsl(192 85% 42%)' }}
                  >
                    {step.number}
                  </span>
                  <h3 
                    className="font-display font-semibold text-sm"
                    style={{ color: 'hsl(220 30% 12%)' }}
                  >
                    {step.title}
                  </h3>
                </div>
                <p 
                  className="text-xs leading-snug"
                  style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                >
                  {step.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Tablet/Desktop: Original grid layout */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={stagger}
          className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8"
        >
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              variants={fadeUp}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative"
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div 
                  className="hidden lg:block absolute top-8 left-full w-full h-px -translate-x-4"
                  style={{ backgroundColor: 'hsl(220 15% 88%)' }}
                />
              )}
              
              <div className="relative">
                <div 
                  className="text-5xl sm:text-6xl font-display font-bold mb-3 sm:mb-4"
                  style={{ color: 'rgb(230, 230, 230)' }}
                  >
                  {step.number}
                </div>
                <div 
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-3 sm:mb-4"
                  style={{ backgroundColor: 'hsl(192 85% 42% / 0.1)' }}
                >
                  <step.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: 'hsl(192 85% 42%)' }} />
                </div>
                <h3 
                  className="font-display font-semibold text-base sm:text-lg mb-1"
                  style={{ color: 'hsl(220 30% 12%)' }}
                >
                  {step.title}
                </h3>
                <p 
                  className="text-xs font-medium mb-1 sm:mb-2"
                  style={{ color: 'hsl(192 70% 50%)' }}
                >
                  {step.subtitle}
                </p>
                <p 
                  className="text-xs sm:text-sm leading-relaxed"
                  style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                >
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
