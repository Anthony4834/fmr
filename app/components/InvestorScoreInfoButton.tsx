'use client';

import { useState } from 'react';
import InvestorScoreModal from './InvestorScoreModal';

export default function InvestorScoreInfoButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="text-sm text-[#525252] hover:text-[#0a0a0a] underline transition-colors whitespace-nowrap"
      >
        What is Investment Score?
      </button>
      <InvestorScoreModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
