import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

export function MobileTopBar({ title, subtitle, onBack, right }: { title: string; subtitle?: ReactNode; onBack?: boolean; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 w-full z-30 flex items-center gap-sm px-md py-sm bg-surface border-b border-outline-variant h-14 shrink-0">
      {onBack ? (
        <button onClick={() => navigate(-1)} className="p-1 rounded-full hover:bg-surface-container-low text-on-surface-variant">
          <Icon name="arrow_back" />
        </button>
      ) : (
        <Icon name="menu" className="text-primary" />
      )}
      <h1 className="font-headline-sm text-headline-sm text-primary font-bold flex-1 truncate">{title}</h1>
      {subtitle}
      {right}
    </header>
  );
}
