import type { Message, ReadReceiptMode, WhatsAppReadReceipt } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';

export interface ReadReceiptConfig {
  mode: ReadReceiptMode;
  autoDelayMs?: number;
}

const DEFAULT_AUTO_DELAY_MS = 2000;

export type ReadCallback = (messageId: string) => void;

export class ReadReceiptService {
  private unread: Map<string, { messageId: string; timestamp: string }> = new Map();
  private readIds: Set<string> = new Set();
  private allTracked: Set<string> = new Set();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private broadcast: BroadcastFn;
  private config: ReadReceiptConfig;
  private onReadCallback?: ReadCallback;

  constructor(
    config: ReadReceiptConfig,
    broadcast: BroadcastFn,
    onReadCallback?: ReadCallback,
  ) {
    this.config = config;
    this.broadcast = broadcast;
    this.onReadCallback = onReadCallback;
  }

  /** Track a bot message as unread. In auto_delay mode, starts auto-read timer. */
  trackMessage(message: Message): void {
    this.allTracked.add(message.id);
    this.unread.set(message.id, {
      messageId: message.id,
      timestamp: message.timestamp,
    });

    if (this.config.mode === 'auto_delay') {
      this.scheduleAutoRead(message.id);
    }
  }

  /** Mark all unread messages up to and including targetMessageId as read. */
  markReadUpTo(targetMessageId: string): WhatsAppReadReceipt[] {
    const receipts: WhatsAppReadReceipt[] = [];
    const now = new Date().toISOString();

    // Collect all unread message IDs in insertion order, up to the target
    for (const [id] of this.unread) {
      receipts.push({ type: 'read_receipt', messageId: id, readAt: now });
      this.readIds.add(id);

      // Clear any pending auto-read timer
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }

      if (id === targetMessageId) break;
    }

    // Remove marked messages from unread
    for (const receipt of receipts) {
      this.unread.delete(receipt.messageId);
    }

    // Broadcast each receipt and fire callback to notify bot endpoint
    for (const receipt of receipts) {
      this.broadcast({ type: 'whatsapp:read_receipt', payload: receipt });
      this.onReadCallback?.(receipt.messageId);
    }

    return receipts;
  }

  /** Mark ALL unread messages as read. Used in on_response mode when user replies. */
  onUserResponse(): WhatsAppReadReceipt[] {
    if (this.config.mode !== 'on_response' || this.unread.size === 0) return [];

    const receipts: WhatsAppReadReceipt[] = [];
    const now = new Date().toISOString();

    for (const [id] of this.unread) {
      receipts.push({ type: 'read_receipt', messageId: id, readAt: now });
      this.readIds.add(id);

      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }
    }

    this.unread.clear();

    // Broadcast each receipt and fire callback to notify bot endpoint
    for (const receipt of receipts) {
      this.broadcast({ type: 'whatsapp:read_receipt', payload: receipt });
      this.onReadCallback?.(receipt.messageId);
    }

    return receipts;
  }

  /** Get the status of a specific message. */
  getStatus(messageId: string): 'sent' | 'delivered' | 'read' {
    if (this.readIds.has(messageId)) return 'read';
    if (this.allTracked.has(messageId)) return 'delivered';
    return 'sent';
  }

  /** Get statuses for all tracked messages. */
  getMessageStatuses(): Array<{ messageId: string; status: 'sent' | 'delivered' | 'read' }> {
    return [...this.allTracked].map((id) => ({
      messageId: id,
      status: this.getStatus(id),
    }));
  }

  /** Check if a message has been read. */
  isRead(messageId: string): boolean {
    return this.readIds.has(messageId);
  }

  /** Update the read receipt config at runtime. */
  updateConfig(newConfig: ReadReceiptConfig): void {
    // Clear all existing auto-read timers when mode changes
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    this.config = newConfig;

    // If switching to auto_delay, schedule timers for existing unread messages
    if (newConfig.mode === 'auto_delay') {
      for (const [id] of this.unread) {
        this.scheduleAutoRead(id);
      }
    }
  }

  /** Clean up all pending timers. */
  destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private scheduleAutoRead(messageId: string): void {
    const delay = this.config.autoDelayMs ?? DEFAULT_AUTO_DELAY_MS;
    const timer = setTimeout(() => {
      this.timers.delete(messageId);
      if (this.unread.has(messageId)) {
        this.markReadUpTo(messageId);
      }
    }, delay);
    this.timers.set(messageId, timer);
  }
}
