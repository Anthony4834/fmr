'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownBodyProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content safely. Used by announcements and admin preview.
 */
export default function MarkdownBody({ content, className = '' }: MarkdownBodyProps) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-3 text-sm sm:text-base leading-relaxed text-[var(--text-secondary)]">
              {children}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold text-[var(--text-primary)] mt-4 mb-2 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-[var(--text-primary)] mt-4 mb-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mt-3 mb-1">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-3 space-y-1 text-[var(--text-secondary)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-3 space-y-1 text-[var(--text-secondary)]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm sm:text-base leading-relaxed">{children}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-primary)] underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded bg-[var(--border-color)] text-[var(--text-primary)] text-sm font-mono">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="p-3 rounded-lg bg-[var(--border-color)] overflow-x-auto text-sm my-3">
              {children}
            </pre>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
