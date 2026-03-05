import { useState } from 'react';
import { useStore } from '../stores/store';

export function ConfigPanel() {
  const botEndpoint = useStore((s) => s.botEndpoint);
  const setBotEndpoint = useStore((s) => s.setBotEndpoint);
  const [value, setValue] = useState(botEndpoint);

  const save = async () => {
    setBotEndpoint(value);
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot: { endpoint: value, method: 'POST' } }),
      });
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  return (
    <div className="border-b bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-2 max-w-xl">
        <label className="text-sm font-medium text-gray-700 shrink-0">Bot endpoint:</label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={save}
          className="bg-blue-500 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-blue-600"
        >
          Save
        </button>
      </div>
    </div>
  );
}
