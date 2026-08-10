import {
  collectLiveEvidenceFromSensorBlocks,
  liveEvidenceImpliesHardBlock,
} from './collect-live-sensor-evidence.util';

describe('collect-live-sensor-evidence', () => {
  it('maps weather/road blocks to LIVE evidence and detects hard block', () => {
    const ev = collectLiveEvidenceFromSensorBlocks({
      weatherRiskZh: '阵风偏大',
      roadAlertZh: '路段封闭不可通行',
    });
    expect(ev.some((e) => e.key === 'weather' && e.freshness === 'LIVE')).toBe(true);
    expect(liveEvidenceImpliesHardBlock(ev)).toBe(true);
  });
});
