import {
  enrichItinerarySegmentDisplayNames,
  enrichPlanningWorkbenchExecuteResponse,
  enrichPlanningWorkbenchPresentation,
  humanizeWorkbenchConfirmation,
  isRealChooseOption,
  isProceduralOrDebugConfirmation,
  reconcileWorkbenchGateState,
  buildWorkbenchDecisionContext,
  buildWorkbenchBudgetPreview,
  splitDecisionLayers,
  buildRiskFactSummary,
  buildUserSignOffConfirmations,
  buildOperationNextSteps,
  toSignOffQuestion,
  ensureSignOffQuestionForm,
  GENERIC_CHOOSE_PLACEHOLDERS,
} from './planning-workbench-execute-enrich.util';
import type { GuardianPersonaPresentation } from '../../trips/decision/shared/guardian-presentation.types';
import type { RouteSegment } from '../../trips/decision/shared/world-model.types';
import type { PersonaShellOutput } from '../services/persona-shell.service';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';

const segment = (meta: Record<string, unknown>): RouteSegment => ({
  segmentId: 's1',
  dayIndex: 0,
  distanceKm: 0,
  ascentM: 0,
  slopePct: 0,
  metadata: meta,
});

const basePlanState = (): PlanState => ({
  plan_id: 'p1',
  plan_version: 1,
  constraints: { time: { days: 5 }, budget: { total: 10000, currency: 'CNY' }, fitness: {} },
  itinerary: { tripId: 't1', routeDirectionId: 'r1', segments: [] },
  mobility: { transferSegments: [] },
  budget: {},
  pace: {},
  gate: { status: 'NEED_CONFIRM', reasons: ['高地 F 路季节性封闭'], missingEvidence: [] },
  evidence_refs: [],
  decision_log_refs: [],
  status: 'DRAFT',
  metadata: {},
});

