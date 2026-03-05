import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './stores/store';
import { MessagePanel } from './components/MessagePanel';
import { LogPanel } from './components/LogPanel';
import { ChannelSelector } from './components/ChannelSelector';
import { ConfigPanel } from './components/ConfigPanel';

export function App() {
  useWebSocket();

  const showConfig = useStore((s) => s.showConfig);
  const toggleConfig = useStore((s) => s.toggleConfig);

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">TMS</h1>
        <div className="flex items-center gap-4">
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

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 border-r">
          <MessagePanel />
        </div>
        <div className="w-96">
          <LogPanel />
        </div>
      </div>
    </div>
  );
}
