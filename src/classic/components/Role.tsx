import type { ReactNode } from 'react';

interface RoleProps {
  title: string;
  org: string;
  meta: string;
  children: ReactNode;
}

export function Role({ title, org, meta, children }: RoleProps) {
  return (
    <article className="mb-8 break-inside-avoid last:mb-0">
      <h3 className="text-xl font-bold text-ink">{title}</h3>
      <p className="text-ink/80">
        <span className="font-semibold">{org}</span> · {meta}
      </p>
      <div className="mt-2">{children}</div>
    </article>
  );
}
