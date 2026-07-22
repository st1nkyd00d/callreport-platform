import { Icon } from './Icon';

export function KpiCard({
  label, value, icon, trend, trendTone = 'neutral', accent,
}: {
  label: string; value: string | number; icon: string; trend?: string; trendTone?: 'up' | 'warning' | 'neutral'; accent?: 'warning';
}) {
  const trendColor = trendTone === 'up' ? 'text-secondary' : trendTone === 'warning' ? 'text-[#E65100]' : 'text-on-surface-variant';
  return (
    <div className={`bg-surface-container-lowest border border-outline-variant rounded-lg p-md shadow-sm ${accent === 'warning' ? 'border-l-4 border-l-[#F59E0B]' : ''}`}>
      <div className="flex justify-between items-start mb-sm">
        <span className="font-label-md text-label-md text-on-surface-variant">{label}</span>
        <Icon name={icon} className={accent === 'warning' ? 'text-[#F59E0B]' : 'text-primary'} />
      </div>
      <div className="font-headline-lg text-headline-lg text-on-surface mb-xs">{value}</div>
      {trend && (
        <div className={`flex items-center gap-xs font-body-sm text-body-sm ${trendColor}`}>
          <Icon name={trendTone === 'up' ? 'trending_up' : trendTone === 'warning' ? 'warning' : 'drag_handle'} className="text-[16px]" />
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}
