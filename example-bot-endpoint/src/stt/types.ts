/**
 * STT (Speech-to-Text) provider interface.
 *
 * Implement this interface to add a new transcription backend.
 * The harness is intentionally minimal — a single `transcribe` method
 * that accepts raw audio bytes and returns the transcribed text.
 */
export interface SttResult {
  /** The transcribed text. */
  text: string;
  /** Detected language (ISO-639-1), if available. */
  language?: string;
  /** Audio duration in seconds, if available. */
  durationSeconds?: number;
}

export interface SttProvider {
  /** Human-readable name for logging. */
  readonly name: string;

  /**
   * Transcribe audio to text.
   *
   * @param audio - Raw audio bytes
   * @param mimeType - MIME type of the audio (e.g. `audio/ogg`, `audio/mpeg`)
   * @returns Transcription result
   * @throws on unrecoverable errors (network, auth, unsupported format)
   */
  transcribe(audio: Buffer, mimeType: string): Promise<SttResult>;
}
