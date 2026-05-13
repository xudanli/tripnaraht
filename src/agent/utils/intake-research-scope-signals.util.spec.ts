import {
  extractNluResearchInvalidateScopes,
  expandResearchInvalidateScopesWithHeuristics,
  mapModificationTargetsToScopes,
  NLU_MODIFICATION_TARGET_TO_SCOPE,
} from './intake-research-scope-signals.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

function req(partial: Partial<RouteAndRunRequestDto>): RouteAndRunRequestDto {
  return {
    request_id: 'r1',
    user_id: 'u1',
    message: 'm',
    ...partial,
  } as RouteAndRunRequestDto;
}

describe('intake-research-scope-signals.util', () => {
  it('mapModificationTargetsToScopes maps party-like tags to hotel (expand adds linkage)', () => {
    expect(mapModificationTargetsToScopes(['party', 'headcount'])).toEqual(['hotel']);
  });

  it('registry covers Tripnara NLU contract tags', () => {
    expect(NLU_MODIFICATION_TARGET_TO_SCOPE.hotel).toBe('hotel');
    expect(NLU_MODIFICATION_TARGET_TO_SCOPE.air_ticket).toBe('flight');
    expect(NLU_MODIFICATION_TARGET_TO_SCOPE.car_rental).toBe('transport');
    expect(NLU_MODIFICATION_TARGET_TO_SCOPE.restaurant).toBe('destination');
  });

  it('mapModificationTargetsToScopes uses registry deterministically', () => {
    expect(mapModificationTargetsToScopes(['accommodation', 'airline', 'entry_requirement'])).toEqual([
      'hotel',
      'flight',
      'compliance',
    ]);
  });

  it('time_range triggers full research scope set', () => {
    expect(mapModificationTargetsToScopes(['hotel', 'time_range'])).toEqual([
      'hotel',
      'flight',
      'destination',
      'transport',
      'compliance',
    ]);
  });

  it('extractNluResearchInvalidateScopes is gated by is_replan', () => {
    expect(
      extractNluResearchInvalidateScopes(
        req({
          options: {
            intent_flags: { modification_targets: ['hotel'] },
          } as any,
        }),
      ),
    ).toEqual([]);
    expect(
      extractNluResearchInvalidateScopes(
        req({
          options: {
            itinerary_context: { is_replan: true },
            intent_flags: { modification_targets: ['hotel', 'flight'] },
          } as any,
        }),
      ),
    ).toEqual(['hotel', 'flight']);
  });

  it('expandResearchInvalidateScopesWithHeuristics links hotel + private transfer message to transport', () => {
    const r = req({
      message: '换酒店，原来订了专车接送',
      options: {
        itinerary_context: { is_replan: true },
        intent_flags: { modification_targets: ['hotel'] },
      } as any,
    });
    expect(extractNluResearchInvalidateScopes(r)).toEqual(['hotel', 'transport']);
  });

  it('REMOVAL + destination-class targets expands to all research scopes', () => {
    const r = req({
      options: {
        refinement_signal: { type: 'REMOVAL' },
        intent_flags: { modification_targets: ['poi'] },
      } as any,
    });
    expect(extractNluResearchInvalidateScopes(r)).toEqual([
      'destination',
      'hotel',
      'flight',
      'transport',
      'compliance',
    ]);
  });

  it('expandResearchInvalidateScopesWithHeuristics links party NLU targets to hotel+flight+transport+compliance', () => {
    const r = req({
      message: '',
      options: {
        intent_flags: { modification_targets: ['party'] },
      } as any,
    });
    expect(expandResearchInvalidateScopesWithHeuristics(r, ['hotel'])).toEqual([
      'hotel',
      'flight',
      'transport',
      'compliance',
    ]);
  });

  it('expandResearchInvalidateScopesWithHeuristics links hotel + party-change message to multi-domain', () => {
    expect(
      expandResearchInvalidateScopesWithHeuristics(req({ message: '酒店不变，改成4个人' } as any), ['hotel']),
    ).toEqual(['hotel', 'flight', 'transport', 'compliance']);
  });

  it('extractNluResearchInvalidateScopes applies party expansion for NLU party tag', () => {
    const r = req({
      message: '',
      options: {
        itinerary_context: { is_replan: true },
        intent_flags: { modification_targets: ['party'] },
      } as any,
    });
    expect(extractNluResearchInvalidateScopes(r)).toEqual(['hotel', 'flight', 'transport', 'compliance']);
  });

  it('expandResearchInvalidateScopesWithHeuristics is idempotent on dedupe', () => {
    expect(expandResearchInvalidateScopesWithHeuristics(req({ message: '' } as any), ['hotel', 'hotel'])).toEqual([
      'hotel',
    ]);
  });
});
