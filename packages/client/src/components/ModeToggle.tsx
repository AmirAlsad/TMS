import { useStore } from '../stores/store';
import type { AppMode } from '../stores/store';

export function ModeToggle() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const setEvalSpecs = useStore((s) => s.setEvalSpecs);

  const handleToggle = async (newMode: AppMode) => {
    setMode(newMode);
    if (newMode === 'automated') {
      try {
        const res = await fetch('/api/eval/specs');
        if (res.ok) {
          const data = await res.json();
          setEvalSpecs(data.specs ?? []);
        }
      } catch {
        // Server may not have eval routes yet
      }
    }
  };

  return (
    <div className="flex rounded-md border text-sm overflow-hidden">
      <button
        onClick={() => handleToggle('playground')}
        className={`px-3 py-1 ${mode === 'playground' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
      >
        Playground
      </button>
      <button
        onClick={() => handleToggle('automated')}
        className={`px-3 py-1 border-l ${mode === 'automated' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
      >
        Automated
      </button>
    </div>
  );
}
