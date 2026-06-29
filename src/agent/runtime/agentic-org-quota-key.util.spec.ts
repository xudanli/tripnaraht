import { resolveAgenticQuotaOrgId } from './agentic-org-quota-key.util';

describe('agentic-org-quota-key.util', () => {
  it('reads organization_id from options', () => {
    expect(
      resolveAgenticQuotaOrgId({
        request_id: 'r1',
        user_id: 'u1',
        message: 'hi',
        options: { organization_id: 'org-abc' },
      }),
    ).toBe('org-abc');
  });

  it('accepts org_id alias', () => {
    expect(
      resolveAgenticQuotaOrgId({
        request_id: 'r1',
        user_id: 'u1',
        message: 'hi',
        options: { org_id: 'org-alias' } as never,
      }),
    ).toBe('org-alias');
  });

  it('returns null when absent', () => {
    expect(
      resolveAgenticQuotaOrgId({ request_id: 'r1', user_id: 'u1', message: 'hi' }),
    ).toBeNull();
  });
});
