import type { ReactNode } from 'react';

interface SectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function Section({ id, title, children }: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} className="mt-12">
      <h2
        id={headingId}
        className="mb-5 border-b-2 border-crimson pb-1 text-2xl font-bold tracking-tight text-crimson-dark"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
