import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CanonicalPoiResolutionService } from '../canonical-poi-resolution/services/canonical-poi-resolution.service';
import type { ResolutionResult } from '../canonical-poi-resolution/types/canonical-poi.types';
import type { ConstraintEvaluationGatewayService } from '../decision-runtime/constraints/constraint-evaluation.gateway.service';
import type { CompilationResult, CompileIssue, PhaseReport } from './contracts/compilation-result.types';
import type { PlannerDraftIR, PlannerDraftSlot } from './contracts/planner-draft-ir.types';
import {
  COMPILE_PHASE_ORDER,
  type CompilePhase,
  type TravelCompilerOptions,
} from './contracts/travel-compiler.types';
import { COMPILATION_RESULT_SCHEMA_ID } from './contracts/compilation-result.types';
import { CTRE_PRODUCT_MODULE } from './constants/ctre.constants';
import {
  buildCanonicalTravelGraph,
  type SlotResolutionMap,
} from './utils/travel-graph-builder.util';
import { applyTravelSemanticAndLinking } from './linking/apply-travel-linking.util';
import { applyRouteResolution, countRouteSlots } from './resolution/apply-route-resolution.util';
import { validateCompileConstraints } from './validation/compile-constraint.validator';
import {
  evaluateCompileConstraintGateway,
  isTravelCompilerGatewayEnabled,
} from './validation/compile-gateway.validator';
import {
  buildPlannerDraftFromGuideDraft,
  buildPlannerDraftFromPoiNames,
} from './utils/planner-draft-builder.util';
import { graphToItinerary } from './projection/graph-to-itinerary.util';

function isPoiResolvableSlot(slot: PlannerDraftSlot): boolean {
  return slot.hintType === 'poi' || slot.hintType === 'activity' || slot.hintType === 'stay';
}

function emptyPhaseReport(phase: CompilePhase): PhaseReport {
  return { phase, status: 'pending' };
}

