'use client';

interface FilterPill {
  id: string;
  label: string;
  value: string;
  onRemove: () => void;
}

interface FilterPillsProps {
  pills: FilterPill[];
  onClearAll?: () => void;
}

export default function FilterPills({ pills, onClearAll }: FilterPillsProps) {
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {pills.map((pill) => (
        <button
          key={pill.id}
          onClick={pill.onRemove}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:border-[var(--text-muted)] transition-colors group"
        >
          <span className="text-[var(--text-muted)]">{pill.label}:</span>
          <span>{pill.value}</span>
          <svg 
            className="w-3 h-3 ml-0.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ))}
      {pills.length > 1 && onClearAll && (
        <button
          onClick={onClearAll}
          className="px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
