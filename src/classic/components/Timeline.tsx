import type { QuestEntry } from '../../game/types';

interface TimelineProps {
  entries: QuestEntry[];
}

export function Timeline({ entries }: TimelineProps) {
  return (
    <ol className="space-y-5 border-l-2 border-crimson pl-5">
      {entries.map((e) => (
        <li key={e.title} className="break-inside-avoid">
          <p className="text-sm font-semibold uppercase tracking-wide text-crimson-dark">
            {e.when}
          </p>
          <h3 className="text-lg font-bold text-ink">{e.title}</h3>
          <p className="text-ink/90">{e.detail}</p>
        </li>
      ))}
    </ol>
  );
}
