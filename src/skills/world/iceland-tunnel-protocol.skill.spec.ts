import { Test } from '@nestjs/testing';
import { IcelandTunnelProtocolSkill } from './iceland-tunnel-protocol.skill';

describe('IcelandTunnelProtocolSkill', () => {
  it('returns triggered protocol for Westfjords mesh segments', async () => {
    const m = await Test.createTestingModule({ providers: [IcelandTunnelProtocolSkill] }).compile();
    const skill = m.get(IcelandTunnelProtocolSkill);
    const out = await skill.execute({
      request_id: 't1',
      segments: [{ from_region: 'isafjordur', to_region: 'patreksfjordur' }],
    });
    expect(out.triggered).toBe(true);
    expect(out.recommendedAdjustments).toContain('REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL');
    expect(out.affectedSegments).toEqual(['isafjordur-patreksfjordur']);
  });
});
