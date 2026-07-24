import { MobilePlanningService } from './mobile-planning.service';

describe('MobilePlanningService.getTeamStatus', () => {
  function makeService(overrides?: {
    collaborators?: Array<{
      id: string;
      userId: string;
      role: string;
      updatedAt: Date;
    }>;
    pendingInvites?: Array<{
      id: string;
      inviteCode: string;
      label: string;
      roleSlot: string;
      createdAt: Date;
    }>;
    profiling?: Array<{
      userId: string;
      travelStyleCompleted: boolean;
      moneyDnaCompleted: boolean;
      quizCompleted: boolean;
      updatedAt: Date;
    }>;
    metadata?: Record<string, unknown>;
  }) {
    const access = {
      assertTripMember: jest.fn(async () => ({})),
    };
    const prisma = {
      tripCollaborator: {
        findMany: jest.fn(async () => overrides?.collaborators ?? []),
      },
      tripMemberInvite: {
        findMany: jest.fn(async () => overrides?.pendingInvites ?? []),
      },
      tripDecisionProfilingStatus: {
        findMany: jest.fn(async () => overrides?.profiling ?? []),
      },
      trip: {
        findUnique: jest.fn(async () => ({
          metadata: overrides?.metadata ?? {},
        })),
      },
      user: {
        findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          (where.id.in ?? []).map((id) => ({
            id,
            displayName: id === 'u-leader' ? '队长' : `用户${id}`,
            email: `${id}@example.com`,
            avatarUrl: null,
          })),
        ),
      },
      userTravelStyleCard: {
        findMany: jest.fn(async () => []),
      },
    };

    const orchestrator = {
      mutateWithMode: jest.fn(),
      createProposal: jest.fn(),
    };
    const snapshotAssembler = {
      assemble: jest.fn(async () => null),
    };
    const contextNotifier = {
      notifyTripContextChanged: jest.fn(),
    };
    const contextualCommit = { commit: jest.fn() };
    const arrangeItems = { createItem: jest.fn() };
    const service = new MobilePlanningService(
      prisma as never,
      access as never,
      orchestrator as never,
      arrangeItems as never,
      snapshotAssembler as never,
      contextNotifier as never,
      contextualCommit as never,
    );
    return { service, prisma, access, orchestrator, contextNotifier, snapshotAssembler };
  }

  it('returns the current member with progress/style for profiling completion', async () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const { service, access } = makeService({
      collaborators: [
        { id: 'collab-1', userId: 'u-leader', role: 'OWNER', updatedAt: now },
      ],
      profiling: [
        {
          userId: 'u-leader',
          travelStyleCompleted: true,
          moneyDnaCompleted: true,
          quizCompleted: true,
          updatedAt: now,
        },
      ],
    });

    const result = await service.getTeamStatus('trip-1', 'u-leader');

    expect(access.assertTripMember).toHaveBeenCalledWith('trip-1', 'u-leader');
    expect(result.memberCount).toBe(1);
    expect(result.invitePendingCount).toBe(0);
    expect(result.members[0]).toMatchObject({
      id: 'collab-1',
      name: '队长',
      role: 'leader',
      progress: 1,
      style: 'complete',
      statusLabel: '偏好完成',
      isPlaceholder: false,
    });
  });

  it('includes pending invite placeholders and invitePendingCount', async () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const { service } = makeService({
      collaborators: [
        { id: 'collab-1', userId: 'u-leader', role: 'OWNER', updatedAt: now },
      ],
      pendingInvites: [
        {
          id: 'inv-1',
          inviteCode: 'ABC',
          label: '驾驶员',
          roleSlot: 'driver',
          createdAt: now,
        },
      ],
      profiling: [
        {
          userId: 'u-leader',
          travelStyleCompleted: false,
          moneyDnaCompleted: false,
          quizCompleted: false,
          updatedAt: now,
        },
      ],
    });

    const result = await service.getTeamStatus('trip-1', 'u-leader');

    expect(result.invitePendingCount).toBe(1);
    expect(result.memberCount).toBe(2);
    expect(result.members.some((m) => m.isPlaceholder && m.style === 'invite')).toBe(
      true,
    );
    expect(result.members.find((m) => m.isPlaceholder)?.statusLabel).toBe(
      '邀请后可加入协作',
    );
  });

  it('marks hard-limits gaps as attention with pendingConfirmations', async () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const { service } = makeService({
      collaborators: [
        { id: 'collab-2', userId: 'u-2', role: 'MEMBER', updatedAt: now },
      ],
      profiling: [
        {
          userId: 'u-2',
          travelStyleCompleted: true,
          moneyDnaCompleted: false,
          quizCompleted: false,
          updatedAt: now,
        },
      ],
      metadata: {
        memberOnboardingProfiles: {
          'u-2': {
            completedAt: '2026-07-14T00:00:00.000Z',
            coreWishes: ['轻徒步', '摄影'],
          },
        },
      },
    });

    const result = await service.getTeamStatus('trip-1', 'u-2');
    const member = result.members[0];

    expect(member.style).toBe('attention');
    expect(member.statusLabel).toBe('体力需求未确认');
    expect(member.progress).toBe(0.4);
    expect(member.focusAreas).toEqual(['轻徒步', '摄影']);
    expect(member.pendingConfirmations).toEqual(
      expect.arrayContaining(['体力偏好', '决策画像']),
    );
  });
});

