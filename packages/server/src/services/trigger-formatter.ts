/**
 * Trigger Formatter
 *
 * Converts trigger payloads into XML format for bot endpoints.
 * Produces a structured XML representation that the bot can parse
 * and respond to naturally.
 */

import type { TriggerPayload, TriggerType } from '@tms/shared';

function escapeXml(str: string | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatSubAgentTrigger(trigger: TriggerPayload): string {
  const { message, timestamp, metadata } = trigger;
  const { taskType, resultSummary, taskId, needsResponse } = metadata;

  let xml = `<trigger type="sub_agent" timestamp="${escapeXml(timestamp)}">`;

  if (taskType) {
    xml += `\n  <task_type>${escapeXml(taskType)}</task_type>`;
  }
  if (resultSummary) {
    xml += `\n  <result_summary>${escapeXml(resultSummary)}</result_summary>`;
  }
  if (taskId) {
    xml += `\n  <task_id>${escapeXml(taskId)}</task_id>`;
  }
  if (needsResponse) {
    xml += `\n  <needs_response>true</needs_response>`;
  }

  xml += `\n  <content>${escapeXml(message)}</content>`;
  xml += `\n</trigger>`;

  return xml;
}

function formatScheduledTrigger(trigger: TriggerPayload): string {
  const { message, timestamp, metadata } = trigger;
  const { scheduleId, scheduledFor, scheduleType } = metadata;

  let xml = `<trigger type="scheduled" timestamp="${escapeXml(timestamp)}">`;

  if (scheduleType) {
    xml += `\n  <schedule_type>${escapeXml(scheduleType)}</schedule_type>`;
  }
  if (scheduleId) {
    xml += `\n  <schedule_id>${escapeXml(scheduleId)}</schedule_id>`;
  }
  if (scheduledFor) {
    xml += `\n  <scheduled_for>${escapeXml(scheduledFor)}</scheduled_for>`;
  }

  xml += `\n  <content>${escapeXml(message)}</content>`;
  xml += `\n</trigger>`;

  return xml;
}

function formatSystemEventTrigger(trigger: TriggerPayload): string {
  const { message, timestamp, metadata } = trigger;
  const { eventType, eventData } = metadata;

  let xml = `<trigger type="system_event" timestamp="${escapeXml(timestamp)}">`;

  if (eventType) {
    xml += `\n  <event_type>${escapeXml(eventType)}</event_type>`;
  }
  if (eventData && typeof eventData === 'object') {
    xml += `\n  <event_data>${escapeXml(JSON.stringify(eventData))}</event_data>`;
  }

  xml += `\n  <content>${escapeXml(message)}</content>`;
  xml += `\n</trigger>`;

  return xml;
}

function formatCheckInTrigger(trigger: TriggerPayload): string {
  const { message, timestamp, metadata } = trigger;
  const { checkInId, event, scheduledAt } = metadata;

  let xml = `<trigger type="check_in" timestamp="${escapeXml(timestamp)}">`;

  if (checkInId) {
    xml += `\n  <check_in_id>${escapeXml(checkInId)}</check_in_id>`;
  }
  if (event) {
    xml += `\n  <event>${escapeXml(event)}</event>`;
  }
  if (scheduledAt) {
    xml += `\n  <scheduled_at>${escapeXml(scheduledAt)}</scheduled_at>`;
  }

  xml += `\n  <content>${escapeXml(message)}</content>`;
  xml += `\n</trigger>`;

  return xml;
}

function formatBroadcastTrigger(trigger: TriggerPayload): string {
  const { message, timestamp, metadata } = trigger;
  const { broadcastId, adminId } = metadata;

  let xml = `<trigger type="broadcast" timestamp="${escapeXml(timestamp)}">`;

  if (broadcastId) {
    xml += `\n  <broadcast_id>${escapeXml(broadcastId)}</broadcast_id>`;
  }
  if (adminId) {
    xml += `\n  <admin_id>${escapeXml(adminId)}</admin_id>`;
  }

  xml += `\n  <content>${escapeXml(message)}</content>`;
  xml += `\n</trigger>`;

  return xml;
}

const FORMATTERS: Record<TriggerType, (trigger: TriggerPayload) => string> = {
  sub_agent: formatSubAgentTrigger,
  scheduled: formatScheduledTrigger,
  system_event: formatSystemEventTrigger,
  check_in: formatCheckInTrigger,
  broadcast: formatBroadcastTrigger,
};

/**
 * Format a trigger payload into XML for the bot endpoint.
 */
export function formatTriggerForIA(trigger: TriggerPayload): string {
  const formatter = FORMATTERS[trigger.type];
  if (!formatter) {
    throw new Error(`Unknown trigger type: ${trigger.type}`);
  }
  return formatter(trigger);
}
