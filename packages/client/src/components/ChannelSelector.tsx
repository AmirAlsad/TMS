import { useStore } from '../stores/store';
import { CHANNELS } from '@tms/shared';
import type { Channel } from '@tms/shared';

export function ChannelSelector() {
  const channel = useStore((s) => s.channel);
  const setChannel = useStore((s) => s.setChannel);

  return (
    <select
      value={channel}
      onChange={(e) => setChannel(e.target.value as Channel)}
      className="text-xs font-medium rounded-xl px-3 py-2
                 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300
                 border-none focus:outline-none focus:ring-2 focus:ring-indigo-400/50
                 cursor-pointer transition-colors"
    >
      {(Object.entries(CHANNELS) as [Channel, { label: string }][]).map(([key, { label }]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
