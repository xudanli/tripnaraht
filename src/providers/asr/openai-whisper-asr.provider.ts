import { Injectable, Logger } from '@nestjs/common';
import { AsrProvider, AsrResult } from './asr.provider.interface';

/** Map BCP-47 locale tags to Whisper ISO-639-1 language codes. */
function mapWhisperLanguage(locale?: string): string | undefined {
  if (!locale) return undefined;
  const base = locale.split('-')[0]?.toLowerCase();
  return base || undefined;
}

function inferFilename(mime?: string): string {
  if (!mime) return 'audio.webm';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'audio.mp3';
  if (mime.includes('wav')) return 'audio.wav';
  if (mime.includes('ogg')) return 'audio.ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'audio.m4a';
  return 'audio.webm';
}

@Injectable()
export class OpenAiWhisperAsrProvider implements AsrProvider {
  private readonly logger = new Logger(OpenAiWhisperAsrProvider.name);

  async transcribe(
    audioBuffer: Buffer,
    options?: { language?: string; format?: string },
  ): Promise<AsrResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for Whisper ASR');
    }

    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.OPENAI_WHISPER_MODEL || 'whisper-1';
    const whisperLang = mapWhisperLanguage(options?.language);

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(audioBuffer)]),
      inferFilename(options?.format),
    );
    form.append('model', model);
    if (whisperLang) {
      form.append('language', whisperLang);
    }
    form.append('response_format', 'verbose_json');

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      this.logger.warn(`Whisper API error ${response.status}: ${errText.slice(0, 300)}`);
      throw new Error(`Whisper transcription failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{ text?: string; start?: number; end?: number }>;
    };

    const transcript = (payload.text ?? '').trim();
    const words =
      payload.segments?.map((seg) => ({
        word: (seg.text ?? '').trim(),
        start: seg.start ?? 0,
        end: seg.end ?? 0,
      })).filter((w) => w.word.length > 0) ?? undefined;

    return {
      transcript,
      words,
      language: options?.language ?? payload.language,
      confidence: transcript.length > 0 ? 0.92 : 0,
    };
  }
}
