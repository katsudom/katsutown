interface ChipListProps {
  items: readonly string[];
  label: string;
}

export function ChipList({ items, label }: ChipListProps) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded border border-cream-dark bg-cream-light px-2 py-0.5 text-sm text-ink"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
