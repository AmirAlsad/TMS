import { useState } from 'react';
import type { Channel } from '@tms/shared';
import { getMediaCategory } from '@tms/shared';
import { ImageLightbox } from './ImageLightbox.js';

interface MediaContentProps {
  mediaType: string;
  mediaUrl: string;
  channel: Channel;
  transcription?: string | null;
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split('/').pop() || 'file';
  } catch {
    return url.split('/').pop() || 'file';
  }
}

export function MediaContent({ mediaType, mediaUrl, channel, transcription }: MediaContentProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const category = getMediaCategory(mediaType, channel);

  switch (category) {
    case 'image':
      return (
        <>
          <img
            src={mediaUrl}
            alt="Shared image"
            className="max-h-[300px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setLightboxOpen(true)}
          />
          {lightboxOpen && (
            <ImageLightbox
              src={mediaUrl}
              alt="Shared image"
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      );

    case 'sticker':
      return <img src={mediaUrl} alt="Sticker" className="w-[180px] h-[180px] object-contain" />;

    case 'audio':
      return (
        <div className="max-w-[260px]">
          <audio controls className="w-full" preload="metadata">
            <source src={mediaUrl} type={mediaType} />
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline text-blue-500"
            >
              Download audio
            </a>
          </audio>
          {transcription && (
            <div className="mt-1">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="text-[11px] opacity-60 hover:opacity-90 transition-opacity flex items-center gap-1"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showTranscript ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
                Transcript
              </button>
              {showTranscript && (
                <p className="text-[13px] mt-1 opacity-80 italic leading-snug">
                  {transcription}
                </p>
              )}
            </div>
          )}
        </div>
      );

    case 'video':
      return (
        <video controls className="max-h-[300px] rounded-lg" preload="metadata">
          <source src={mediaUrl} type={mediaType} />
        </video>
      );

    case 'document':
      return (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5
                     hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <svg
            className="w-8 h-8 text-red-500 shrink-0"
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
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{filenameFromUrl(mediaUrl)}</p>
            <p className="text-[10px] opacity-60">Open document</p>
          </div>
        </a>
      );

    case 'contact':
      return (
        <a
          href={mediaUrl}
          download
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5
                     hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <svg
            className="w-8 h-8 text-blue-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-medium">Contact Card</p>
            <p className="text-[10px] opacity-60">Download vCard</p>
          </div>
        </a>
      );

    default:
      return (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5
                     hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <svg
            className="w-8 h-8 text-slate-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{filenameFromUrl(mediaUrl)}</p>
            <p className="text-[10px] opacity-60">Download file</p>
          </div>
        </a>
      );
  }
}
