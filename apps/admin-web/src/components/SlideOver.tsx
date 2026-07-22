import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function SlideOver({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40">
      <div className="absolute inset-0 bg-on-surface/20" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-surface-container-lowest shadow-lg z-50 border-l border-outline-variant flex flex-col animate-toast-in">
        <div className="p-lg border-b border-outline-variant flex items-center justify-between shrink-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
          <button className="text-on-surface-variant hover:bg-surface-container-low p-1 rounded transition-colors" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-lg space-y-lg">{children}</div>
        {footer && <div className="p-lg border-t border-outline-variant bg-surface-container-low flex justify-end gap-md shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
