import type { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import type { FeasibilityIssueDto, TripFeasibilityReportDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { RepairOption, RepairOptionsResponse } from '../../readiness/types/coverage-map.types';
import type { TradeoffDimension } from '../types/decision-semantics.types';
import {
  normalizeRepairOptionTradeoffs,
  tradeoffsHaveNumericDelta,
} from './tradeoff.normalizer';

export interface OptionTradeoffResolveContext {
  preloadedReport?: TripFeasibilityReportDto;
  preloadedRepairOptions?: RepairOptionsResponse;
}

/** Options list: enrich direction-only tradeoffs via repair preview when possible. */
export async function resolveOptionTradeoffs(
  feasibility: FeasibilityReportService,
  tripId: string,
  issue: FeasibilityIssueDto,
  option: RepairOption,
  ctx?: OptionTradeoffResolveContext,
): Promise<TradeoffDimension[]> {
  const baseline = normalizeRepairOptionTradeoffs(option, issue);
  if (tradeoffsHaveNumericDelta(baseline)) return baseline;
  if (option.id.startsWith('planb_')) return baseline;

  try {
    const preview = await feasibility.previewRepair(
      tripId,
      issue.id,
      {
        optionId: option.id,
        runGuardianNegotiation: false,
      },
      ctx,
    );
    const enriched = normalizeRepairOptionTradeoffs(option, issue, preview);
    return tradeoffsHaveNumericDelta(enriched) ? enriched : baseline;
  } catch {
    return baseline;
  }
}

export async function resolveOptionTradeoffsBatch(
  feasibility: FeasibilityReportService,
  tripId: string,
  issue: FeasibilityIssueDto,
  options: RepairOption[],
  ctx?: OptionTradeoffResolveContext,
): Promise<Map<string, TradeoffDimension[]>> {
  const batchCtx: OptionTradeoffResolveContext = {
    preloadedReport: ctx?.preloadedReport,
    preloadedRepairOptions:
      ctx?.preloadedRepairOptions ??
      (await feasibility.getRepairOptions(tripId, issue.id, {
        preloadedReport: ctx?.preloadedReport,
      })),
  };

  const entries = await Promise.all(
    options.map(
      async (option) =>
        [option.id, await resolveOptionTradeoffs(feasibility, tripId, issue, option, batchCtx)] as const,
    ),
  );
  return new Map(entries);
}
