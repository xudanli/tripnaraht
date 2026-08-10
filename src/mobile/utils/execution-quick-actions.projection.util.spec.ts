import {
  buildSourceLabelZh,
  canTransitionLifecycle,
  filterAllowedTransitionsForViewer,
  isOpenLifecycle,
  projectMemberSuggestion,
  resolveQuickActionsScene,
  resolveReportPriority,
  tripActionsForScene,
} from './execution-quick-actions.projection.util';

describe('execution-quick-actions.projection.util', () => {
  it('keeps NEED_TOILET and NEED_REST as different place categories', () => {
    const toilet = projectMemberSuggestion({
      needCode: 'NEED_TOILET',
      priority: 'NORMAL',
      resolvedPlace: {
        placeId: 'poi-toilet-1',
        placeNameZh: '南岸服务区厕所',
        kind: 'toilet',
      },
    });
    const rest = projectMemberSuggestion({
      needCode: 'NEED_REST',
      priority: 'NORMAL',
      resolvedPlace: {
        placeId: 'poi-park-1',
        placeNameZh: '观景停车带',
        kind: 'safe_parking',
      },
    });
    expect(toilet.placeCategoryHint).toBe('toilet');
    expect(rest.placeCategoryHint).toBe('safe_parking');
    expect(toilet.placeId).not.toBe(rest.placeId);
    expect(toilet.placeNameZh).toBe('南岸服务区厕所');
    expect(rest.placeNameZh).toBe('观景停车带');
    expect(toilet.affectsHardWindow).toBe(false);
    expect(rest.affectsHardWindow).toBe(false);
  });

  it('upgrades driver NEED_REST to SAFETY_HIGH with change-driver CTA', () => {
    expect(
      resolveReportPriority({ needCode: 'NEED_REST', isSubjectDriver: true }),
    ).toBe('SAFETY_HIGH');
    const suggestion = projectMemberSuggestion({
      needCode: 'NEED_REST',
      priority: 'SAFETY_HIGH',
    });
    expect(suggestion.secondaryAction?.type).toBe('CHANGE_DRIVER');
  });

  it('builds distinct self vs proxy source labels', () => {
    expect(
      buildSourceLabelZh({
        source: 'SELF',
        subjectName: '阿音',
        reporterName: '阿音',
        needLabelZh: '需要休息',
      }),
    ).toBe('阿音报告：需要休息');
    expect(
      buildSourceLabelZh({
        source: 'PROXY',
        subjectName: '阿音',
        reporterName: 'Danny',
        needLabelZh: '需要休息',
      }),
    ).toBe('Danny 为阿音记录：需要休息');
  });

  it('enforces lifecycle edges and open-only home visibility', () => {
    expect(canTransitionLifecycle('REPORTED', 'TEAM_AWARE')).toBe(true);
    expect(canTransitionLifecycle('REPORTED', 'RESOLVED')).toBe(false);
    expect(canTransitionLifecycle('ARRANGED', 'RESOLVED')).toBe(true);
    expect(canTransitionLifecycle('RESOLVED', 'CANCELLED')).toBe(false);
    expect(isOpenLifecycle('REPORTED')).toBe(true);
    expect(isOpenLifecycle('RESOLVED')).toBe(false);
  });

  it('limits transitions by viewer role', () => {
    const memberOnly = filterAllowedTransitionsForViewer({
      from: 'REPORTED',
      viewerUserId: 'm1',
      subjectMemberId: 'm1',
      canManageTrip: false,
    });
    expect(memberOnly).toEqual(['CANCELLED']);

    const leader = filterAllowedTransitionsForViewer({
      from: 'REPORTED',
      viewerUserId: 'leader',
      subjectMemberId: 'm1',
      canManageTrip: true,
    });
    expect(leader).toEqual(expect.arrayContaining(['TEAM_AWARE', 'CANCELLED']));
  });

  it('filters trip actions by scene and role', () => {
    expect(tripActionsForScene('DRIVING', false)).toEqual([]);
    const driving = tripActionsForScene('DRIVING', true);
    expect(driving).toEqual(expect.arrayContaining(['ROAD_MISMATCH', 'CHANGE_DRIVER']));
    const delay = tripActionsForScene('DELAY_RISK', true);
    expect(delay).toEqual(expect.arrayContaining(['VIEW_ADJUST_PLAN']));
  });

  it('resolves scene with delay risk priority', () => {
    expect(resolveQuickActionsScene({ hasDelayRisk: true, atPoi: true })).toBe(
      'DELAY_RISK',
    );
    expect(resolveQuickActionsScene({ atPoi: true })).toBe('AT_POI');
    expect(resolveQuickActionsScene({})).toBe('DRIVING');
  });
});