describe('MobilePlanningService.getRouteBlueprint', () => {
  it('returns day structure with pace labels from Active Plan', async () => {
    const access = { assertTripMember: jest.fn(async () => ({})) };
    const tripRow = {
      id: 'trip-1',
      name: '冰岛环岛旅行',
      destination: '冰岛环岛',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-03'),
      metadata: {
        dayThemes: { 1: '瀑布与黑沙滩' },
        dayLabels: { 1: '南岸' },
        spatialPlanVersion: 4,
      },
      updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      TripDay: [
        {
          id: 'day-uuid-1',
          date: new Date('2026-08-01'),
          ItineraryItem: [
            {
              id: 'item-1',
              placeId: 1,
              type: 'ACTIVITY',
              order: 1,
              startTime: null,
              note: null,
              costCategory: null,
              bookingStatus: null,
              Place: {
                id: 1,
                nameCN: '塞里雅兰瀑布',
                nameEN: 'Seljalandsfoss',
                category: 'ATTRACTION',
                metadata: { lat: 63.6156, lng: -19.9885 },
                City: { name: 'South', nameCN: '南岸', nameEN: 'South Coast' },
              },
            },
            {
              id: 'item-2',
              placeId: 2,
              type: 'REST',
              order: 2,
              startTime: null,
              note: null,
              costCategory: 'ACCOMMODATION',
              bookingStatus: 'CONFIRMED',
              Place: {
                id: 2,
                nameCN: '维克酒店',
                nameEN: 'Hotel Vik',
                category: 'HOTEL',
                metadata: {},
                City: { name: 'Vik', nameCN: '维克', nameEN: 'Vik' },
              },
            },
          ],
        },
      ],
    };

    const prisma = {
      trip: {
        findUnique: jest.fn(async () => tripRow),
      },
      place: {
        findMany: jest.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
          (where.id.in ?? []).map((id) => ({
            id,
            nameCN: id === 1 ? '塞里雅兰瀑布' : '维克酒店',
            nameEN: null,
            metadata: id === 1 ? { lat: 63.6156, lng: -19.9885 } : {},
          })),
        ),
      },
      $queryRaw: jest.fn(async () => []),
    };
    const orchestrator = { mutateWithMode: jest.fn(), createProposal: jest.fn() };
    const snapshotAssembler = {
      assemble: jest.fn(async () => ({
        bindings: { constraintsVersion: 5 },
        effectivePlan: { versionId: 'plan-v5' },
      })),
    };
    const contextNotifier = { notifyTripContextChanged: jest.fn() };

    const service = new MobilePlanningService(
      prisma as never,
      access as never,
      orchestrator as never,
      { createItem: jest.fn() } as never,
      snapshotAssembler as never,
      contextNotifier as never,
      { commit: jest.fn() } as never,
    );

    const result = await service.getRouteBlueprint('trip-1', 'u-1');

    expect(access.assertTripMember).toHaveBeenCalledWith('trip-1', 'u-1');
    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({
      id: 'day-uuid-1',
      dayNumber: 1,
      label: '南岸',
      theme: '瀑布与黑沙滩',
      coreAttractions: ['塞里雅兰瀑布'],
      accommodationCity: '维克',
      confirmationStatus: 'CONFIRMED',
    });
    expect(result.pace?.totalDrivingLabel).toBeTruthy();
    expect(result.pace?.accommodationChangeLabel).toMatch(/次/);
    expect(result.planVersion).toBeGreaterThanOrEqual(4);
  });
});

