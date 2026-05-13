import { Test } from '@nestjs/testing';
import { MemoryKernelService } from './memory-kernel.service';
import {
  MEMORY_COGNITIVE_SLICE_PROVIDER,
  type IMemoryCognitiveSliceProvider,
} from './memory-cognitive-slice.provider';
import { MEMORY_KERNEL_LOAD_BUDGET_MS } from './memory-replay.constants';

describe('MemoryKernelService', () => {
  it('loadProfileForSubject：provider 挂起时超时返回 null', async () => {
    jest.useFakeTimers();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MemoryKernelService,
        {
          provide: MEMORY_COGNITIVE_SLICE_PROVIDER,
          useValue: {
            loadRecentNarrateSlices: () => new Promise<never>(() => {}),
          } satisfies IMemoryCognitiveSliceProvider,
        },
      ],
    }).compile();

    const kernel = moduleRef.get(MemoryKernelService);
    const pending = kernel.loadProfileForSubject('sub-timeout');
    jest.advanceTimersByTime(MEMORY_KERNEL_LOAD_BUDGET_MS + 20);
    await Promise.resolve();
    await expect(pending).resolves.toBeNull();
    jest.useRealTimers();
  });

  it('loadProfileForSubject：NARRATE 切片可聚合为 profile', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MemoryKernelService,
        {
          provide: MEMORY_COGNITIVE_SLICE_PROVIDER,
          useValue: {
            loadRecentNarrateSlices: async () => [
              {
                step: 'NARRATE',
                timestamp: '2026-01-01T00:00:00.000Z',
                metadata: { ebp_stance: 'COMPLIANCE_FIRST' },
              },
            ],
          } satisfies IMemoryCognitiveSliceProvider,
        },
      ],
    }).compile();

    const kernel = moduleRef.get(MemoryKernelService);
    const profile = await kernel.loadProfileForSubject('sub-ok');
    expect(profile).not.toBeNull();
    expect(profile!.subject_ref).toBe('sub-ok');
    expect(profile!.evidence_weight).toBeGreaterThan(0);
  });

  it('loadProfileForSubject：空 subject 返回 null', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MemoryKernelService],
    }).compile();
    const kernel = moduleRef.get(MemoryKernelService);
    await expect(kernel.loadProfileForSubject('   ')).resolves.toBeNull();
  });
});
