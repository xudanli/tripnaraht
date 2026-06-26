import { BadRequestException } from '@nestjs/common';
import { TripWishVoiceService } from './trip-wish-voice.service';
import type { TripWishAccessService } from './trip-wish-access.service';
import type { TripWishStructuringService } from './trip-wish-structuring.service';
import type { TripWishService } from './trip-wish.service';
import type { VoiceService } from '../../../voice/voice.service';

describe('TripWishVoiceService', () => {
  const access = {
    assertTripMember: jest.fn().mockResolvedValue(undefined),
  } as unknown as TripWishAccessService;

  const structuring = {
    inferStructuredHints: jest.fn().mockReturnValue({ tags: ['aurora_viewing'] }),
  } as unknown as TripWishStructuringService;

  const wishService = {
    create: jest.fn().mockResolvedValue({ id: 'wish-1', text: '想住玻璃屋' }),
  } as unknown as TripWishService;

  const voiceService = {
    transcribe: jest.fn().mockResolvedValue({
      success: true,
      data: {
        transcript: '想住一晚玻璃屋看极光',
        language: 'zh-CN',
        confidence: 0.9,
      },
    }),
  } as unknown as VoiceService;

  let service: TripWishVoiceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TripWishVoiceService(access, structuring, wishService, voiceService);
  });

  it('transcribe returns draft with inferred category', async () => {
    const result = await service.transcribe('trip-1', 'user-1', Buffer.from('audio'));
    expect(result.transcript).toContain('玻璃屋');
    expect(result.suggestedDraft.category).toBe('accommodation');
    expect(result.voiceTranscriptId).toBeTruthy();
  });

  it('createFromConfirmed stores voice source ref', async () => {
    await service.createFromConfirmed('trip-1', 'user-1', {
      voiceTranscriptId: 'vt-1',
      text: '行程不要太赶',
    });
    expect(wishService.create).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      expect.objectContaining({
        inputMode: 'voice',
        sourceRef: { voiceTranscriptId: 'vt-1' },
        category: 'destination_route',
      }),
    );
  });

  it('throws when STT fails', async () => {
    (voiceService.transcribe as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: { message: 'provider down' },
    });
    await expect(
      service.transcribe('trip-1', 'user-1', Buffer.from('x')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