describe('MobilePlanningService.updateDayTheme', () => {
  function makeWriteService() {
    const tripRow = {
      id: 'trip-1',
      metadata: { dayThemes: { '1': '旧主题' }, spatialPlanVersion: 2 } as Record<string, unknown>,
      updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    };
    const access = { assertTripMember: jest.fn(async () => ({})) };
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => tripRow),
        update: jest.fn(async ({ data }: { data: { metadata?: object; updatedAt?: Date } }) => {
          if (data.metadata) {
            tripRow.metadata = data.metadata as Record<string, unknown>;
          }
          if (data.updatedAt) tripRow.updatedAt = data.updatedAt;
          return { updatedAt: tripRow.updatedAt, metadata: tripRow.metadata };
        }),
      },
      tripDay: {
        count: jest.fn(async () => 3),
      },
    };
    const snapshotAssembler = {
      assemble: jest.fn(async () => ({
        bindings: { constraintsVersion: 1 },
        effectivePlan: { versionId: 'p1' },
      })),
    };
    const contextNotifier = { notifyTripContextChanged: jest.fn() };
    const service = new MobilePlanningService(
      prisma as never,
      access as never,
      { mutateWithMode: jest.fn(), createProposal: jest.fn() } as never,
      { createItem: jest.fn() } as never,
      snapshotAssembler as never,
      contextNotifier as never,
      { commit: jest.fn() } as never,
    );
    return { service, prisma, tripRow, contextNotifier, access };
  }

  it('writes theme to metadata.dayThemes and bumps versions', async () => {
    const { service, tripRow, contextNotifier } = makeWriteService();
    const before = await service['resolvePlanVersions']('trip-1');

    const result = await service.updateDayTheme(
      'trip-1',
      'u-1',
      1,
      { theme: '瀑布与黑沙滩', label: '南岸' },
      { ifMatch: before.contextVersion, idempotencyKey: 'idem-theme-1' },
    );

    expect(result.dayIndex).toBe(1);
    expect(result.theme).toBe('瀑布与黑沙滩');
    expect(result.label).toBe('南岸');
    expect((tripRow.metadata as any).dayThemes['1']).toBe('瀑布与黑沙滩');
    expect((tripRow.metadata as any).dayLabels['1']).toBe('南岸');
    expect(contextNotifier.notifyTripContextChanged).toHaveBeenCalledWith(
      expect.objectContaining({ changedSections: ['plan'] }),
    );
  });

  it('rejects empty theme string and too-long theme', async () => {
    const { service } = makeWriteService();
    const before = await service['resolvePlanVersions']('trip-1');

    await expect(
      service.updateDayTheme(
        'trip-1',
        'u-1',
        1,
        { theme: '   ' },
        { ifMatch: before.contextVersion, idempotencyKey: 'e1' },
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VALIDATION_ERROR' }) });

    await expect(
      service.updateDayTheme(
        'trip-1',
        'u-1',
        1,
        { theme: 'x'.repeat(41) },
        { ifMatch: before.contextVersion, idempotencyKey: 'e2' },
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'THEME_TOO_LONG' }) });
  });

  it('returns DAY_NOT_FOUND for out-of-range dayIndex', async () => {
    const { service } = makeWriteService();
    const before = await service['resolvePlanVersions']('trip-1');

    await expect(
      service.updateDayTheme(
        'trip-1',
        'u-1',
        9,
        { theme: '远日' },
        { ifMatch: before.contextVersion, idempotencyKey: 'e3' },
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'DAY_NOT_FOUND' }) });
  });

  it('idempotent replay returns same result without double bump', async () => {
    const { service, prisma } = makeWriteService();
    const before = await service['resolvePlanVersions']('trip-1');
    const opts = { ifMatch: before.contextVersion, idempotencyKey: 'idem-replay' };

    const a = await service.updateDayTheme('trip-1', 'u-1', 2, { theme: '黄金圈' }, opts);
    const updateCalls = prisma.trip.update.mock.calls.length;
    const b = await service.updateDayTheme('trip-1', 'u-1', 2, { theme: '黄金圈' }, opts);

    expect(b).toEqual(a);
    expect(prisma.trip.update.mock.calls.length).toBe(updateCalls);
  });

  it('batch update is atomic for multiple days', async () => {
    const { service, tripRow } = makeWriteService();
    const before = await service['resolvePlanVersions']('trip-1');

    const result = await service.updateDayThemesBatch(
      'trip-1',
      'u-1',
      {
        days: [
          { dayIndex: 1, theme: '抵达雷克雅未克' },
          { dayIndex: 2, theme: null },
          { dayIndex: 3, theme: '南岸瀑布', label: '南岸' },
        ],
        source: 'ai',
      },
      { ifMatch: before.contextVersion, idempotencyKey: 'batch-1' },
    );

    expect(result.days).toEqual([
      { dayIndex: 1, theme: '抵达雷克雅未克', label: null },
      { dayIndex: 2, theme: null, label: null },
      { dayIndex: 3, theme: '南岸瀑布', label: '南岸' },
    ]);
    expect((tripRow.metadata as any).dayThemes['1']).toBe('抵达雷克雅未克');
    expect((tripRow.metadata as any).dayThemes['2']).toBeUndefined();
    expect((tripRow.metadata as any).dayThemeSources['3']).toBe('ai');
  });
});
