export function Chip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full font-label-md text-label-md whitespace-nowrap border transition-colors ${
        active ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
      }`}
    >
      {label}
    </button>
  );
}
