import type { ProjectContent } from '../../game/data/content';
import { ChipList } from './ChipList';
import { ExternalLink } from './ExternalLink';

interface ProjectCardProps {
  project: ProjectContent;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { card, bullets } = project;
  return (
    <article className="flex break-inside-avoid flex-col rounded-lg border-2 border-crimson bg-cream-light p-5">
      <h3 className="text-xl font-bold text-ink">{card.title}</h3>
      <p className="mt-1 text-ink/80">{card.tagline}</p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <div className="mt-4">
        <ChipList items={card.tech} label={`${card.title} tech stack`} />
      </div>
      <ul aria-label={`${card.title} links`} className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        {card.links.map((link) => (
          <li key={link.label}>
            {link.url === null ? (
              <span className="italic text-ink/70">{link.label} (link coming soon)</span>
            ) : (
              <ExternalLink href={link.url}>{link.label}</ExternalLink>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}
