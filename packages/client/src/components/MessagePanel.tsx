import { useRef, useEffect, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../stores/store';
import { ChatBubble } from './ChatBubble';
import { ChannelHeader } from './ChannelHeader';
import { QuotedReplyPreview } from './QuotedReplyPreview';
import { TypingIndicator } from './TypingIndicator';
import { MAX_MEDIA_SIZE, getMediaCategory } from '@tms/shared';

interface MessagePanelProps {
  readOnly?: boolean;
}

/** WhatsApp-style attachment menu items */
const ATTACHMENT_OPTIONS = [
  {
    label: 'Photos & Videos',
    accept: 'image/jpeg,image/png,image/webp,video/mp4',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Zm16.5-13.5h.008v.008h-.008V7.5Zm0 0L12 15" />
      </svg>
    ),
    color: 'text-violet-500',
    bg: 'bg-violet-100 dark:bg-violet-900/40',
  },
  {
    label: 'Document',
    accept: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    color: 'text-blue-500',
    bg: 'bg-blue-100 dark:bg-blue-900/40',
  },
  {
    label: 'Audio',
    accept: 'audio/ogg,audio/aac,audio/mpeg',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
      </svg>
    ),
    color: 'text-orange-500',
    bg: 'bg-orange-100 dark:bg-orange-900/40',
  },
  {
    label: 'Contact',
    accept: 'text/vcard,text/x-vcard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
    color: 'text-teal-500',
    bg: 'bg-teal-100 dark:bg-teal-900/40',
  },
] as const;

