'use client';

import { useState } from 'react';
import InvestorScoreModal from './InvestorScoreModal';

interface InvestorScoreInfoIconProps {
  className?: string;
}

export default function InvestorScoreInfoIcon({ className = '' }: InvestorScoreInfoIconProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsModalOpen(true);
        }}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#e5e5e5] hover:bg-[#d4d4d4] text-[#737373] hover:text-[#0a0a0a] transition-colors ${className}`}
        aria-label="Learn more about Investment Score"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      <InvestorScoreModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
