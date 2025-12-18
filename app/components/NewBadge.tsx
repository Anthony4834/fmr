export default function NewBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-white text-[#0a0a0a] rounded ${className}`}
    >
      New
    </span>
  );
}
