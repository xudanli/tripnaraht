/**
 * Page Insight Orchestrator — evaluate / get / feedback for Copilot.
 * Live pages: DECISION_SPACE, ACTIVITY_EDITOR, ITINERARY_DAY_EDITOR,
 * PLANNING_OVERVIEW, EXECUTION_HOME.
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  ClientPageState,
  InsightFeedbackType,
  InsightRecordStatus,
  NaraPageInsight,
  PageAIContract,
  PageInsightEvaluateResponse,
  PageInsightFeedbackRequest,
  PageInsightGetResponse,
  PageId,
} from '../contracts/page-insight.types';
import { PageAIContractRegistry, PageContractNotFoundError } from './page-ai-contract.registry';
import { PageInsightContextHashService } from './page-insight-context-hash.service';
import { PageInsightCacheService } from './page-insight-cache.service';
import { DecisionSpacePageContextBuilder, type FocusResolveDiag } from './decision-space-page-context.builder';
import { selectDecisionSpaceInsight, detectTriggers } from './decision-space-insight.selector';
import { ActivityEditorPageContextBuilder } from './activity-editor-page-context.builder';
import { selectActivityEditorInsight } from './activity-editor-insight.selector';
import { ItineraryDayEditorPageContextBuilder } from './itinerary-day-editor-page-context.builder';
import { selectItineraryDayEditorInsight } from './itinerary-day-editor-insight.selector';
import { PlanningOverviewPageContextBuilder } from './planning-overview-page-context.builder';
import { selectPlanningOverviewInsight } from './planning-overview-insight.selector';
import { ExecutionHomePageContextBuilder } from './execution-home-page-context.builder';
import { selectExecutionHomeInsight } from './execution-home-insight.selector';
import { PageInsightNarrativeService } from './page-insight-narrative.service';
import { PageInsightFeedbackStore } from './page-insight-feedback.store';
import { getDecisionCaseAIContract } from '../contracts/decision-case-ai-contracts';
import { InsuranceClauseKnowledgeService } from './insurance-clause-knowledge.service';

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class PageInsightOrchestratorService {
  private readonly logger = new Logger(PageInsightOrchestratorService.name);

  constructor(
    private readonly contracts: PageAIContractRegistry,
    private readonly hashService: PageInsightContextHashService,
    private readonly cache: PageInsightCacheService,
    private readonly decisionSpaceBuilder: DecisionSpacePageContextBuilder,
    private readonly activityEditorBuilder: ActivityEditorPageContextBuilder,
    private readonly dayEditorBuilder: ItineraryDayEditorPageContextBuilder,
    private readonly planningOverviewBuilder: PlanningOverviewPageContextBuilder,
    private readonly executionHomeBuilder: ExecutionHomePageContextBuilder,
    private readonly narrative: PageInsightNarrativeService,
    private readonly feedbackStore: PageInsightFeedbackStore,
    @Optional() private readonly insuranceClauses?: InsuranceClauseKnowledgeService,
  ) {}

  async evaluate(
    tripId: string,
    client: ClientPageState,
  ): Promise<PageInsightEvaluateResponse> {
    let contract: PageAIContract;
    try {
      contract = this.contracts.get(client.pageId);
    } catch (err) {
      if (err instanceof PageContractNotFoundError) throw err;
      throw err;
    }

    if (client.pageId === 'ACTIVITY_EDITOR') {
      return this.evaluateActivityEditor(tripId, client, contract);
    }
    if (client.pageId === 'ITINERARY_DAY_EDITOR') {
      return this.evaluateItineraryDayEditor(tripId, client, contract);
    }
    if (client.pageId === 'PLANNING_OVERVIEW') {
      return this.evaluatePlanningOverview(tripId, client, contract);
    }
    if (client.pageId === 'EXECUTION_HOME') {
      return this.evaluateExecutionHome(tripId, client, contract);
    }
    if (client.pageId === 'DECISION_SPACE') {
      return this.evaluateDecisionSpace(tripId, client, contract);
    }
    throw new PageContractNotFoundError(client.pageId);
  }

  private async evaluateExecutionHome(
    tripId: string,
    client: ClientPageState,
    contract: PageAIContract,
  ): Promise<PageInsightEvaluateResponse> {
    const built = await this.executionHomeBuilder.build(tripId, client);
    const contextHash = this.hashService.compute(contract, client, built.versions);

    if (!client.forceRefresh) {
      const cached = this.cache.get(tripId, contextHash);
      if (cached) {
        this.feedbackStore.recordMetric({
          tripId,
          insightId: cached.id,
          contextHash,
          event: 'CACHE_HIT',
          generationSource: 'CACHE',
        });
        return {
          schema: 'tripnara.nara_page_insight@v1',
          evaluation: {
            contextHash,
            cacheHit: true,
            authoritativeAssembledAt: new Date().toISOString(),
            llmUsed: false,
            modeReason: 'CACHE_HIT',
            explicitAsk: false,
            execSeverity: built.severity,
            execDelayMinutes: built.delayMinutes,
            execAdvisoryVerdict: built.advisoryVerdict ?? null,
            execTopRiskId: built.topRisk?.riskId ?? null,
            execTopRiskLevel: built.topRisk?.level ?? null,
            execInterventionDeadline: built.interventionDeadline ?? null,
            execContextGate: {
              ok: built.gate.ok,
              code: built.gate.code,
              missing: built.gate.missing,
            },
          },
          insight: cached,
        };
      }
    }

    let selection = selectExecutionHomeInsight({
      built,
      explicitAsk: !!client.forceRefresh,
    });

    const polished = await this.narrative.polishExecutionHome(selection, {
      currentState: `晚点${built.delayMinutes}分钟`,
      nextActivity: built.nextActivityLabel
        ? `${built.nextActivityLabel} ${built.nextActivityStart ?? ''}`.trim()
        : undefined,
      executionRisk: built.topRisk?.summary,
      interventionDeadline: built.interventionDeadline,
      advisory: built.advisoryHeadline,
    });

    if (polished.forceSilent && selection.mode !== 'SILENT') {
      selection = {
        ...selection,
        mode: 'SILENT',
        priority: 'P2',
        modeReason: 'ADVISOR_SILENT',
        actions: [],
      };
    }

    const now = new Date();
    const advisor = polished.advisorCopy;
    const useAdvisor = selection.mode !== 'SILENT' && !!advisor;

    const insight: NaraPageInsight = {
      id: `ins_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      tripId,
      pageId: client.pageId,
      mode: selection.mode,
      priority: selection.priority,
      insightType: selection.insightType,
      title: useAdvisor ? advisor.title : selection.title,
      observation: {
        summary: useAdvisor ? advisor.body : selection.observationSummary,
        factRefs: selection.factRefs,
      },
      explanation: {
        summary: useAdvisor ? '' : selection.explanationSummary,
      },
      impacts: useAdvisor ? [] : selection.impacts,
      recommendation: useAdvisor
        ? {
            summary: advisor.advice,
            rationale: advisor.advice,
          }
        : selection.recommendation
          ? {
              summary: selection.recommendation.summary,
              rationale: selection.recommendation.rationale,
            }
          : undefined,
      actions: selection.actions,
      confidence: selection.confidence,
      evidenceRefs: selection.evidenceRefs,
      context: {
        contextHash,
        tripVersion: built.versions.relevantTripProjectionVersion,
        worldStateVersion: built.versions.relevantWorldStateVersion,
        decisionWorkspaceVersion: built.versions.relevantDecisionWorkspaceVersion,
        draftRevision: null,
        pageContractVersion: contract.pageContractVersion,
      },
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
      advisorCopy: useAdvisor ? advisor : undefined,
    };

    this.cache.put(insight, { proactiveCache: !client.forceRefresh });

    this.feedbackStore.recordMetric({
      tripId,
      insightId: insight.id,
      contextHash,
      event: 'GENERATED',
      problemId: built.topProblem?.problemId,
      generationSource: polished.llmUsed ? 'LLM' : 'RULE',
      llmDegraded: !!polished.degradedReason,
    });

    this.logger.debug(
      `evaluate trip=${tripId} page=EXECUTION_HOME mode=${insight.mode} reason=${selection.modeReason ?? '-'} hash=${contextHash}`,
    );

    return {
      schema: 'tripnara.nara_page_insight@v1',
      evaluation: {
        contextHash,
        cacheHit: false,
        authoritativeAssembledAt: now.toISOString(),
        llmUsed: polished.llmUsed,
        degradedReason: polished.degradedReason,
        modeReason: selection.modeReason,
        explicitAsk: !!client.forceRefresh,
        execSeverity: built.severity,
        execDelayMinutes: built.delayMinutes,
        execAdvisoryVerdict: built.advisoryVerdict ?? null,
        execTopRiskId: built.topRisk?.riskId ?? null,
        execTopRiskLevel: built.topRisk?.level ?? null,
        execInterventionDeadline: built.interventionDeadline ?? null,
        execContextGate: {
          ok: built.gate.ok,
          code: built.gate.code,
          missing: built.gate.missing,
        },
      },
      insight,
    };
  }

  private async evaluatePlanningOverview(
    tripId: string,
    client: ClientPageState,
    contract: PageAIContract,
  ): Promise<PageInsightEvaluateResponse> {
    const built = await this.planningOverviewBuilder.build(tripId, client);
    const contextHash = this.hashService.compute(contract, client, built.versions);

    if (!client.forceRefresh) {
      const cached = this.cache.get(tripId, contextHash);
      if (cached) {
        this.feedbackStore.recordMetric({
          tripId,
          insightId: cached.id,
          contextHash,
          event: 'CACHE_HIT',
          generationSource: 'CACHE',
        });
        return {
          schema: 'tripnara.nara_page_insight@v1',
          evaluation: {
            contextHash,
            cacheHit: true,
            authoritativeAssembledAt: new Date().toISOString(),
            llmUsed: false,
            modeReason: 'CACHE_HIT',
            explicitAsk: false,
            overviewSeverity: built.severity,
            overviewMustConfirmCount: built.mustConfirmCount,
            overviewImportantChoiceCount: built.importantChoiceCount,
            overviewOpenProblemCount: built.openProblemCount,
            overviewTopProblemId: built.topProblem?.problemId ?? null,
            overviewContextGate: {
              ok: built.gate.ok,
              code: built.gate.code,
              missing: built.gate.missing,
            },
          },
          insight: cached,
        };
      }
    }

    let selection = selectPlanningOverviewInsight({
      built,
      explicitAsk: !!client.forceRefresh,
    });

    const polished = await this.narrative.polishPlanningOverview(selection, {
      tripSummary: `open=${built.openProblemCount}, mustConfirm=${built.mustConfirmCount}, important=${built.importantChoiceCount}`,
      blockingIssues: built.topBlockerTitle,
      priorityAction: selection.ruleSuggestion,
      unlockHint: built.unlockHint,
    });

    if (polished.forceSilent && selection.mode !== 'SILENT') {
      selection = {
        ...selection,
        mode: 'SILENT',
        priority: 'P2',
        modeReason: 'ADVISOR_SILENT',
        actions: [],
      };
    }

    const now = new Date();
    const advisor = polished.advisorCopy;
    const useAdvisor = selection.mode !== 'SILENT' && !!advisor;

    const insight: NaraPageInsight = {
      id: `ins_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      tripId,
      pageId: client.pageId,
      mode: selection.mode,
      priority: selection.priority,
      insightType: selection.insightType,
      title: useAdvisor ? advisor.title : selection.title,
      observation: {
        summary: useAdvisor ? advisor.body : selection.observationSummary,
        factRefs: selection.factRefs,
      },
      explanation: {
        summary: useAdvisor ? '' : selection.explanationSummary,
      },
      impacts: useAdvisor ? [] : selection.impacts,
      recommendation: useAdvisor
        ? {
            summary: advisor.advice,
            rationale: advisor.advice,
          }
        : selection.recommendation
          ? {
              summary: selection.recommendation.summary,
              rationale: selection.recommendation.rationale,
            }
          : undefined,
      actions: selection.actions,
      confidence: selection.confidence,
      evidenceRefs: selection.evidenceRefs,
      context: {
        contextHash,
        tripVersion: built.versions.relevantTripProjectionVersion,
        worldStateVersion: built.versions.relevantWorldStateVersion,
        decisionWorkspaceVersion: built.versions.relevantDecisionWorkspaceVersion,
        draftRevision: null,
        pageContractVersion: contract.pageContractVersion,
      },
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
      advisorCopy: useAdvisor ? advisor : undefined,
    };

    this.cache.put(insight, { proactiveCache: !client.forceRefresh });

    this.feedbackStore.recordMetric({
      tripId,
      insightId: insight.id,
      contextHash,
      event: 'GENERATED',
      problemId: built.topProblem?.problemId,
      generationSource: polished.llmUsed ? 'LLM' : 'RULE',
      llmDegraded: !!polished.degradedReason,
    });

    this.logger.debug(
      `evaluate trip=${tripId} page=PLANNING_OVERVIEW mode=${insight.mode} reason=${selection.modeReason ?? '-'} hash=${contextHash}`,
    );

    return {
      schema: 'tripnara.nara_page_insight@v1',
      evaluation: {
        contextHash,
        cacheHit: false,
        authoritativeAssembledAt: now.toISOString(),
        llmUsed: polished.llmUsed,
        degradedReason: polished.degradedReason,
        modeReason: selection.modeReason,
        explicitAsk: !!client.forceRefresh,
        overviewSeverity: built.severity,
        overviewMustConfirmCount: built.mustConfirmCount,
        overviewImportantChoiceCount: built.importantChoiceCount,
        overviewOpenProblemCount: built.openProblemCount,
        overviewTopProblemId: built.topProblem?.problemId ?? null,
        overviewContextGate: {
          ok: built.gate.ok,
          code: built.gate.code,
          missing: built.gate.missing,
        },
      },
      insight,
    };
  }

  private async evaluateItineraryDayEditor(
    tripId: string,
    client: ClientPageState,
    contract: PageAIContract,
  ): Promise<PageInsightEvaluateResponse> {
    const built = await this.dayEditorBuilder.build(tripId, client);
    const contextHash = this.hashService.compute(contract, client, built.versions);

    if (!client.forceRefresh) {
      const cached = this.cache.get(tripId, contextHash);
      if (cached) {
        this.feedbackStore.recordMetric({
          tripId,
          insightId: cached.id,
          contextHash,
          event: 'CACHE_HIT',
          generationSource: 'CACHE',
        });
        return {
          schema: 'tripnara.nara_page_insight@v1',
          evaluation: {
            contextHash,
            cacheHit: true,
            authoritativeAssembledAt: new Date().toISOString(),
            llmUsed: false,
            modeReason: 'CACHE_HIT',
            explicitAsk: false,
            daySeverity: built.daySeverity,
            dayPlanStatus: built.dayPlanStatus,
            dayProposalStatus: built.proposal?.validation.status ?? null,
            dayProposalId: built.proposal?.proposalId ?? null,
            dayContextGate: {
              ok: built.gate.ok,
              code: built.gate.code,
              missing: built.gate.missing,
            },
            dayMustHandleCount: built.mustHandleCount,
            daySuggestAdjustCount: built.suggestAdjustCount,
          },
          insight: cached,
        };
      }
    }

    let selection = selectItineraryDayEditorInsight({
      built,
      explicitAsk: !!client.forceRefresh,
    });

    const polished = await this.narrative.polishItineraryDayEditor(selection, {
      selectedDay: built.dayIndex != null ? `第${built.dayIndex}天` : undefined,
      dayPlan: built.dayItems
        .map((i) =>
          [
            i.startTime,
            i.label,
            i.needsBooking ? '待预订' : undefined,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join('；') || '空',
      dayPlanStatus: built.dayPlanStatus,
      gaps: built.gaps
        .map((g) => `${g.startTime}-${g.endTime}(${g.minutes}分)`)
        .join('；'),
      pendingBookings: built.pendingBookingLabels.join('、'),
      conflictAssessment:
        built.topIssue && !built.topIssue.systemMaintenance
          ? built.topIssue.message
          : undefined,
      validatedRecommendation: selection.hasValidatedRecommendation
        ? selection.recommendation?.summary
        : undefined,
    });

    if (polished.forceSilent && selection.mode !== 'SILENT') {
      selection = {
        ...selection,
        mode: 'SILENT',
        priority: 'P2',
        modeReason: 'ADVISOR_SILENT',
        actions: [],
      };
    }

    const now = new Date();
    const advisor = polished.advisorCopy;
    const useAdvisor = selection.mode !== 'SILENT' && !!advisor;

    const insight: NaraPageInsight = {
      id: `ins_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      tripId,
      pageId: client.pageId,
      mode: selection.mode,
      priority: selection.priority,
      insightType: selection.insightType,
      title: useAdvisor ? advisor.title : selection.title,
      observation: {
        summary: useAdvisor ? advisor.body : selection.observationSummary,
        factRefs: selection.factRefs,
      },
      explanation: {
        summary: useAdvisor ? '' : selection.explanationSummary,
      },
      impacts: useAdvisor ? [] : selection.impacts,
      recommendation: useAdvisor
        ? {
            summary: advisor.advice,
            rationale: advisor.advice,
            recommendedOptionId: selection.recommendation?.recommendedOptionId,
          }
        : selection.recommendation
          ? {
              summary: selection.recommendation.summary,
              rationale: selection.recommendation.rationale,
              recommendedOptionId: selection.recommendation.recommendedOptionId,
            }
          : undefined,
      actions: selection.actions,
      confidence: selection.confidence,
      evidenceRefs: selection.evidenceRefs,
      context: {
        contextHash,
        tripVersion: built.versions.relevantTripProjectionVersion,
        worldStateVersion: built.versions.relevantWorldStateVersion,
        draftRevision: built.versions.draftRevision ?? null,
        pageContractVersion: contract.pageContractVersion,
      },
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
      advisorCopy: useAdvisor ? advisor : undefined,
    };

    this.cache.put(insight, { proactiveCache: !client.forceRefresh });

    this.feedbackStore.recordMetric({
      tripId,
      insightId: insight.id,
      contextHash,
      event: 'GENERATED',
      generationSource: polished.llmUsed ? 'LLM' : 'RULE',
      llmDegraded: !!polished.degradedReason,
    });

    this.logger.debug(
      `evaluate trip=${tripId} page=ITINERARY_DAY_EDITOR mode=${insight.mode} reason=${selection.modeReason ?? '-'} hash=${contextHash}`,
    );

    return {
      schema: 'tripnara.nara_page_insight@v1',
      evaluation: {
        contextHash,
        cacheHit: false,
        authoritativeAssembledAt: now.toISOString(),
        llmUsed: polished.llmUsed,
        degradedReason: polished.degradedReason,
        modeReason: selection.modeReason,
        explicitAsk: !!client.forceRefresh,
        daySeverity: built.daySeverity,
        dayPlanStatus: built.dayPlanStatus,
        dayProposalStatus: built.proposal?.validation.status ?? null,
        dayProposalId: built.proposal?.proposalId ?? null,
        dayContextGate: {
          ok: built.gate.ok,
          code: built.gate.code,
          missing: built.gate.missing,
        },
        dayMustHandleCount: built.mustHandleCount,
        daySuggestAdjustCount: built.suggestAdjustCount,
      },
      insight,
    };
  }

  private async evaluateActivityEditor(
    tripId: string,
    client: ClientPageState,
    contract: PageAIContract,
  ): Promise<PageInsightEvaluateResponse> {
    const built = await this.activityEditorBuilder.build(tripId, client);
    const contextHash = this.hashService.compute(contract, client, built.versions);

    if (!client.forceRefresh) {
      const cached = this.cache.get(tripId, contextHash);
      if (cached) {
        this.feedbackStore.recordMetric({
          tripId,
          insightId: cached.id,
          contextHash,
          event: 'CACHE_HIT',
          generationSource: 'CACHE',
        });
        return {
          schema: 'tripnara.nara_page_insight@v1',
          evaluation: {
            contextHash,
            cacheHit: true,
            authoritativeAssembledAt: new Date().toISOString(),
            llmUsed: false,
            modeReason: 'CACHE_HIT',
            explicitAsk: false,
            activityProposalStatus: built.proposal?.validation.status ?? null,
            activityProposalId: built.proposal?.proposalId ?? null,
            activityContextGate: {
              ok: built.gate.ok,
              code: built.gate.code,
              missing: built.gate.missing,
            },
          },
          insight: cached,
        };
      }
    }

    let selection = selectActivityEditorInsight({
      built,
      explicitAsk: !!client.forceRefresh,
    });

    const polished = await this.narrative.polishActivityEditor(selection, {
      activity: built.placeName ?? (built.placeId != null ? `place:${built.placeId}` : undefined),
      targetDay: built.dayIndex != null ? `第${built.dayIndex}天` : undefined,
      dayPlan: built.dayItems.map((i) => i.label).join('、') || '空',
      assessment: built.proposal
        ? `${built.proposal.validation.status}; ${built.proposal.diff.summary}`
        : built.proposalError,
      validatedRecommendation: selection.hasValidatedRecommendation
        ? selection.recommendation?.summary
        : undefined,
    });

    if (polished.forceSilent && selection.mode !== 'SILENT') {
      selection = {
        ...selection,
        mode: 'SILENT',
        priority: 'P2',
        modeReason: 'ADVISOR_SILENT',
        actions: [],
      };
    }

    const now = new Date();
    const advisor = polished.advisorCopy;
    const useAdvisor = selection.mode !== 'SILENT' && !!advisor;

    const insight: NaraPageInsight = {
      id: `ins_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      tripId,
      pageId: client.pageId,
      mode: selection.mode,
      priority: selection.priority,
      insightType: selection.insightType,
      title: useAdvisor ? advisor.title : selection.title,
      observation: {
        summary: useAdvisor ? advisor.body : selection.observationSummary,
        factRefs: selection.factRefs,
      },
      explanation: {
        summary: useAdvisor ? '' : selection.explanationSummary,
      },
      impacts: useAdvisor ? [] : selection.impacts,
      recommendation: useAdvisor
        ? {
            summary: advisor.advice,
            rationale: advisor.advice,
            recommendedOptionId: selection.recommendation?.recommendedOptionId,
          }
        : selection.recommendation
          ? {
              summary: selection.recommendation.summary,
              rationale: selection.recommendation.rationale,
              recommendedOptionId: selection.recommendation.recommendedOptionId,
            }
          : undefined,
      actions: selection.actions,
      confidence: selection.confidence,
      evidenceRefs: selection.evidenceRefs,
      context: {
        contextHash,
        tripVersion: built.versions.relevantTripProjectionVersion,
        worldStateVersion: built.versions.relevantWorldStateVersion,
        draftRevision: built.versions.draftRevision ?? null,
        pageContractVersion: contract.pageContractVersion,
      },
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
      advisorCopy: useAdvisor ? advisor : undefined,
    };

    this.cache.put(insight, { proactiveCache: !client.forceRefresh });

    this.feedbackStore.recordMetric({
      tripId,
      insightId: insight.id,
      contextHash,
      event: 'GENERATED',
      generationSource: polished.llmUsed ? 'LLM' : 'RULE',
      llmDegraded: !!polished.degradedReason,
    });

    this.logger.debug(
      `evaluate trip=${tripId} page=ACTIVITY_EDITOR mode=${insight.mode} reason=${selection.modeReason ?? '-'} hash=${contextHash}`,
    );

    return {
      schema: 'tripnara.nara_page_insight@v1',
      evaluation: {
        contextHash,
        cacheHit: false,
        authoritativeAssembledAt: now.toISOString(),
        llmUsed: polished.llmUsed,
        degradedReason: polished.degradedReason,
        modeReason: selection.modeReason,
        explicitAsk: !!client.forceRefresh,
        activityProposalStatus: built.proposal?.validation.status ?? null,
        activityProposalId: built.proposal?.proposalId ?? null,
        activityContextGate: {
          ok: built.gate.ok,
          code: built.gate.code,
          missing: built.gate.missing,
        },
      },
      insight,
    };
  }

  private async evaluateDecisionSpace(
    tripId: string,
    client: ClientPageState,
    contract: PageAIContract,
  ): Promise<PageInsightEvaluateResponse> {
    const built = await this.decisionSpaceBuilder.build(tripId, client);
    const contextHash = this.hashService.compute(contract, client, built.versions);
    const focusEval = focusDiagToEvalFields(built.focusDiag);

    if (!client.forceRefresh) {
      const cached = this.cache.get(tripId, contextHash);
      if (cached) {
        const focusedId =
          built.focusedProblem?.problemId ??
          cached.observation.factRefs
            .find((r) => r.startsWith('decision-problem:'))
            ?.replace('decision-problem:', '');
        this.feedbackStore.recordMetric({
          tripId,
          insightId: cached.id,
          contextHash,
          event: 'CACHE_HIT',
          problemId: focusedId,
          generationSource: 'CACHE',
        });
        return {
          schema: 'tripnara.nara_page_insight@v1',
          evaluation: {
            contextHash,
            cacheHit: true,
            authoritativeAssembledAt: new Date().toISOString(),
            llmUsed: false,
            modeReason: 'CACHE_HIT',
            explicitAsk: false,
            focusedProblemId: focusedId ?? null,
            openProblemCount: built.openProblems.length,
            focusedInOpenQueue: focusedId
              ? built.openProblems.some((p) => p.problemId === focusedId)
              : false,
            focusedRequiresAction:
              built.focusedProblem?.actionability?.requiresAction ?? null,
            focusedWorkflowStatus: built.focusedProblem?.workflowStatus ?? null,
            focusedEnforcement: built.focusedProblem?.enforcement ?? null,
            allowedOptionCount: (built.optionsView?.actions ?? []).filter((a) => a.allowed)
              .length,
            triggers: built.focusedProblem
              ? detectTriggers(built.focusedProblem, built.optionsView)
              : null,
            ...focusEval,
          },
          insight: cached,
        };
      }
    }

    let selection = selectDecisionSpaceInsight({
      openProblems: built.openProblems,
      focused: built.focusedProblem,
      optionsView: built.optionsView,
      explicitAsk: !!client.forceRefresh,
      focusResolveStatus: built.focusDiag.resolveStatus,
      surface:
        built.focusDiag.resolveStatus === 'MATCHED_PROBLEM_ID' ||
        built.focusDiag.resolveStatus === 'MATCHED_INSTANCE_KEY'
          ? 'DETAIL'
          : 'LIST',
      insuranceContext: built.insuranceContext,
      vehicleContext: built.vehicleContext,
      validatedPreviews: built.validatedPreviews,
      planVersion: built.planVersion,
    });

    const caseContract = getDecisionCaseAIContract({
      semanticKey: built.focusedProblem?.semanticKey,
      problemId: built.focusedProblem?.problemId,
      hasDecisionCase: !!built.focusedProblem?.decisionCase,
      type: built.focusedProblem?.type,
      title: built.focusedProblem?.title,
    });

    const insuranceClauseKnowledge =
      built.insuranceContext && this.insuranceClauses
        ? await this.insuranceClauses.fetchClauseNotes({ timeoutMs: 1500 })
        : undefined;

    const polished = await this.narrative.polish(selection, {
      pageName: '决策空间',
      currentTask: built.focusedProblem?.title ?? '处理当前决策',
      pageVisibleSummary: built.focusedProblem?.summary ?? built.focusedProblem?.title,
      insuranceContext: built.insuranceContext,
      vehicleContext: built.vehicleContext,
      isRentalInsurance: !!built.insuranceContext,
      isVehicleRoadFit: !!built.vehicleContext,
      casePromptHint: caseContract.promptHint,
      caseAiMode: caseContract.aiMode,
      insuranceClauseKnowledge,
    });

    if (polished.forceSilent && selection.mode !== 'SILENT') {
      selection = {
        ...selection,
        mode: 'SILENT',
        priority: 'P2',
        modeReason: 'ADVISOR_SILENT',
        actions: [],
      };
    }

    const now = new Date();
    const triggers = built.focusedProblem
      ? detectTriggers(built.focusedProblem, built.optionsView)
      : null;

    const advisor = polished.advisorCopy;
    const useAdvisor = selection.mode !== 'SILENT' && !!advisor;

    const insight: NaraPageInsight = {
      id: `ins_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      tripId,
      pageId: client.pageId,
      mode: selection.mode,
      priority: selection.priority,
      insightType: selection.insightType,
      title: useAdvisor ? advisor.title : selection.title,
      observation: {
        summary: useAdvisor ? advisor.body : selection.observationSummary,
        factRefs: selection.factRefs,
      },
      explanation: {
        summary: useAdvisor ? '' : selection.explanationSummary,
        causalChainRefs: selection.causalChainRefs,
      },
      impacts: useAdvisor ? [] : selection.impacts,
      recommendation: useAdvisor
        ? {
            summary: advisor.advice,
            rationale: advisor.advice,
            recommendedOptionId: selection.recommendation?.recommendedOptionId,
          }
        : selection.recommendation
          ? {
              summary: selection.recommendation.summary,
              rationale: selection.recommendation.rationale,
              recommendedOptionId: selection.recommendation.recommendedOptionId,
            }
          : undefined,
      actions: selection.actions,
      confidence: selection.confidence,
      evidenceRefs: selection.evidenceRefs,
      context: {
        contextHash,
        tripVersion: built.versions.relevantTripProjectionVersion,
        worldStateVersion: built.versions.relevantWorldStateVersion,
        decisionWorkspaceVersion: built.versions.relevantDecisionWorkspaceVersion,
        draftRevision: null,
        pageContractVersion: contract.pageContractVersion,
      },
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
      advisorCopy: useAdvisor ? advisor : undefined,
      causalDecisionCard: useAdvisor ? undefined : selection.causalDecisionCard,
    };

    this.cache.put(insight, { proactiveCache: !client.forceRefresh });

    this.feedbackStore.recordMetric({
      tripId,
      insightId: insight.id,
      contextHash,
      event: 'GENERATED',
      problemId: selection.focusedProblemId,
      generationSource: polished.llmUsed ? 'LLM' : 'RULE',
      llmDegraded: !!polished.degradedReason,
    });

    this.logger.debug(
      `evaluate trip=${tripId} page=${client.pageId} mode=${insight.mode} reason=${selection.modeReason ?? '-'} focus=${built.focusDiag.resolveStatus} hash=${contextHash}`,
    );

    return {
      schema: 'tripnara.nara_page_insight@v1',
      evaluation: {
        contextHash,
        cacheHit: false,
        authoritativeAssembledAt: now.toISOString(),
        llmUsed: polished.llmUsed,
        degradedReason: polished.degradedReason,
        modeReason: selection.modeReason,
        explicitAsk: !!client.forceRefresh,
        focusedProblemId: selection.focusedProblemId ?? built.focusedProblem?.problemId ?? null,
        openProblemCount: built.openProblems.length,
        focusedInOpenQueue: built.focusedProblem
          ? built.openProblems.some((p) => p.problemId === built.focusedProblem!.problemId)
          : false,
        focusedRequiresAction: built.focusedProblem?.actionability?.requiresAction ?? null,
        focusedWorkflowStatus:
          built.focusedProblem?.workflowStatus ??
          built.focusDiag.selectedWorkflowStatus ??
          null,
        focusedEnforcement: built.focusedProblem?.enforcement ?? null,
        allowedOptionCount: (built.optionsView?.actions ?? []).filter((a) => a.allowed).length,
        triggers,
        insuranceContextGate: built.insuranceContext
          ? {
              ok: built.insuranceContext.gate.ok,
              code: built.insuranceContext.gate.code,
              missing: built.insuranceContext.gate.missing,
              confirmedFactCount: built.insuranceContext.confirmedFacts.length,
              missingFields: built.insuranceContext.missingFields,
            }
          : null,
        vehicleContextGate: built.vehicleContext
          ? {
              ok: built.vehicleContext.gate.ok,
              code: built.vehicleContext.gate.code,
              missing: built.vehicleContext.gate.missing,
              containsFRoad: built.vehicleContext.routeFacts.containsFRoad,
              recommendedVehicleType: built.vehicleContext.recommendation.vehicleType,
              confirmedFactCount: built.vehicleContext.confirmedFacts.length,
            }
          : null,
        caseAiSemanticKey: selection.caseAiSemanticKey ?? caseContract.semanticKey,
        caseAiMode: selection.caseAiMode ?? caseContract.aiMode,
        validatedPreviewCount: built.validatedPreviews?.length ?? null,
        validatedResolvedCount:
          built.validatedPreviews?.filter((p) => p.resolved).length ?? null,
        ...focusEval,
      },
      insight,
    };
  }

  getInsight(tripId: string, insightId: string): PageInsightGetResponse {
    const insight = this.cache.getById(insightId);
    if (!insight || insight.tripId !== tripId) {
      throw new NotFoundException(`Insight ${insightId} not found`);
    }
    return {
      schema: 'tripnara.nara_page_insight@v1',
      insight,
      status: resolveStatus(insight),
    };
  }

  submitFeedback(
    tripId: string,
    insightId: string,
    body: PageInsightFeedbackRequest,
  ): { ok: true; insightId: string; type: InsightFeedbackType } {
    const insight = this.cache.getById(insightId);
    if (!insight || insight.tripId !== tripId) {
      throw new NotFoundException(`Insight ${insightId} not found`);
    }
    this.feedbackStore.recordFeedback({
      tripId,
      insightId,
      type: body.type,
      actionRef: body.actionRef ?? null,
      note: body.note ?? null,
      clientTimestamp: body.clientTimestamp,
      contextHash: insight.context.contextHash,
      problemId: insight.observation.factRefs
        .find((r) => r.startsWith('decision-problem:'))
        ?.replace('decision-problem:', ''),
    });
    return { ok: true, insightId, type: body.type };
  }
}

function resolveStatus(insight: NaraPageInsight): InsightRecordStatus {
  if (insight.expiresAt && Date.parse(insight.expiresAt) <= Date.now()) {
    return 'STALE';
  }
  return 'ACTIVE';
}

function focusDiagToEvalFields(diag: FocusResolveDiag) {
  return {
    clientSelectedRef: diag.clientSelectedRef ?? null,
    focusResolveStatus: diag.resolveStatus,
    focusMatchedVia: diag.matchedVia ?? null,
    workspacePresentForFocused: diag.workspacePresentForFocused ?? null,
    openProblemIdsSample: diag.openProblemIds.slice(0, 12),
    openInstanceKeysSample: diag.openInstanceKeys.slice(0, 12),
  };
}

export type { PageId };
