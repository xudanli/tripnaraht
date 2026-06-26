import { TrustedProjectListingService } from './services/trusted-project-listing.service';

describe('TrustedProjectListingService enrichListings', () => {
  const listingRow = {
    id: 'listing-1',
    publisherSubjectType: 'ORGANIZATION',
    publisherSubjectId: 'org-1',
    responsibleUserId: 'user-1',
    organizationId: 'org-1',
    slotsTotal: 8,
    slotsFilled: 2,
    title: 'Test',
  };

  function createService(overrides?: {
    organizations?: Array<{ id: string; displayName: string }>;
    users?: Array<{ id: string; displayName: string | null; email: string }>;
  }) {
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue(overrides?.organizations ?? []),
      },
      user: {
        findMany: jest.fn().mockResolvedValue(overrides?.users ?? []),
      },
    };

    const service = new TrustedProjectListingService(
      prisma as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, prisma };
  }

  it('enriches organization listing with display names and slotsRemaining', async () => {
    const { service } = createService({
      organizations: [{ id: 'org-1', displayName: '极境户外 · 冰岛专线' }],
      users: [{ id: 'user-1', displayName: '徐丹丽', email: 'leader@test.com' }],
    });

    const enriched = await (service as unknown as {
      enrichListings: (rows: typeof listingRow[]) => Promise<Array<Record<string, unknown>>>;
    }).enrichListings([listingRow]);

    expect(enriched[0]).toMatchObject({
      publisherSubjectType: 'ORGANIZATION',
      publisherSubjectId: 'org-1',
      publisherDisplayName: '极境户外 · 冰岛专线',
      responsibleUserDisplayName: '徐丹丽',
      slotsRemaining: 6,
    });
  });

  it('falls back to user email when displayName is missing', async () => {
    const userListing = {
      ...listingRow,
      publisherSubjectType: 'USER',
      publisherSubjectId: 'user-2',
      organizationId: null,
    };
    const { service } = createService({
      users: [{ id: 'user-2', displayName: null, email: 'zhangsan@test.com' }],
    });

    const enriched = await (service as unknown as {
      enrichListings: (rows: typeof userListing[]) => Promise<Array<Record<string, unknown>>>;
    }).enrichListings([userListing]);

    expect(enriched[0].publisherDisplayName).toBe('zhangsan@test.com');
    expect(enriched[0].publisherSubjectType).toBe('USER');
  });
});
