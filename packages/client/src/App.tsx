import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './stores/store';
import { MessagePanel } from './components/MessagePanel';
import { LogPanel } from './components/LogPanel';
import { ChannelSelector } from './components/ChannelSelector';
import { ConfigPanel } from './components/ConfigPanel';
import { ModeToggle } from './components/ModeToggle';
import { EvalPanel } from './components/EvalPanel';
import { EvalResultsPanel } from './components/EvalResultsPanel';
import { EvalStatusBar } from './components/EvalStatusBar';
import { PhoneFrame } from './components/PhoneFrame';
import { ThemeToggle } from './components/ThemeToggle';

type RightTab = 'eval' | 'results' | 'logs';

export function App() {
  useWebSocket();

  const showConfig = useStore((s) => s.showConfig);
  const toggleConfig = useStore((s) => s.toggleConfig);
  const mode = useStore((s) => s.mode);
  const theme = useStore((s) => s.theme);
  const [rightTab, setRightTab] = useState<RightTab>('eval');

  const isAutomated = mode === 'automated';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header
        className="relative z-30 flex items-center justify-between px-5 py-2.5
                    bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl
                    border-b border-slate-200/60 dark:border-slate-700/40"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">T</span>
            </div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              TMS
            </h1>
          </div>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 hidden sm:block">
            Text Messaging Simulator
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <ModeToggle />
          <ChannelSelector />
          <ThemeToggle />
          <button
            onClick={toggleConfig}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400
                       dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800
                       transition-colors"
            title="Settings"
          >
            <svg
              className="w-[18px] h-[18px]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </button>
        </div>
      </header>

      {showConfig && <ConfigPanel />}
      <EvalStatusBar />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Phone area */}
        <div className="flex-1 dot-grid">
          <PhoneFrame>
            <MessagePanel readOnly={isAutomated} />
          </PhoneFrame>
        </div>

        {/* Right panel */}
        <div
          className="w-[380px] flex flex-col border-l border-slate-200/60 dark:border-slate-700/40
                      bg-white dark:bg-slate-900"
        >
          {isAutomated ? (
            <>
              <div className="flex border-b border-slate-200/60 dark:border-slate-700/40">
                {(['eval', 'results', 'logs'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      rightTab === tab
                        ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {rightTab === 'eval' && <EvalPanel />}
                {rightTab === 'results' && <EvalResultsPanel />}
                {rightTab === 'logs' && <LogPanel />}
              </div>
            </>
          ) : (
            <LogPanel />
          )}
        </div>
      </div>
    </div>
  );
}
