'use client';

import { useIntersectionObserver } from '@/app/hooks/useIntersectionObserver';

const features = [
  {
    title: 'FMR Data',
    description: 'Official HUD Fair Market Rent data for every county in the US',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    title: 'SAFMR Precision',
    description: 'ZIP code-level Small Area FMR for metro areas with higher accuracy',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" stroke="currentColor" strokeWidth="2" />
        <path d="M2 12h20" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    title: '41,000+ ZIPs',
    description: 'Comprehensive coverage of nearly every ZIP code in the United States',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'YoY Trends',
    description: 'Historical FMR data going back years to spot market trends',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Investment Scores',
    description: 'Proprietary algorithm factoring FMR, property values (ZHVI), tax rates, and rental demand to identify high-yield markets',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Cash Flow',
    description: 'Instant cash flow projections for any property price',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function FeatureCard({ feature, index, isVisible }: {
  feature: typeof features[0];
  index: number;
  isVisible: boolean;
}) {
  return (
    <div
      className={`group p-6 bg-white rounded-xl border border-[#e5e5e5] hover:border-[#0a0a0a]/20 hover:shadow-lg transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="w-12 h-12 rounded-lg bg-[#0a0a0a] text-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
        {feature.icon}
      </div>
      <h3 className="text-lg font-semibold text-[#0a0a0a] mb-2">{feature.title}</h3>
      <p className="text-sm text-[#737373] leading-relaxed">{feature.description}</p>
    </div>
  );
}

export default function FeaturesGrid() {
  const { ref, hasBeenInView } = useIntersectionObserver<HTMLElement>({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-12 sm:py-20 md:py-28 bg-[#fafafa]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className={`text-center mb-8 sm:mb-12 md:mb-16 transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#0a0a0a] mb-3 sm:mb-4">
            Everything You Need
          </h2>
          <p className="text-base sm:text-lg text-[#737373] max-w-2xl mx-auto">
            A complete toolkit for Section 8 and rental property investors
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              feature={feature}
              index={index}
              isVisible={hasBeenInView}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
