import type { Itinerary } from '../interfaces/trip-plan.interface';
import icelandV1 from '../../assets/strategy/iceland-v1.json';
import { listMatchedIcelandDrivingStrategyIds } from './iceland-strategy-eval.util';
import type { IcelandStrategyDocumentV1 } from './world-strategy.types';

describe('iceland-strategy-eval.util', () => {
  const doc = icelandV1 as IcelandStrategyDocumentV1;

  it('matches STRAT_ICE_001 and STRAT_ICE_002 for December F-road + 2WD', () => {
    const itinerary = {
      days: [{ date: '2026-12-10', items: [{ type: 'TRANSPORT', notes: 'F208' }] }],
    } as unknown as Itinerary;
    const ids = listMatchedIcelandDrivingStrategyIds(doc, {
      itinerary,
      fRoad: true,
      drive: 'likely_2wd_only',
      icelandContext: true,
    });
    expect(ids).toContain('STRAT_ICE_001');
    expect(ids).toContain('STRAT_ICE_002');
  });

  it('July F-road + 2WD: STRAT_ICE_002 only, not STRAT_ICE_001 (winter window condition)', () => {
    const itinerary = {
      days: [{ date: '2026-07-15', items: [{ type: 'TRANSPORT', notes: 'F208' }] }],
    } as unknown as Itinerary;
    const ids = listMatchedIcelandDrivingStrategyIds(doc, {
      itinerary,
      fRoad: true,
      drive: 'likely_2wd_only',
      icelandContext: true,
    });
    expect(ids).toContain('STRAT_ICE_002');
    expect(ids).not.toContain('STRAT_ICE_001');
  });

  it('returns empty when not Iceland context', () => {
    const itinerary = { days: [{ date: '2026-12-10', items: [] }] } as unknown as Itinerary;
    expect(
      listMatchedIcelandDrivingStrategyIds(doc, {
        itinerary,
        fRoad: true,
        drive: 'likely_2wd_only',
        icelandContext: false,
      }),
    ).toEqual([]);
  });
});
