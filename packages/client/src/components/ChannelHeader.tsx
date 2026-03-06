import type { Channel } from '@tms/shared';

interface ChannelHeaderProps {
  channel: Channel;
}

export function ChannelHeader({ channel }: ChannelHeaderProps) {
  if (channel === 'whatsapp') {
    return (
      <div className="bg-emerald-700 text-white px-4 py-2.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-sm font-bold">
          B
        </div>
        <div>
          <p className="text-sm font-medium">Bot</p>
          <p className="text-[11px] text-emerald-200">online</p>
        </div>
      </div>
    );
  }

  // SMS
  return (
    <div className="bg-gray-100 border-b px-4 py-2.5 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-sm font-bold">
        B
      </div>
      <p className="text-sm font-medium text-gray-800">Bot</p>
    </div>
  );
}
