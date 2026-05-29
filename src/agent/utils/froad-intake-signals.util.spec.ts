import {
  buildDeterministicFroad2wdGuardianResults,
  buildFroadHighlandIntentSignals,
  isFroad2wdComplianceScenario,
} from './froad-intake-signals.util';
import type { GateResult, TripPlanRequest } from '../interfaces/trip-plan.interface';
import { extractVehicleTypeFromCurrentUserMessage } from './trip-plan-intake-vehicle.util';

const USER_MSG =
  '外头写着F208公路开了，我们打算6月18号租一辆普通的 2WD 丰田 Yaris，走 F208 北线横穿内陆高地去兰曼纳劳卡。';

describe('froad-intake-signals.util', () => {
  it('extracts 2WD from Yaris message', () => {
    expect(extractVehicleTypeFromCurrentUserMessage(USER_MSG)).toBe('2WD');
  });

  it('detects F-road 2WD compliance scenario', () => {
    expect(isFroad2wdComplianceScenario({ message: USER_MSG } as TripPlanRequest, USER_MSG)).toBe(true);
  });

  it('buildFroadHighlandIntentSignals captures F208 and melt season', () => {
    const s = buildFroadHighlandIntentSignals(USER_MSG);
    expect(s?.primary_froad).toBe('F208');
    expect(s?.f_road_highland_crossing).toBe(true);
    expect(s?.melt_season_risk_zh).toMatch(/6\s*月|融雪|涉水/);
  });

  it('deterministic guardian: Abu REJECT, Neptune REPLACE with 26→208 north', () => {
    const signals = buildFroadHighlandIntentSignals(USER_MSG)!;
    const gr = buildDeterministicFroad2wdGuardianResults(
      { gate_result: 'ADJUST_REQUIRED', violations: [], required_adjustments: [], confidence: 0.8 },
      signals,
      { message: USER_MSG } as TripPlanRequest,
    );
    expect(gr.abu?.verdict).toBe('REJECT');
    expect(gr.neptune?.verdict).toBe('REPLACE');
    expect(gr.neptune?.evidence?.join(' ')).toMatch(/26/);
    expect(gr.debate_summary_zh).not.toMatch(/Neptune REPLACE/i);
  });
});
