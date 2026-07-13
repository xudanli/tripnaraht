import type { IntercomMessageDto } from '../types/in-trip-comms.types';
import type { InTripCommsAudioStorageService } from '../services/in-trip-comms-audio-storage.service';
import { parseCommsPayload } from './comms-message-mapper.util';
import type { TripInTripCommsMessage } from '@prisma/client';

type AudioPayload = {
  storageKey?: string;
  fileUrl?: string | null;
  url?: string;
  durationSec?: number;
  mimeType?: string;
  transcriptId?: string;
};

export async function enrichIntercomMessagesAudio(
  rows: TripInTripCommsMessage[],
  dtos: IntercomMessageDto[],
  audioStorage: InTripCommsAudioStorageService,
): Promise<IntercomMessageDto[]> {
  return Promise.all(
    dtos.map(async (dto, index) => {
      const row = rows[index];
      if (!row || dto.type !== 'voice') return stripInternalAudio(dto);
      const payload = parseCommsPayload(row.payload);
      const audio = payload.audio as AudioPayload | undefined;
      if (!audio?.storageKey) return stripInternalAudio(dto);
      try {
        const signed = await audioStorage.signDownloadUrl(audio.storageKey, audio.fileUrl ?? null);
        return {
          ...dto,
          audio: {
            url: signed.url,
            durationSec: audio.durationSec ?? dto.audio?.durationSec,
            mimeType: audio.mimeType ?? dto.audio?.mimeType,
            transcriptId: audio.transcriptId ?? dto.audio?.transcriptId,
          },
        };
      } catch {
        return stripInternalAudio(dto);
      }
    }),
  );
}

export async function enrichIntercomMessageAudio(
  row: TripInTripCommsMessage,
  dto: IntercomMessageDto,
  audioStorage: InTripCommsAudioStorageService,
): Promise<IntercomMessageDto> {
  const [enriched] = await enrichIntercomMessagesAudio([row], [dto], audioStorage);
  return enriched;
}

function stripInternalAudio(dto: IntercomMessageDto): IntercomMessageDto {
  if (!dto.audio) return dto;
  const { url, durationSec, mimeType, transcriptId } = dto.audio;
  return {
    ...dto,
    audio: { url, durationSec, mimeType, transcriptId },
  };
}

export function resolveCommsAudioFileName(clientId: string, mimeType?: string): string {
  const ext = mimeType?.includes('webm') ? 'webm' : 'm4a';
  return `${clientId}.${ext}`;
}

export function resolveCommsAudioMimeType(format?: string, mimetype?: string): string {
  const raw = (mimetype ?? format ?? '').toLowerCase();
  if (raw.includes('webm')) return 'audio/webm';
  if (raw.includes('mp4') || raw.includes('m4a') || raw.includes('aac')) return 'audio/mp4';
  return 'audio/mp4';
}
