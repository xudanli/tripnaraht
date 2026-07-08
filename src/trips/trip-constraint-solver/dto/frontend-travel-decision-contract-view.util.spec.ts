import { buildConstraintConsoleViewModel } from './frontend-travel-decision-contract-view.util';
import type { TripConstraintsListResponse } from './frontend-travel-decision-contract-api.types';

describe('frontend-travel-decision-contract-view.util', () => {
  const sample: TripConstraintsListResponse = {
    meta: {
      tripId: 'trip-1',
      constraintsVersion: 2,
      total: 2,
      byType: { HARD: 1, SOFT: 1, EXTERNAL: 0 },
      byStatus: { ACTIVE: 2 },
      conflictCount: 0,
      pendingConfirmCount: 0,
      sections: [
        {
          key: 'travel_objectives',
          label: '旅行目标',
          constraintIds: [],
          contractBlock: 'objectives',
        },
        {
          key: 'hard_must_satisfy',
          label: '必须满足',
          constraintIds: ['c_budget_total'],
        },
      ],
    },
    items: [
      {
        id: 'c_budget_total',
        tripId: 'trip-1',
        name: '总预算',
        category: 'BUDGET',
        type: 'HARD',
        status: 'ACTIVE',
        scope: { type: 'TRIP' },
        operator: 'LTE',
        value: 10000,
        allowRelaxation: false,
        locked: false,
        source: { type: 'USER' },
        visibility: 'TEAM',
      },
    ],
    contract: {
      schemaId: 'tripnara.travel_decision_contract@v1',
      tripId: 'trip-1',
      constraintsVersion: 2,
      objectives: { rankedPrinciples: ['SAFETY', 'BUDGET'], version: 1 },
      displayPrinciples: [
        { key: 'SAFETY', label: '安全第一', rank: 1 },
        { key: 'BUDGET', label: '预算优先', rank: 2 },
      ],
      compiledWeights: { legacy: {}, canonical: {} },
      changeStrategy: { archetype: 'BALANCED', tolerances: {} },
      automation: { defaultLevel: 'SUGGEST', autoAllowed: [], confirmationRequired: [] },
      teamGovernance: { rules: [] },
      conflicts: {
        hasConflicts: false,
        mustHandle: 0,
        suggestAdjust: 0,
        pendingConfirm: 0,
        conflictConstraintIds: [],
      },
    },
  };

  it('buildConstraintConsoleViewModel indexes items and resolves section constraints', () => {
    const view = buildConstraintConsoleViewModel(sample);
    expect(view.constraintsVersion).toBe(2);
    expect(view.itemsById.c_budget_total?.name).toBe('总预算');
    expect(view.sections[1]?.constraints[0]?.id).toBe('c_budget_total');
    expect(view.sections[0]?.contractBlock).toBe('objectives');
    expect(view.contract.displayPrinciples[0]?.label).toBe('安全第一');
  });
});
