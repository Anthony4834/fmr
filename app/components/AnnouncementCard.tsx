import MarkdownBody from './MarkdownBody';

export interface AnnouncementCardProps {
  title: string;
  body: string;
  publishedAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Single announcement card. Used on the public /announcements page and in admin preview.
 */
export default function AnnouncementCard({ title, body, publishedAt }: AnnouncementCardProps) {
  return (
    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
      <div className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          {title}
        </h2>
        <time
          dateTime={publishedAt}
          className="text-xs text-[var(--text-tertiary)]"
        >
          {formatDate(publishedAt)}
        </time>
        <div className="mt-4">
          <MarkdownBody content={body} />
        </div>
      </div>
    </article>
  );
}
