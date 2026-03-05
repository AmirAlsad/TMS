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
      className="text-sm border rounded px-2 py-1"
    >
      {(Object.entries(CHANNELS) as [Channel, { label: string }][]).map(([key, { label }]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
