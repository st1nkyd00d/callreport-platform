export function Icon({ name, className = '', filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span className={`material-symbols-outlined ${filled ? 'fill' : ''} ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}
