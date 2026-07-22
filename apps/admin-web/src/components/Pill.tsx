export type PillVariant = 'success' | 'warning' | 'error' | 'neutral' | 'primary' | 'purple' | 'teal';

const styles: Record<PillVariant, string> = {
  success: 'bg-secondary/10 text-secondary border-secondary/20',
  warning: 'bg-tertiary-container/10 text-tertiary-container border-tertiary-container/20',
  error: 'bg-error/10 text-error border-error/20',
  neutral: 'bg-outline/10 text-on-surface-variant border-outline/20',
  primary: 'bg-primary/10 text-primary border-primary/20',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
};

export function Pill({ children, variant = 'neutral', className = '' }: { children: React.ReactNode; variant?: PillVariant; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-label-sm text-label-sm whitespace-nowrap ${styles[variant]} ${className}`}>
      {children}
    </span>
  );
}