export function MessagePanel({ readOnly = false }: MessagePanelProps) {
  const viewingEvalId = useStore((s) => s.viewingEvalId);
  const exitTranscriptView = useStore((s) => s.exitTranscriptView);
  const transcriptMessages = useStore(
    useShallow((s) => {
      if (s.viewingEvalId) {
        const result = s.evalResults.find((r) => r.id === s.viewingEvalId);
        return result?.transcript ?? [];
      }
      return s.messages.filter((m) => m.channel === s.channel);
    }),
  );
  const viewingSpecName = useStore((s) => {
    if (!s.viewingEvalId) return null;
    return s.evalResults.find((r) => r.id === s.viewingEvalId)?.specName ?? null;
  });
  const messages = transcriptMessages;
  const channel = useStore((s) => s.channel);
  const replyingTo = useStore((s) => s.replyingTo);
  const setReplyingTo = useStore((s) => s.setReplyingTo);
  const typingIndicator = useStore((s) => s.typingIndicator);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<{
    file: File;
    previewUrl: string;
    mediaType: string;
  } | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileAccept, setFileAccept] = useState('');
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isWhatsApp = channel === 'whatsapp';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingIndicator]);

  // Cleanup object URL when attachment changes
  useEffect(() => {
    return () => {
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, [attachment]);

  // Close attach menu when clicking outside
  useEffect(() => {
    if (!attachMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [attachMenuOpen]);

  // Auto-dismiss file error after 4 seconds
  useEffect(() => {
    if (!fileError) return;
    const timer = setTimeout(() => setFileError(null), 4000);
    return () => clearTimeout(timer);
  }, [fileError]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be re-selected
    e.target.value = '';

    if (file.size > MAX_MEDIA_SIZE) {
      setFileError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum size is 16 MB.`);
      return;
    }

    const category = getMediaCategory(file.type, channel);
    if (!category) {
      setFileError(`Unsupported file type: ${file.type || 'unknown'}`);
      return;
    }

    // Revoke previous preview URL if any
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }

    setFileError(null);
    setAttachment({
      file,
      previewUrl: URL.createObjectURL(file),
      mediaType: file.type,
    });
  };

  const openFilePicker = (accept: string) => {
    setFileAccept(accept);
    setAttachMenuOpen(false);
    // Need a tick for the accept attr to update before triggering the click
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const removeAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
  };

  const sendMessage = async () => {
    const content = input.trim();
    if ((!content && !attachment) || sending) return;

    setSending(true);
    setInput('');

    try {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;

      // Upload attachment first if present
      if (attachment) {
        const formData = new FormData();
        formData.append('file', attachment.file);

        const uploadRes = await fetch('/api/media', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error('Failed to upload media');
        }

        const uploadData = await uploadRes.json();
        mediaUrl = uploadData.mediaUrl;
        mediaType = uploadData.mediaType;

        // Revoke the preview URL
        URL.revokeObjectURL(attachment.previewUrl);
        setAttachment(null);
      }

      const body: Record<string, unknown> = { content, channel };

      if (mediaUrl && mediaType) {
        body.mediaUrl = mediaUrl;
        body.mediaType = mediaType;
      }

      if (replyingTo && isWhatsApp) {
        body.quotedReply = {
          targetMessageId: replyingTo.id,
          quotedBody: replyingTo.content,
        };
      }

      setReplyingTo(null);

      await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setFileError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const cleanupRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setRecordingDuration(0);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      setRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setFileError('Microphone access denied. Please allow microphone permissions.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanupRecording();
      return;
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      setAttachment({
        file,
        previewUrl: URL.createObjectURL(blob),
        mediaType: 'audio/webm',
      });
      cleanupRecording();
    };
    recorder.stop();
  }, [cleanupRecording]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanupRecording();
  }, [cleanupRecording]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const showMicButton = isWhatsApp && !input.trim() && !attachment && !recording;

  const chatBg = isWhatsApp ? 'bg-whatsapp-bg dark:bg-whatsapp-bg-dark' : 'bg-white dark:bg-slate-900';

  const attachmentCategory = attachment ? getMediaCategory(attachment.mediaType, channel) : null;

  // On WhatsApp, certain media types don't support text captions
  const captionDisabled =
    isWhatsApp &&
    !!attachmentCategory &&
    ['video', 'audio', 'document', 'contact'].includes(attachmentCategory);

  // Compute grouping for messages
  const groupedMessages = messages.map((msg, i) => {
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;
    const isFirstInGroup = !prev || prev.role !== msg.role;
    const isLastInGroup = !next || next.role !== msg.role;
    return { msg, isFirstInGroup, isLastInGroup };
  });

  return (
    <div className="flex flex-col h-full">
      <ChannelHeader channel={channel} />

      {viewingEvalId && viewingSpecName && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-200/60 dark:border-indigo-700/40">
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            Viewing transcript: {viewingSpecName}
          </span>
          <button
            onClick={exitTranscriptView}
            className="p-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800/40 text-indigo-500 dark:text-indigo-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div
        className={`flex-1 overflow-y-auto px-4 py-3 scrollbar-thin ${chatBg}`}
        style={
          isWhatsApp
            ? {
                backgroundImage: 'url(/assets/whatsapp-background.png)',
                backgroundSize: '400px',
                backgroundRepeat: 'repeat',
                backgroundBlendMode: 'multiply',
              }
            : undefined
        }
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-16 gap-3">
            {isWhatsApp ? (
              <svg
                className="w-12 h-12 text-slate-300 dark:text-slate-600"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
            ) : (
              <svg
                className="w-12 h-12 text-slate-300 dark:text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                />
              </svg>
            )}
            <div className="text-center">
              <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
                {readOnly ? 'Waiting for eval to start...' : 'Send a message to get started'}
              </p>
              {!readOnly && (
                <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
                  Messages appear here
                </p>
              )}
            </div>
          </div>
        )}
        <div className="space-y-0.5">
          {groupedMessages.map(({ msg, isFirstInGroup, isLastInGroup }, i) => (
            <div key={msg.id} className={isFirstInGroup && i > 0 ? 'pt-1.5' : ''}>
              <ChatBubble
                message={msg}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
              />
            </div>
          ))}
        </div>
        {isWhatsApp && typingIndicator?.active && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {!readOnly && !viewingEvalId && (
        <>
          {replyingTo && isWhatsApp && (
            <QuotedReplyPreview message={replyingTo} onCancel={() => setReplyingTo(null)} />
          )}

          {/* File error banner */}
          {fileError && (
            <div
              className={`px-3 py-2 flex items-center gap-2 border-t text-sm
                          ${
                            isWhatsApp
                              ? 'bg-red-50 dark:bg-red-950/30 border-whatsapp-border dark:border-whatsapp-border-dark'
                              : 'bg-red-50 dark:bg-red-950/30 border-slate-200 dark:border-slate-700'
                          }`}
            >
              <svg
                className="w-4 h-4 text-red-500 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
              <span className="text-red-600 dark:text-red-400">{fileError}</span>
              <button
                onClick={() => setFileError(null)}
                className="ml-auto text-red-400 hover:text-red-600 dark:hover:text-red-300"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Attachment preview strip */}
          {attachment && (
            <div
              className={`px-3 pt-2 pb-1 flex items-center gap-2 border-t
                          ${
                            isWhatsApp
                              ? 'bg-whatsapp-input-bg dark:bg-whatsapp-input-bg-dark border-whatsapp-border dark:border-whatsapp-border-dark'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          }`}
            >
              <div className="flex-1 min-w-0">
                {attachmentCategory === 'image' || attachmentCategory === 'sticker' ? (
                  <img
                    src={attachment.previewUrl}
                    alt="Attachment preview"
                    className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-600"
                  />
                ) : attachmentCategory === 'video' ? (
                  <video
                    src={attachment.previewUrl}
                    className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-600"
                  />
                ) : attachmentCategory === 'audio' ? (
                  <audio
                    src={attachment.previewUrl}
                    controls
                    className="h-8 w-full"
                  />
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                    <svg
                      className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                      />
                    </svg>
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                      {attachment.file.name}
                    </span>
                  </div>
                )}
                {captionDisabled && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 mt-1 block">
                    Text captions not supported for this media type
                  </span>
                )}
              </div>
              <button
                onClick={removeAttachment}
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                           text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                aria-label="Remove attachment"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          )}

          <div
            className={`px-4 pt-2 pb-7 flex items-end gap-2 border-t
                        ${
                          isWhatsApp
                            ? 'bg-whatsapp-input-bg dark:bg-whatsapp-input-bg-dark border-whatsapp-border dark:border-whatsapp-border-dark'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={fileAccept}
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Attachment / paperclip button — WhatsApp only */}
            {isWhatsApp && (
              <div className="relative" ref={attachMenuRef}>
                <button
                  onClick={() => setAttachMenuOpen(!attachMenuOpen)}
                  disabled={sending}
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                             text-slate-500 dark:text-slate-400
                             hover:bg-slate-200 dark:hover:bg-slate-600
                             disabled:opacity-40
                             transition-colors"
                  aria-label="Attach file"
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${attachMenuOpen ? 'rotate-45' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13"
                    />
                  </svg>
                </button>

                {/* Attachment type menu */}
                {attachMenuOpen && (
                  <div
                    className="absolute bottom-full left-0 mb-2 w-48 py-1.5
                                bg-white dark:bg-slate-800 rounded-xl shadow-xl
                                border border-slate-200 dark:border-slate-700
                                animate-slide-up z-30"
                  >
                    {ATTACHMENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => openFilePicker(opt.accept)}
                        className="w-full flex items-center gap-3 px-3 py-2
                                   hover:bg-slate-50 dark:hover:bg-slate-700/60
                                   transition-colors text-left"
                      >
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${opt.bg} ${opt.color}`}
                        >
                          {opt.icon}
                        </span>
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {recording ? (
              /* Recording UI strip */
              <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-full
                              bg-white dark:bg-slate-700
                              border border-slate-200 dark:border-slate-600">
                <button
                  onClick={cancelRecording}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                             text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  aria-label="Cancel recording"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
                <div className="flex items-center gap-2 flex-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {formatDuration(recordingDuration)}
                  </span>
                </div>
                <button
                  onClick={stopRecording}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                             bg-whatsapp-green text-white hover:bg-[#1fbc5a] transition-colors"
                  aria-label="Stop recording and send"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={captionDisabled ? '' : input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={captionDisabled ? 'Captions not supported' : 'Type a message...'}
                disabled={sending || captionDisabled}
                className="flex-1 rounded-full px-4 py-2 text-sm
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
                           border border-slate-200 dark:border-slate-600
                           placeholder:text-slate-400 dark:placeholder:text-slate-500
                           focus:outline-none focus:ring-2 focus:ring-indigo-400/50 dark:focus:ring-indigo-500/40
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-shadow"
              />
            )}
            {showMicButton ? (
              /* Microphone button — WhatsApp, empty input, no attachment, not recording */
              <button
                onClick={startRecording}
                disabled={sending}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                           text-white bg-whatsapp-green hover:bg-[#1fbc5a]
                           disabled:opacity-40 transition-colors"
                aria-label="Record voice message"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </button>
            ) : recording ? null : (
              /* Send arrow button */
              <button
                onClick={sendMessage}
                disabled={sending || (!input.trim() && !attachment)}
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                           text-white disabled:opacity-40 transition-colors ${
                             isWhatsApp
                               ? 'bg-whatsapp-green hover:bg-[#1fbc5a] disabled:hover:bg-whatsapp-green'
                               : 'bg-indigo-500 hover:bg-indigo-600 disabled:hover:bg-indigo-500'
                           }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                  />
                </svg>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
