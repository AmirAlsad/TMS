import type { MessageBufferingConfig } from '@tms/shared';

const DEFAULT_INITIAL_TIMEOUT_MS = 2000;
const DEFAULT_GROWTH_FACTOR = 1.25;
const DEFAULT_MAX_TIMEOUT_MS = 8000;

/**
 * Message buffer for rapid-message aggregation.
 *
 * When enabled, incoming user messages are held in a buffer. Each new message
 * resets the flush timer with an exponentially growing timeout (1.25x, 8s cap).
 * When the timer fires, all buffered messages are concatenated and flushed.
 */
export class MessageBuffer {
  private buffer: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private currentTimeout: number;
  private config: Required<Omit<MessageBufferingConfig, 'enabled'>>;
  private onFlush: (aggregatedMessage: string) => void;

  constructor(
    config: MessageBufferingConfig,
    onFlush: (aggregatedMessage: string) => void,
  ) {
    this.config = {
      initialTimeoutMs: config.initialTimeoutMs ?? DEFAULT_INITIAL_TIMEOUT_MS,
      growthFactor: config.growthFactor ?? DEFAULT_GROWTH_FACTOR,
      maxTimeoutMs: config.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS,
    };
    this.currentTimeout = this.config.initialTimeoutMs;
    this.onFlush = onFlush;
  }

  /** Add a message to the buffer. Resets the flush timer. */
  add(message: string): void {
    this.buffer.push(message);

    // Clear existing timer
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Grow timeout for subsequent messages
    if (this.buffer.length > 1) {
      this.currentTimeout = Math.min(
        this.currentTimeout * this.config.growthFactor,
        this.config.maxTimeoutMs,
      );
    }

    // Set new flush timer
    this.timer = setTimeout(() => {
      this.flush();
    }, this.currentTimeout);
  }

  /** Force-flush the buffer immediately. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    const aggregated = this.buffer.join('\n');
    this.buffer = [];
    this.currentTimeout = this.config.initialTimeoutMs;

    this.onFlush(aggregated);
  }

  /** Get the number of buffered messages. */
  get size(): number {
    return this.buffer.length;
  }

  /** Check if the buffer is empty. */
  get isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /** Clean up the timer. */
  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = [];
  }
}

/**
 * Create a message buffer if buffering is enabled, otherwise return null.
 * This allows callers to conditionally use buffering without checking config everywhere.
 */
export function createMessageBuffer(
  config: MessageBufferingConfig | undefined,
  onFlush: (aggregatedMessage: string) => void,
): MessageBuffer | null {
  if (!config?.enabled) return null;
  return new MessageBuffer(config, onFlush);
}
