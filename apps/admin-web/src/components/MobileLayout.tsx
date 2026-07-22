import { Outlet } from 'react-router-dom';
import { PhoneFrame } from './PhoneFrame';

export function MobileLayout() {
  return (
    <PhoneFrame>
      <Outlet />
    </PhoneFrame>
  );
}
