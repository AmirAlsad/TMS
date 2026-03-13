import { useEffect, useState } from 'react';
import { useStore } from '../stores/store';

interface EvalReplayControlsProps {
  evalId: string;
  onStop: () => void;
}

/**
 * Replay control bar for stepping through eval transcripts (Tier 6.4).
 *
 * Starts a replay via POST /api/eval/replay, which broadcasts messages
 * with configurable pacing. The "Fork" button stops the replay and
 * switches to manual playground mode with the transcript loaded up
 * to the current point.
 */
export function EvalReplayControls({ evalId, onStop }: EvalReplayControlsProps) {
  const [isReplaying, setIsReplaying] = useState(false);
  const [pacingMs, setPacingMs] = useState(500);
  const lastWsMessage = useStore((s) => s.lastWsMessage);

  // Listen for replay:completed WebSocket event to reset state
  useEffect(() => {
    if (lastWsMessage?.type === 'replay:completed' && isReplaying) {
      setIsReplaying(false);
    }
  }, [lastWsMessage, isReplaying]);

  const startReplay = async () => {
    setIsReplaying(true);
    try {
      const res = await fetch('/api/eval/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evalId, pacingMs }),
      });
      if (!res.ok) {
        console.error('Failed to start replay:', res.status);
        setIsReplaying(false);
      }
    } catch (err) {
      console.error('Failed to start replay:', err);
      setIsReplaying(false);
    }
  };

  const handleFork = () => {
    setIsReplaying(false);
    onStop();
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/20
                  border-b border-amber-200 dark:border-amber-800/40"
    >
      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
        Replay: {evalId}
      </span>

      <div className="flex items-center gap-1.5 ml-auto">
        <label className="text-[11px] text-amber-600 dark:text-amber-500">Pacing:</label>
        <select
          value={pacingMs}
          onChange={(e) => setPacingMs(Number(e.target.value))}
          disabled={isReplaying}
          className="text-[11px] rounded px-1.5 py-0.5
                     bg-white dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700
                     text-amber-800 dark:text-amber-300"
        >
          <option value={200}>Fast (200ms)</option>
          <option value={500}>Normal (500ms)</option>
          <option value={1000}>Slow (1s)</option>
          <option value={2000}>Very Slow (2s)</option>
        </select>

        {!isReplaying ? (
          <button
            onClick={startReplay}
            className="text-[11px] font-medium px-2.5 py-1 rounded
                       bg-amber-500 hover:bg-amber-600 text-white transition-colors"
          >
            Play
          </button>
        ) : (
          <>
            <button
              onClick={handleFork}
              className="text-[11px] font-medium px-2.5 py-1 rounded
                         bg-blue-500 hover:bg-blue-600 text-white transition-colors"
              title="Stop replay and switch to manual input at current point"
            >
              Fork
            </button>
            <button
              onClick={() => {
                setIsReplaying(false);
                onStop();
              }}
              className="text-[11px] font-medium px-2.5 py-1 rounded
                         bg-slate-400 hover:bg-slate-500 text-white transition-colors"
            >
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
