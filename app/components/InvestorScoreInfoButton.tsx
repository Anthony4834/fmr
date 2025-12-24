'use client';

import { useState } from 'react';
import InvestorScoreModal from './InvestorScoreModal';

export default function InvestorScoreInfoButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline transition-colors whitespace-nowrap"
      >
        What is Investment Score?
      </button>
      <InvestorScoreModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}



