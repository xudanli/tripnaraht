import {
  normalizeEntryRequirements,
  resolveEntryRequirementForNationality,
} from './entry-requirements.util';

describe('entry-requirements.util', () => {
  it('migrates legacy visaForCN into byNationality.CN', () => {
    const er = normalizeEntryRequirements(undefined, {
      status: 'VISA_REQUIRED',
      statusCN: '需要签证',
    });
    expect(er?.byNationality.CN?.status).toBe('VISA_REQUIRED');
  });

  it('resolves by traveler nationality', () => {
    const er = normalizeEntryRequirements({
      byNationality: {
        US: { status: 'VISA_FREE' },
        CN: { status: 'VISA_REQUIRED' },
      },
    });
    expect(resolveEntryRequirementForNationality(er, 'us')?.status).toBe('VISA_FREE');
    expect(resolveEntryRequirementForNationality(er, 'CN')?.status).toBe('VISA_REQUIRED');
  });
});