function startPhase(report: PhaseReport): PhaseReport {
  return {
    ...report,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
}

function finishPhase(report: PhaseReport, summary?: string, counters?: PhaseReport['counters']): PhaseReport {
  const startedAt = report.startedAt ? Date.parse(report.startedAt) : Date.now();
  return {
    ...report,
    status: 'done',
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    summary,
    counters,
  };
}

@Injectable()
export class TravelCompilerService {
  private readonly logger = new Logger(TravelCompilerService.name);

  constructor(
    private readonly cpre: CanonicalPoiResolutionService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly constraintGateway?: ConstraintEvaluationGatewayService,
  ) {}

  async compileFromPoiMentions(input: {
    names: string[];
    countryCode: string;
    tripId?: string;
    requestId?: string;
    source?: PlannerDraftIR['source'];
  }): Promise<CompilationResult> {
    const draft = buildPlannerDraftFromPoiNames(input);
    return this.compile(draft, {
      countryCode: input.countryCode,
      allowPartialGraph: true,
    });
  }

  async compileFromGuideDraft(input: {
    draft: import('../guide-to-plan/services/guide-plan-builder.service').GuideItineraryDraft;
    countryCode: string;
    tripId?: string;
  }): Promise<CompilationResult> {
    const plannerDraft = buildPlannerDraftFromGuideDraft(input);
    return this.compile(plannerDraft, {
      countryCode: input.countryCode,
      allowPartialGraph: true,
    });
  }

  projectItineraryFromGraph(graph: import('./contracts/canonical-travel-graph.types').CanonicalTravelGraph) {
    return graphToItinerary(graph);
  }

  async compile(input: PlannerDraftIR, options?: TravelCompilerOptions): Promise<CompilationResult> {
    const compileId = randomUUID();
    const startedAt = new Date().toISOString();
    const phaseReports: PhaseReport[] = COMPILE_PHASE_ORDER.map(emptyPhaseReport);
    const warnings: CompileIssue[] = [];
    const errors: CompileIssue[] = [];
    const countryCode = (options?.countryCode ?? input.destination.countryCode ?? 'IS').toUpperCase();

    const setReport = (phase: CompilePhase, report: PhaseReport) => {
      const idx = COMPILE_PHASE_ORDER.indexOf(phase);
      if (idx >= 0) phaseReports[idx] = report;
    };

    // ① LEXICAL — slots already structured in PlannerDraftIR
    setReport('LEXICAL', finishPhase(startPhase(phaseReports[0]!), `slots=${countSlots(input)}`));

    // ② CANONICALIZATION — CPRE batch
    setReport('CANONICALIZATION', startPhase(phaseReports[1]!));
    const resolutions = await this.canonicalizeSlots(input, countryCode, warnings, errors);
    const poiTotal = countPoiSlots(input);
    const poiDone = [...resolutions.values()].filter((r) => r.status === 'MATCHED').length;
    setReport(
      'CANONICALIZATION',
      finishPhase(phaseReports[1]!, `poi ${poiDone}/${poiTotal}`, {
        POI: { done: poiDone, total: poiTotal },
      }),
    );

    // ③ GRAPH_CONSTRUCTION — day + POI nodes from draft
    setReport('GRAPH_CONSTRUCTION', startPhase(phaseReports[2]!));
    let graph = buildCanonicalTravelGraph({ draft: input, compileId, resolutions });
    graph.stats.nodeCount = graph.nodes.length;
    graph.stats.edgeCount = graph.edges.length;
    setReport(
      'GRAPH_CONSTRUCTION',
      finishPhase(phaseReports[2]!, `nodes=${graph.stats.nodeCount} poi=${graph.stats.poiResolved}`),
    );

    // ④ ROUTE_RESOLUTION — CTRE Module 2 template expansion
    setReport('ROUTE_RESOLUTION', startPhase(phaseReports[3]!));
    const routeSlotTotal = countRouteSlots(input, countryCode);
    const routeOut = applyRouteResolution({
      graph,
      draft: input,
      countryCode,
      warnings,
      errors,
    });
    graph = routeOut.graph;
    setReport(
      'ROUTE_RESOLUTION',
      finishPhase(
        phaseReports[3]!,
        `routes=${routeOut.stats.templatesMatched}/${routeOut.stats.templatesTotal} segments=${routeOut.stats.segmentsAdded}`,
        {
          Route: {
            done: routeOut.stats.templatesMatched,
            total: Math.max(routeOut.stats.templatesTotal, routeSlotTotal, 1),
          },
        },
      ),
    );

    // ⑤ SEMANTIC + ⑥ LINKING — destination pack rules (Iceland MVP)
    setReport('SEMANTIC', startPhase(phaseReports[4]!));
    setReport('LINKING', startPhase(phaseReports[5]!));
    const linkOut = applyTravelSemanticAndLinking(graph, countryCode);
    graph = linkOut.graph;
    setReport(
      'SEMANTIC',
      finishPhase(phaseReports[4]!, `intentTagged=${linkOut.stats.intentTagged}`),
    );
    setReport(
      'LINKING',
      finishPhase(
        phaseReports[5]!,
        `deps=${linkOut.stats.dependenciesAdded} bookings=${linkOut.stats.bookingsAdded}`,
        {
          Dependency: {
            done: graph.stats.dependencySatisfied,
            total: Math.max(graph.stats.dependencyTotal, 1),
          },
        },
      ),
    );

    // ⑦ VALIDATION — structural + compile-time constraints
    setReport('VALIDATION', startPhase(phaseReports[6]!));
    this.validateGraph(resolutions, input, warnings, errors);
    const constraintVal = validateCompileConstraints(graph, countryCode);
    warnings.push(...constraintVal.warnings);
    errors.push(...constraintVal.errors);

    if (
      this.constraintGateway &&
      isTravelCompilerGatewayEnabled(this.configService) &&
      options?.skipConstraintGateway !== true
    ) {
      try {
        const gatewayVal = await evaluateCompileConstraintGateway({
          graph,
          gateway: this.constraintGateway,
          tripId: input.tripId,
          countryCode,
        });
        warnings.push(...gatewayVal.warnings);
        errors.push(...gatewayVal.errors);
        graph.constraints.push(...gatewayVal.constraints);
      } catch (err: unknown) {
        warnings.push({
          issueId: randomUUID(),
          severity: 'warning',
          phase: 'VALIDATION',
          code: 'GATEWAY_EVAL_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const bookingRequired = graph.stats.bookingRequired;
    const bookingDone = graph.bookings.filter((b) => b.status === 'booked').length;
    setReport(
      'VALIDATION',
      finishPhase(phaseReports[6]!, `warnings=${warnings.length} errors=${errors.length}`, {
        POI: { done: graph.stats.poiResolved, total: graph.stats.poiResolved + graph.stats.poiUnresolved },
        Route: {
          done: graph.stats.routeTemplatesResolved,
          total: Math.max(graph.stats.routeTemplatesTotal, 1),
        },
        Booking: { done: bookingDone, total: Math.max(bookingRequired, graph.bookings.length) },
        Constraint: {
          done: constraintVal.constraintsSatisfied,
          total: Math.max(constraintVal.constraintsTotal, 1),
        },
        Dependency: {
          done: graph.stats.dependencySatisfied,
          total: Math.max(graph.stats.dependencyTotal, 1),
        },
      }),
    );

    // ⑧ OPTIMIZATION
    if (options?.skipOptimization) {
      setReport('OPTIMIZATION', { phase: 'OPTIMIZATION', status: 'skipped', summary: 'skipOptimization=true' });
    } else {
      setReport('OPTIMIZATION', startPhase(phaseReports[7]!));
      graph = this.optimizeGraph(graph, warnings);
      setReport('OPTIMIZATION', finishPhase(phaseReports[7]!, 'compile-time pass (MVP noop)'));
    }

    const score = computeCompileScore(graph, errors.length, warnings.length);
    const status = resolveCompilationStatus(errors.length, warnings.length, options?.allowPartialGraph);

    if (status === 'failed') {
      this.logger.warn(
        `Travel compile failed compileId=${compileId} errors=${errors.length} score=${score}`,
      );
    } else {
      this.logger.debug(
        `Travel compile ${status} compileId=${compileId} poi=${graph.stats.poiResolved}/${graph.stats.poiResolved + graph.stats.poiUnresolved} score=${score}`,
      );
    }

    return {
      schemaId: COMPILATION_RESULT_SCHEMA_ID,
      compileId,
      status,
      graph: status === 'failed' && !options?.allowPartialGraph ? undefined : graph,
      phaseReports,
      warnings,
      errors,
      score,
      evidenceRefs: [],
      createdAt: startedAt,
      finishedAt: new Date().toISOString(),
      engine: CTRE_PRODUCT_MODULE,
      compileTrigger: options?.compileTrigger ?? 'plan_gen',
    };
  }

  private async canonicalizeSlots(
    input: PlannerDraftIR,
    countryCode: string,
    warnings: CompileIssue[],
    errors: CompileIssue[],
  ): Promise<SlotResolutionMap> {
    const map: SlotResolutionMap = new Map();
    const slots = collectPoiSlots(input);

    if (slots.length === 0) return map;

    const batch = await this.cpre.resolveBatch(
      slots.map(({ slot }) => ({
        name: slot.rawText,
        countryCode,
        tripId: input.tripId,
      })),
    );

    slots.forEach(({ slot, dayIndex }, i) => {
      const result = batch.results[i] ?? ({
        status: 'NOT_FOUND',
        confidence: 0,
        reason: 'missing batch result',
      } as ResolutionResult);
      map.set(slot.slotId, result);
      this.recordResolutionIssue(slot, dayIndex, result, warnings, errors);
    });

    return map;
  }

  private recordResolutionIssue(
    slot: PlannerDraftSlot,
    dayIndex: number,
    result: ResolutionResult,
    warnings: CompileIssue[],
    errors: CompileIssue[],
  ): void {
    if (result.status === 'MATCHED') return;

    const base = {
      issueId: randomUUID(),
      phase: 'CANONICALIZATION' as CompilePhase,
      dayIndex,
      slotId: slot.slotId,
      metadata: { rawText: slot.rawText, status: result.status },
    };

    if (result.status === 'NOT_FOUND') {
      errors.push({
        ...base,
        severity: 'error',
        code: 'POI_NOT_FOUND',
        message: `POI not found: ${slot.rawText}`,
      });
      return;
    }

    warnings.push({
      ...base,
      severity: 'warning',
      code: result.status === 'AMBIGUOUS' ? 'POI_AMBIGUOUS' : 'POI_NEEDS_CONFIRMATION',
      message: `${result.status}: ${slot.rawText}`,
    });
  }

  private validateGraph(
    resolutions: SlotResolutionMap,
    input: PlannerDraftIR,
    warnings: CompileIssue[],
    errors: CompileIssue[],
  ): void {
    for (const day of input.days) {
      for (const slot of day.slots) {
        if (!isPoiResolvableSlot(slot)) continue;
        const result = resolutions.get(slot.slotId);
        if (!result) {
          errors.push({
            issueId: randomUUID(),
            severity: 'error',
            phase: 'VALIDATION',
            code: 'POI_UNRESOLVED',
            message: `No resolution for slot: ${slot.rawText}`,
            dayIndex: day.dayIndex,
            slotId: slot.slotId,
          });
        }
      }
    }

    if (input.days.length === 0) {
      warnings.push({
        issueId: randomUUID(),
        severity: 'warning',
        phase: 'VALIDATION',
        code: 'EMPTY_ITINERARY',
        message: 'Planner draft has no days',
      });
    }
  }

  private optimizeGraph(
    graph: import('./contracts/canonical-travel-graph.types').CanonicalTravelGraph,
    warnings: CompileIssue[],
  ): import('./contracts/canonical-travel-graph.types').CanonicalTravelGraph {
    const seen = new Set<string>();
    for (const node of graph.nodes) {
      if (node.kind !== 'POI' || !node.canonical?.poiId) continue;
      const key = `${node.dayIndex ?? -1}:${node.canonical.poiId}`;
      if (seen.has(key)) {
        warnings.push({
          issueId: randomUUID(),
          severity: 'info',
          phase: 'OPTIMIZATION',
          code: 'DUPLICATE_POI_SAME_DAY',
          message: `Duplicate POI on day ${(node.dayIndex ?? 0) + 1}: ${node.label}`,
          dayIndex: node.dayIndex,
          nodeId: node.nodeId,
        });
      }
      seen.add(key);
    }
    return graph;
  }
}

function countSlots(input: PlannerDraftIR): number {
  return input.days.reduce((n, d) => n + d.slots.length, 0);
}

function countPoiSlots(input: PlannerDraftIR): number {
  return collectPoiSlots(input).length;
}

function collectPoiSlots(input: PlannerDraftIR): Array<{ slot: PlannerDraftSlot; dayIndex: number }> {
  const out: Array<{ slot: PlannerDraftSlot; dayIndex: number }> = [];
  for (const day of input.days) {
    for (const slot of day.slots) {
      if (isPoiResolvableSlot(slot)) out.push({ slot, dayIndex: day.dayIndex });
    }
  }
  return out;
}

function computeCompileScore(
  graph: import('./contracts/canonical-travel-graph.types').CanonicalTravelGraph,
  errorCount: number,
  warningCount: number,
): number {
  const total = graph.stats.poiResolved + graph.stats.poiUnresolved;
  const poiRatio = total > 0 ? graph.stats.poiResolved / total : 1;
  const penalty = errorCount * 15 + warningCount * 5;
  return Math.max(0, Math.min(100, Math.round(poiRatio * 100 - penalty)));
}

function resolveCompilationStatus(
  errorCount: number,
  warningCount: number,
  allowPartialGraph?: boolean,
): CompilationResult['status'] {
  if (errorCount > 0 && !allowPartialGraph) return 'failed';
  if (errorCount > 0 && allowPartialGraph) return 'partial';
  if (warningCount > 0) return 'partial';
  return 'success';
}
