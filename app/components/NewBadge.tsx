export default function NewBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded border border-[var(--border-color)] ${className}`}
    >
      New
    </span>
  );
}
