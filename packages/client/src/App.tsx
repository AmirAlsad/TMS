import { useState } from 'react';
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

type RightTab = 'eval' | 'results' | 'logs';

export function App() {
  useWebSocket();

  const showConfig = useStore((s) => s.showConfig);
  const toggleConfig = useStore((s) => s.toggleConfig);
  const mode = useStore((s) => s.mode);
  const [rightTab, setRightTab] = useState<RightTab>('eval');

  const isAutomated = mode === 'automated';

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">TMS</h1>
        <div className="flex items-center gap-4">
          <ModeToggle />
          <ChannelSelector />
          <button
            onClick={toggleConfig}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 border rounded"
          >
            Config
          </button>
        </div>
      </header>

      {showConfig && <ConfigPanel />}
      <EvalStatusBar />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 border-r">
          <MessagePanel readOnly={isAutomated} />
        </div>
        <div className="w-96 flex flex-col">
          {isAutomated ? (
            <>
              <div className="flex border-b text-sm">
                {(['eval', 'results', 'logs'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className={`flex-1 px-3 py-2 capitalize ${
                      rightTab === tab
                        ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
                        : 'text-gray-500 hover:text-gray-700'
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
