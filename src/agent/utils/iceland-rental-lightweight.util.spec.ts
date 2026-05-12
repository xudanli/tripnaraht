import type { IcelandRentalGuidanceOutput } from '../../skills/world/iceland-rental-guidance.skill';
import { buildCarRentalGuidanceFootnotesZh, buildIcelandRentalGuidancePromptLines } from './iceland-rental-lightweight.util';

describe('iceland-rental-lightweight.util', () => {
  const minimal = (): IcelandRentalGuidanceOutput => ({
    intent_profile: 'default',
    risk_control: {
      road_is: { label: 'r', url: 'https://www.road.is/', notes_zh: 'n' },
      vedur: { label: 'v', url: 'https://en.vedur.is/', notes_zh: 'n' },
      safetravel: { label: 's', url: 'https://safetravel.is/', notes_zh: 'n' },
      vegagerdin_app_zh: 'app',
    },
    aggregation_portals: [],
    trusted_local_providers: [
      {
        id: 'blue',
        name: 'Blue',
        url: 'https://example.com',
        positioning_zh: 'p',
        insurance_notes_zh: ['i1'],
        f_road_notes_zh: ['f1'],
        trust_tags: ['trusted_default'],
      },
    ],
    insurance_checklist_zh: ['c1'],
    vehicle_policy_hints_zh: ['v1'],
    booking_mcp_complement_zh: 'b',
    suggested_pipeline: [],
    summary_zh: 'sum',
  });

  it('builds prompt lines and footnotes', () => {
    const g = minimal();
    expect(buildIcelandRentalGuidancePromptLines(g).length).toBeGreaterThan(2);
    expect(buildCarRentalGuidanceFootnotesZh(g).some((x) => x.includes('Blue'))).toBe(true);
  });
});
