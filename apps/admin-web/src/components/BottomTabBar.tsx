import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

export interface TabItem {
  to: string;
  label: string;
  icon: string;
  badge?: number;
}

export function BottomTabBar({ items, active }: { items: TabItem[]; active: string }) {
  const navigate = useNavigate();
  return (
    <nav className="absolute bottom-0 w-full z-50 flex justify-around items-center px-md pb-xs pt-xs bg-surface-container-lowest border-t border-outline-variant shadow-sm rounded-t-xl">
      {items.map((item) => {
        const isActive = item.to === active;
        return (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className={`flex flex-col items-center justify-center px-4 py-1 rounded-full transition-transform duration-200 relative ${
              isActive ? 'bg-primary-container text-on-primary-container scale-95' : 'text-on-surface-variant hover:bg-surface-variant/50'
            }`}
          >
            <Icon name={item.icon} filled={isActive} className="text-[22px]" />
            <span className="font-label-sm text-[10px] mt-0.5">{item.label}</span>
            {!!item.badge && (
              <span className="absolute top-0 right-1 bg-error text-on-error font-bold text-[10px] w-[16px] h-[16px] rounded-full flex items-center justify-center border-2 border-surface-container-lowest">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
