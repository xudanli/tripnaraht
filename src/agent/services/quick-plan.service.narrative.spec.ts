import { QuickPlanService } from './quick-plan.service';
import { SmartInferenceService } from './smart-inference.service';
import { GateCoordinatorService } from './gate-coordinator.service';
import { TripDraftService } from '../../trips/services/trip-draft.service';
import { NarrativeThemeGeneratorService } from '../../trips/narrative-engine/services/narrative-theme-generator.service';

describe('QuickPlanService narrative integration', () => {
  const prevFlag = process.env.NARRATIVE_THEME_V1;

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.NARRATIVE_THEME_V1;
    else process.env.NARRATIVE_THEME_V1 = prevFlag;
  });

  it('includes narrative block when flag enabled', async () => {
    process.env.NARRATIVE_THEME_V1 = 'true';

    const smartInference = {
      inferDefaults: jest.fn().mockResolvedValue({
        destination: { value: 'IS', confidence: 0.9, source: 'rule' },
        days: { value: 5, confidence: 0.9, source: 'rule' },
        date_range: { value: {}, confidence: 0.5, source: 'default' },
        transport: { value: 'car', confidence: 0.8, source: 'rule' },
        style: { value: 'nature', confidence: 0.8, source: 'rule' },
        intensity: { value: 'balanced', confidence: 0.8, source: 'rule' },
        overallConfidence: 0.85,
      }),
    };
    const gateCoordinator = {
      executeGateCheck: jest.fn().mockResolvedValue({
        hasCriticalBlocker: true,
        results: [],
      }),
    };
    const tripDraftService = {
      generateDraft: jest.fn(),
    };

    const service = new QuickPlanService(
      smartInference as unknown as SmartInferenceService,
      gateCoordinator as unknown as GateCoordinatorService,
      tripDraftService as unknown as TripDraftService,
      new NarrativeThemeGeneratorService(),
    );

    const result = await service.quickPlan({
      userInput: '想去冰岛探索，需要放松',
    });

    expect(result.narrative?.enabled).toBe(true);
    expect(result.narrative?.candidates).toHaveLength(3);
    expect(result.narrative?.intake.motivations).toContain('discovery');
  });

  it('omits narrative when flag disabled', async () => {
    process.env.NARRATIVE_THEME_V1 = 'false';

    const smartInference = {
      inferDefaults: jest.fn().mockResolvedValue({
        destination: { value: 'IS', confidence: 0.9, source: 'rule' },
        days: { value: 5, confidence: 0.9, source: 'rule' },
        date_range: { value: {}, confidence: 0.5, source: 'default' },
        transport: { value: 'car', confidence: 0.8, source: 'rule' },
        style: { value: 'nature', confidence: 0.8, source: 'rule' },
        intensity: { value: 'balanced', confidence: 0.8, source: 'rule' },
        overallConfidence: 0.85,
      }),
    };
    const gateCoordinator = {
      executeGateCheck: jest.fn().mockResolvedValue({
        hasCriticalBlocker: true,
        results: [],
      }),
    };

    const service = new QuickPlanService(
      smartInference as unknown as SmartInferenceService,
      gateCoordinator as unknown as GateCoordinatorService,
      {} as TripDraftService,
      new NarrativeThemeGeneratorService(),
    );

    const result = await service.quickPlan({ userInput: '冰岛' });
    expect(result.narrative).toBeUndefined();
  });
});
