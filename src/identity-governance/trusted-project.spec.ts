import { requiredPublishingLevel } from './constants/trusted-project.constants';

describe('trusted-project.constants', () => {
  it('maps commercial type to publishing level', () => {
    expect(requiredPublishingLevel('NON_COMMERCIAL')).toBe('PUBLIC_NON_COMMERCIAL');
    expect(requiredPublishingLevel('COMMERCIAL')).toBe('PUBLIC_COMMERCIAL');
  });
});