describe('planning-workbench-execute-enrich.util', () => {
  describe('splitDecisionLayers — 三层拆分', () => {
    it('summary=风险事实，confirmations=签收，nextSteps=操作指引', () => {
      const planState = basePlanState();
      const personas: PersonaShellOutput = {
        personas: {
          abu: {
            persona: 'ABU',
            icon: '🐻',
            slogan: '',
            verdict: 'NEED_CONFIRM',
            explanation: 'F 路不可通行',
            confirmations: ['world'],
          },
          drdre: null,
          neptune: null,
        },
        consolidatedDecision: {
          status: 'NEED_CONFIRM',
          summary: 'Abu 发现风险',
          nextSteps: ['确认你的价值取舍', '改走 1 号公路'],
        },
        presentation: {
          mode: 'single_lead',
          scenario: 'SAFETY_WARN',
          leadSpeaker: 'ABU',
          headline: 'Abu 发现风险',
          narrative: 'n',
          expressionPhase: 'planning',
          displayStyle: 'design_advisory',
          supportingLines: [],
          actions: {},
          structuredStatus: {},
        },
        timestamp: '2026-06-27T00:00:00.000Z',
      };

      const layers = splitDecisionLayers({
        uiOutput: { personas, presentation: personas.presentation },
        planState,
        status: 'NEED_CONFIRM',
      });

      expect(layers.summary).toContain('F 路');
      expect(layers.confirmations.length).toBeGreaterThanOrEqual(1);
      expect(layers.confirmations[0]).toMatch(/^是否/);
      expect(layers.confirmations.some((c) => c.includes('路线封闭') || c.includes('环境与路况'))).toBe(
        true,
      );
      expect(layers.confirmations.every((c) => !c.startsWith('我已了解'))).toBe(true);
      expect(layers.confirmations.every((c) => !isProceduralOrDebugConfirmation(c))).toBe(true);
      expect(layers.nextSteps).toEqual(['勾选全部确认项', '确认后点击提交方案']);
      expect(layers.nextSteps).not.toContain('确认你的价值取舍');
    });

    it('NEED_CONFIRM 时 confirmations 必填且为问句', () => {
      const planState = {
        ...basePlanState(),
        gate: { status: 'NEED_CONFIRM', reasons: ['高地 F 路季节性封闭'], missingEvidence: [] },
      };
      const confirmations = buildUserSignOffConfirmations(
        'NEED_CONFIRM',
        { personas: undefined },
        planState,
        '高地 F 路季节性封闭。',
      );
      expect(confirmations.length).toBeGreaterThanOrEqual(1);
      expect(confirmations[0]).toBe('是否接受路线封闭风险并继续？');
      expect(confirmations.every((c) => c.startsWith('是否'))).toBe(true);
    });

    it('gate.reasons 单独即可生成签收问句（无 persona confirmations）', () => {
      const planState = {
        ...basePlanState(),
        gate: { status: 'NEED_CONFIRM', reasons: ['南岸路段临时封闭'], missingEvidence: [] },
      };
      const layers = splitDecisionLayers({
        uiOutput: {},
        planState,
        status: 'NEED_CONFIRM',
      });
      expect(layers.confirmations).toEqual(['是否接受路线封闭风险并继续？']);
    });

    it('REJECT 时 confirmations 为空，nextSteps 为 remediation', () => {
      const planState = basePlanState();
      planState.gate.status = 'REJECT';
      const personas: PersonaShellOutput = {
        personas: {
          abu: {
            persona: 'ABU',
            icon: '🐻',
            slogan: '',
            verdict: 'REJECT',
            explanation: 'F 路不可通行',
            recommendations: [{ action: '改走 1 号公路', reason: '', impact: '' }],
          },
          drdre: null,
          neptune: null,
        },
        consolidatedDecision: { status: 'REJECT', summary: 'x', nextSteps: [] },
        presentation: {} as GuardianPersonaPresentation,
        timestamp: '',
      };

      const layers = splitDecisionLayers({
        uiOutput: {
          personas,
          presentation: {
            hardConstraintBlocked: true,
            mode: 'single_lead',
            scenario: 'SAFETY_BLOCK',
            leadSpeaker: 'ABU',
            headline: '',
            narrative: '',
            expressionPhase: 'planning',
            displayStyle: 'design_advisory',
            supportingLines: [],
            actions: { abu: 'BLOCK' },
            structuredStatus: {},
          },
        },
        planState,
        status: 'REJECT',
      });

      expect(layers.confirmations).toEqual([]);
      expect(layers.nextSteps[0]).toContain('改走');
    });
  });

  describe('enrichItinerarySegmentDisplayNames', () => {
    it('uses fromName → toName as metadata.name', () => {
      const [enriched] = enrichItinerarySegmentDisplayNames([
        segment({
          day: 1,
          theme: '南岸',
          attractions: [{ nameCN: '雷克雅未克' }],
          accommodation: { nameCN: '维克' },
        }),
      ]);

      expect(enriched.metadata?.name).toBe('雷克雅未克 → 维克');
    });
  });

  describe('isRealChooseOption', () => {
    it('rejects generic placeholders', () => {
      for (const phrase of GENERIC_CHOOSE_PLACEHOLDERS) {
        expect(isRealChooseOption(phrase)).toBe(false);
      }
    });
  });

  describe('humanizeWorkbenchConfirmation', () => {
    it('maps internal evidence codes to sign-off questions', () => {
      expect(humanizeWorkbenchConfirmation('world')).toContain('环境与路况');
      expect(ensureSignOffQuestionForm(humanizeWorkbenchConfirmation('world'))).toMatch(/^是否/u);
    });
  });

  describe('toSignOffQuestion', () => {
    it('maps road closure facts to contract question', () => {
      expect(toSignOffQuestion('高地 F 路季节性封闭')).toBe('是否接受路线封闭风险并继续？');
    });

    it('maps budget overrun facts', () => {
      expect(toSignOffQuestion('预算预估超出 3200 CNY')).toBe('是否接受当前预算超支预估？');
    });
  });

  describe('reconcileWorkbenchGateState', () => {
    it('hard block clears CHOOSE and sets REJECT status only', () => {
      const personas: PersonaShellOutput = {
        personas: {
          abu: {
            persona: 'ABU',
            icon: '🐻',
            slogan: '',
            verdict: 'REJECT',
            explanation: 'F 路不可通行',
            recommendations: [{ action: '改走 1 号公路', reason: '', impact: '' }],
          },
          drdre: null,
          neptune: null,
        },
        consolidatedDecision: { status: 'NEED_CONFIRM', summary: 'x', nextSteps: [] },
        presentation: {
          mode: 'single_lead',
          scenario: 'SAFETY_BLOCK',
          leadSpeaker: 'ABU',
          headline: 'Abu 阻断',
          narrative: 'n',
          expressionPhase: 'planning',
          displayStyle: 'design_advisory',
          supportingLines: [],
          actions: { abu: 'BLOCK', user: 'CHOOSE' },
          structuredStatus: { abu: { existence: 'BLOCK', action: 'BLOCK' } },
          hardConstraintBlocked: true,
        },
        timestamp: new Date().toISOString(),
      };

      const result = reconcileWorkbenchGateState({
        presentation: personas.presentation,
        personas,
      });

      expect(result.personas?.consolidatedDecision.status).toBe('REJECT');
      expect(result.presentation?.actions.user).toBeUndefined();
    });
  });

  describe('enrichPlanningWorkbenchExecuteResponse', () => {
    it('end-to-end three layers on execute response', () => {
      const result = enrichPlanningWorkbenchExecuteResponse({
        planState: basePlanState(),
        uiOutput: {
          personas: {
            personas: {
              abu: {
                persona: 'ABU',
                icon: '🐻',
                slogan: '',
                verdict: 'NEED_CONFIRM',
                explanation: '需确认路况',
                confirmations: ['world'],
              },
              drdre: null,
              neptune: null,
            },
            consolidatedDecision: {
              status: 'NEED_CONFIRM',
              summary: '请选择',
              nextSteps: ['确认你的价值取舍'],
            },
            presentation: {
              mode: 'single_lead',
              scenario: 'MULTI_FACTOR',
              leadSpeaker: 'NEPTUNE',
              headline: '请选择',
              narrative: 'n',
              expressionPhase: 'planning',
              displayStyle: 'design_advisory',
              supportingLines: [],
              actions: { user: 'CHOOSE' },
              structuredStatus: { user: { action: 'CHOOSE' } },
            },
            timestamp: '2026-06-27T00:00:00.000Z',
          },
          presentation: undefined,
          skeletonOptions: {
            options: [
              {
                id: 'a',
                name: 'A',
                dayThemes: [{ day: 1, theme: 't1' }],
                anchors: [],
                transferDays: [],
                rationale: { philosophy: '', tradeoffs: [], strengths: [], weaknesses: [] },
              },
              {
                id: 'b',
                name: 'B',
                dayThemes: [{ day: 1, theme: 't2' }],
                anchors: [],
                transferDays: [],
                rationale: { philosophy: '', tradeoffs: [], strengths: [], weaknesses: [] },
              },
            ],
          },
        },
      });

      expect(result.uiOutput.consolidatedDecision?.summary).toContain('F 路');
      expect(result.uiOutput.confirmations?.length).toBeGreaterThanOrEqual(1);
      expect(result.uiOutput.consolidatedDecision?.nextSteps).toEqual([
        '在决策卡片中选择一项方案',
        '完成选择后点击提交',
      ]);
      expect(result.uiOutput.presentation?.humanDecisionPointsFlat?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('OpenAPI helpers', () => {
    it('buildWorkbenchDecisionContext', () => {
      const ctx = buildWorkbenchDecisionContext(basePlanState(), 't1', {
        contextPackageId: 'ctx_1',
        scheduleRevision: 12,
      });
      expect(ctx.contextPackageId).toBe('ctx_1');
    });

    it('buildWorkbenchBudgetPreview in Chinese', () => {
      const preview = buildWorkbenchBudgetPreview({
        ...basePlanState(),
        budget: { breakdown: { categories: [{ category: 'food', estimated: 8000 }] } },
      });
      expect(preview.evaluated).toBe(true);
      expect(preview.message ?? '').not.toMatch(/lazy load/i);
    });
  });
});
