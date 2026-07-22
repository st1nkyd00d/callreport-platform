export function Toggle({ checked, onChange, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; size?: 'sm' | 'md' }) {
  const track = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div
        className={`${track} bg-outline-variant rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full ${knob} after:transition-all peer-checked:after:translate-x-full`}
      />
    </label>
  );
}
