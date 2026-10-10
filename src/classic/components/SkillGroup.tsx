import type { SkillPouch } from '../../game/types';
import { ChipList } from './ChipList';

interface SkillGroupProps {
  pouch: SkillPouch;
}

export function SkillGroup({ pouch }: SkillGroupProps) {
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 text-lg font-semibold text-ink">{pouch.name}</h3>
      <ChipList items={pouch.items} label={pouch.name} />
    </div>
  );
}
