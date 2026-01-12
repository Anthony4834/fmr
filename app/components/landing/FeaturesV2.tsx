'use client';

import { motion } from 'framer-motion';
import { Search, Calculator, BarChart3, Map, TrendingUp, Chrome } from 'lucide-react';

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

export default function FeaturesV2() {
  const features = [
    {
      icon: Search,
      title: "Instant FMR Lookup",
      description: "Search by address, ZIP, city, county, or state. Get FMR and SAFMR data for 0-4 bedroom units instantly.",
    },
    {
      icon: BarChart3,
      title: "Investment Scores",
      description: "ZIP-level scores based on net yield, rent-to-price ratios, and rental demand indicators.",
    },
    {
      icon: Calculator,
      title: "Cash Flow Calculator",
      description: "Estimate monthly cash flow with mortgage, taxes, insurance, and management costs built in.",
    },
    {
      icon: Map,
      title: "Interactive Maps",
      description: "Choropleth maps showing investment scores by county. Click to explore market details.",
    },
    {
      icon: TrendingUp,
      title: "Historical Trends",
      description: "Track FMR changes over time to identify rising markets and forecast future rents.",
    },
    {
      icon: Chrome,
      title: "Chrome Extension",
      description: "See FMR data while browsing Zillow, Redfin, and Realtor.com. Calculate cash flow on any listing.",
    },
  ];

  return (
    <section 
      id="features" 
      className="py-8 sm:py-12 md:py-24 border-t sm:border-t-0" 
      style={{ backgroundColor: 'hsl(210 20% 98%)', borderColor: 'hsl(220 15% 90%)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Mobile header */}
        <div className="sm:hidden text-center mb-5">
          <Badge className="mb-2" style={{ border: '1px solid hsl(220 15% 88%)' }}>Features</Badge>
          <h2 
            className="font-display text-xl font-bold tracking-tight mb-2"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Everything for{" "}
            <span style={{ color: 'hsl(192 85% 42%)' }}>smarter investing</span>
          </h2>
          <p 
            className="text-xs"
            style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            Tools for data-driven Section 8 decisions.
          </p>
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
            <Badge className="mb-3 sm:mb-4" style={{ border: '1px solid hsl(220 15% 88%)' }}>Features</Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3 sm:mb-4"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Everything you need for{" "}
            <span style={{ color: 'hsl(192 85% 42%)' }}>smarter investing</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base sm:text-lg max-w-2xl mx-auto"
            style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            From quick rent lookups to deep market analysis, fmr.fyi gives you the data edge for Section 8 investing.
          </motion.p>
        </motion.div>

        {/* Mobile: Simple list, no animations */}
        <div className="sm:hidden space-y-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={`relative rounded-xl border p-4 ${feature.title === 'Interactive Maps' ? 'map-connector-source' : ''} ${feature.title === 'Cash Flow Calculator' ? 'calculator-connector-source' : ''}`}
              style={{ 
                backgroundColor: '#ffffff',
                borderColor: 'hsl(220 15% 88%)',
              }}
            >
              <div className="flex items-start gap-3">
                <div 
                  className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'hsl(192 85% 42% / 0.1)' }}
                >
                  <feature.icon className="w-5 h-5" style={{ color: 'hsl(192 85% 42%)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 
                    className="font-display font-semibold text-sm mb-1"
                    style={{ color: 'hsl(220 30% 12%)' }}
                  >
                    {feature.title}
                  </h3>
                  <p 
                    className="text-xs leading-relaxed"
                    style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                  >
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tablet/Desktop: Grid with animations */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={stagger}
          className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              variants={fadeUp}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className={`group relative rounded-xl border p-4 sm:p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${feature.title === 'Interactive Maps' ? 'map-connector-source' : ''} ${feature.title === 'Cash Flow Calculator' ? 'calculator-connector-source' : ''}`}
              style={{ 
                backgroundColor: '#ffffff',
                borderColor: 'hsl(220 15% 88%)',
              }}
            >
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{ backgroundColor: 'hsl(192 85% 42% / 0.1)' }}
              >
                <feature.icon className="w-6 h-6" style={{ color: 'hsl(192 85% 42%)' }} />
              </div>
              <h3 
                className="font-display font-semibold text-lg mb-2"
                style={{ color: 'hsl(220 30% 12%)' }}
              >
                {feature.title}
              </h3>
              <p 
                className="text-sm leading-relaxed"
                style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
