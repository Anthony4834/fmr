'use client';

import { useState } from 'react';
import InvestorScoreModal from './InvestorScoreModal';

export default function InvestorScoreInfoButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="text-xs sm:text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap flex items-center gap-1"
        title="What is Investment Score?"
      >
        <svg className="w-3.5 h-3.5 sm:hidden" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
        <span className="hidden sm:inline underline">What is Investment Score?</span>
      </button>
      <InvestorScoreModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}



