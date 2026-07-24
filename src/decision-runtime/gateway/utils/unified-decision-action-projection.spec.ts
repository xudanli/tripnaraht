import {
  buildActionabilityWithWriteChain,
  partitionActionsForProductView,
  projectDecisionOptionToAction,
} from './unified-decision-action-projection.util';

describe('unified-decision-action-projection.util', () => {
  it('maps NEPTUNE source to ALTERNATIVE_GENERATOR', () => {
    const action = projectDecisionOptionToAction(
      {
        id: 'cand_a',
        problemId: 'p1',
        type: 'REPAIR',
        title: '绕行',
        description: 'F208 替代路线',
        source: 'NEPTUNE',
        resolves: [],
        tradeoffs: [],
        executable: true,
        requiresConfirmation: true,
      },
      { tripId: 't1', problemId: 'p1', enforcement: 'BLOCK', authority: 'CANONICAL' },
    );
    expect(action.source).toBe('ALTERNATIVE_GENERATOR');
    expect(action.allowed).toBe(true);
    expect(action.navigationTarget?.command).toBe('OPEN_DECISION_SPACE');
  });

  it('blocks ACCEPT_RISK on BLOCK enforcement', () => {
    const action = projectDecisionOptionToAction(
      {
        id: 'ack',
        problemId: 'p1',
        type: 'ACCEPT_RISK',
        title: '接受风险',
        description: '',
        source: 'RULE_ENGINE',
        resolves: [],
        tradeoffs: [],
        executable: true,
        requiresConfirmation: true,
      },
      { tripId: 't1', problemId: 'p1', enforcement: 'BLOCK', authority: 'LEGACY' },
    );
    expect(action.allowed).toBe(false);
    expect(action.blockedReason).toContain('BLOCK');
  });

  it('exposes writeChain for product routing', () => {
    expect(buildActionabilityWithWriteChain({
      enforcement: 'BLOCK',
      requiresAction: true,
      allowedActions: ['REPAIR'],
      authority: 'CANONICAL',
    }).writeChain).toBe('EVALUATE_AUTHORIZE_EXECUTE');

    expect(buildActionabilityWithWriteChain({
      enforcement: 'REQUIRE_ADJUSTMENT',
      requiresAction: true,
      allowedActions: ['REPAIR'],
      authority: 'LEGACY',
    }).writeChain).toBe('APPLY_AND_POLL');
  });

  it('partitions disallowed actions out of default product view', () => {
    const allowed = projectDecisionOptionToAction(
      {
        id: 'planb_0',
        problemId: 'p1',
        type: 'PLAN_B',
        title: '立即预订',
        description: '前往官方预订：https://www.bluelagoon.com/day-visit/the-blue-lagoon',
        source: 'RULE_ENGINE',
        resolves: [],
        tradeoffs: [],
        executable: true,
        requiresConfirmation: true,
        repairCommand: {
          commandType: 'REPLACE_POI',
          targetRefs: [],
          parameters: {
            externalUrl: 'https://www.bluelagoon.com/day-visit/the-blue-lagoon',
          },
          sourceOptionId: 'planb_0',
          expectedTripVersion: '1',
        },
      },
      { tripId: 't1', problemId: 'p1', enforcement: 'BLOCK', authority: 'LEGACY' },
    );
    const blocked = projectDecisionOptionToAction(
      {
        id: 'book_parking',
        problemId: 'p1',
        type: 'REPAIR',
        title: '前往官方预订',
        description: '打开官方预订页面',
        source: 'CONSTRAINT_REPAIR',
        resolves: [],
        tradeoffs: [],
        executable: false,
        requiresConfirmation: true,
      },
      { tripId: 't1', problemId: 'p1', enforcement: 'BLOCK', authority: 'LEGACY' },
    );

    const defaultView = partitionActionsForProductView([allowed, blocked], false);
    expect(defaultView.actions).toHaveLength(1);
    expect(defaultView.actions[0].actionId).toBe('planb_0');
    expect(defaultView.suppressedActions).toBeUndefined();

    const debugView = partitionActionsForProductView([allowed, blocked], true);
    expect(debugView.actions).toHaveLength(1);
    expect(debugView.suppressedActions).toHaveLength(1);
    expect(debugView.suppressedActions?.[0].source).toBe('CONSTRAINT_SOLVER');
  });

  it('adds externalUrl to navigationTarget for BOOK_NOW plan B', () => {
    const action = projectDecisionOptionToAction(
      {
        id: 'planb_0_issue',
        problemId: 'p1',
        type: 'PLAN_B',
        title: '立即预订',
        description: '前往官方预订：https://www.bluelagoon.com/day-visit/the-blue-lagoon',
        source: 'RULE_ENGINE',
        resolves: [],
        tradeoffs: [],
        executable: true,
        requiresConfirmation: true,
        repairCommand: {
          commandType: 'REPLACE_POI',
          targetRefs: [],
          parameters: {
            externalUrl: 'https://www.bluelagoon.com/day-visit/the-blue-lagoon',
          },
          sourceOptionId: 'planb_0_issue',
          expectedTripVersion: '1',
        },
      },
      { tripId: 't1', problemId: 'p1', enforcement: 'BLOCK', authority: 'LEGACY' },
    );
    expect(action.navigationTarget?.params.externalUrl).toBe(
      'https://www.bluelagoon.com/day-visit/the-blue-lagoon',
    );
  });
});
