import type { ReactNode } from 'react';

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
}

export function ExternalLink({ href, children }: ExternalLinkProps) {
  const isMail = href.startsWith('mailto:');
  return (
    <a
      href={href}
      target={isMail ? undefined : '_blank'}
      rel={isMail ? undefined : 'noopener noreferrer'}
      className="font-medium text-crimson-dark underline underline-offset-2 hover:text-ink"
    >
      {children}
    </a>
  );
}
