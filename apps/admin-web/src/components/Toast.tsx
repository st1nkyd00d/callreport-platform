import { Icon } from './Icon';

export function Toast({ message, position = 'bottom' }: { message: string | null; position?: 'top' | 'bottom' }) {
  if (!message) return null;
  const placement = position === 'top' ? 'top-16' : 'bottom-6';
  return (
    <div className={`fixed ${placement} left-1/2 -translate-x-1/2 z-[100] bg-inverse-surface text-inverse-on-surface px-md py-sm rounded-lg shadow-lg flex items-center gap-sm animate-toast-in pointer-events-none`}>
      <Icon name="check_circle" className="fill text-secondary-fixed-dim" />
      <span className="font-label-md text-label-md">{message}</span>
    </div>
  );
}
