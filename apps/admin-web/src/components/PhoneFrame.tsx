import type { ReactNode } from 'react';

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#e5e8f5] py-8">
      <div className="relative w-[390px] h-[820px] bg-black rounded-[2.75rem] p-[10px] shadow-2xl">
        <div className="relative w-full h-full bg-background rounded-[2.25rem] overflow-hidden flex flex-col pt-7">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-[60]" />
          <div className="flex-1 relative overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}
