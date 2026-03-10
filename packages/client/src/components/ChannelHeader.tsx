import type { Channel } from '@tms/shared';

interface ChannelHeaderProps {
  channel: Channel;
}

export function ChannelHeader({ channel }: ChannelHeaderProps) {
  if (channel === 'whatsapp') {
    return (
      <div className="bg-whatsapp-teal dark:bg-whatsapp-input-bg-dark px-5 pt-14 pb-3 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full bg-whatsapp-green/20
                      flex items-center justify-center text-whatsapp-green text-sm font-bold"
        >
          B
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Bot</p>
          <p className="text-[11px] text-emerald-300/70">online</p>
        </div>
      </div>
    );
  }

  // SMS
  return (
    <div
      className="bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-xl
                  border-b border-slate-200/50 dark:border-slate-700/50
                  px-5 pt-14 pb-3 flex items-center gap-3"
    >
      <div
        className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600
                    flex items-center justify-center text-white text-sm font-bold shadow-sm"
      >
        B
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Bot</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">SMS</p>
      </div>
    </div>
  );
}
