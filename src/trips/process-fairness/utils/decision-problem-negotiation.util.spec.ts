import {
  isDecisionProblemNegotiationEligible,
  isDecisionProblemNegotiationOpen,
  resolveNegotiationDecisionNode,
  resolveNegotiationWishDomain,
  type DecisionProblemNegotiationContext,
} from './decision-problem-negotiation.util';

const baseCtx = (
  overrides: Partial<DecisionProblemNegotiationContext> = {},
): DecisionProblemNegotiationContext => ({
  problemId: 'prob-1',
  tripId: 'trip-1',
  title: '团队偏好冲突',
  description: '成员对活动安排有分歧',
  type: 'INFEASIBILITY',
  status: 'OPEN',
  ...overrides,
});

describe('decision-problem-negotiation.util', () => {
  it('treats RESOLVED/DISMISSED as closed', () => {
    expect(isDecisionProblemNegotiationOpen('RESOLVED')).toBe(false);
    expect(isDecisionProblemNegotiationOpen('OPEN')).toBe(true);
  });

  it('marks PREFERENCE_CONFLICT as negotiation eligible', () => {
    expect(
      isDecisionProblemNegotiationEligible(
        baseCtx({ type: 'PREFERENCE_CONFLICT' }),
      ),
    ).toBe(true);
  });

  it('marks MULTI_PARTY_APPROVAL authority as eligible', () => {
    expect(
      isDecisionProblemNegotiationEligible(
        baseCtx({
          authority: {
            decisionDomain: 'TEAM_PREFERENCE',
            proposer: 'SYSTEM',
            requiredApprover: 'AFFECTED_MEMBERS',
            executionMode: 'MULTI_PARTY_APPROVAL',
            overridable: true,
          },
        }),
      ),
    ).toBe(true);
  });

  it('marks operational ACCESS infeasibility as not negotiation eligible', () => {
    expect(
      isDecisionProblemNegotiationEligible(
        baseCtx({
          title: '第1天 · 蓝湖温泉：需要预约',
          description: '入场需要预约',
          type: 'INFEASIBILITY',
          assertions: [
            {
              id: 'a1',
              sourceSystem: 'FEASIBILITY',
              sourceRefId: 'poi-access:item-1',
              nature: 'HARD_CONSTRAINT',
              domain: 'ACCESS',
              enforcement: 'BLOCK',
              overridable: false,
              condition: '',
              conclusion: '',
              proofs: [],
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('maps route problems to destination_route domain', () => {
    const ctx = baseCtx({
      title: 'F路封闭需改线',
      description: '高地路段封闭',
      assertions: [
        {
          id: 'a1',
          sourceSystem: 'GATE',
          sourceRefId: 'g1',
          nature: 'HARD_CONSTRAINT',
          domain: 'ROUTE',
          enforcement: 'REQUIRE_ADJUSTMENT',
          overridable: false,
          condition: '',
          conclusion: '',
          proofs: [],
        },
      ],
    });
    expect(resolveNegotiationDecisionNode(ctx)).toBe('destination');
    expect(resolveNegotiationWishDomain(ctx)).toBe('destination_route');
  });

  it('maps transport hints to main_transport domain', () => {
    const ctx = baseCtx({
      title: '第3天驾驶负荷过高',
      focusConflictId: 'issue-gap-3',
    });
    expect(resolveNegotiationWishDomain(ctx)).toBe('main_transport');
  });
});
