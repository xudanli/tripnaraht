import { randomUUID } from 'crypto';
import { ROUTE_TEMPLATE_INTENT_CATALOG } from '../config/route-template-intent-bindings.config';
import type {
  ActiveTripReplayFlywheelMetrics,
  RouteTemplateBackflowExampleRecord,
  RouteTemplateTripBackflowPreview,
} from '../types/active-trip-decision-replay.types';
import { ROUTE_TEMPLATE_BACKFLOW_VERSION } from '../types/active-trip-decision-replay.types';

export interface MatchSquareBackflowTemplateMetadata {
  version: typeof ROUTE_TEMPLATE_BACKFLOW_VERSION;
  examples: RouteTemplateBackflowExampleRecord[];
}

export function resolveCatalogEntry(catalogId: string) {
  return ROUTE_TEMPLATE_INTENT_CATALOG.find((e) => e.catalogId === catalogId) ?? null;
}

export function buildBackflowExampleRecord(input: {
  preview: RouteTemplateTripBackflowPreview;
  catalogId: string;
  flywheelMetrics: ActiveTripReplayFlywheelMetrics;
  timelineEventCount: number;
  note?: string | null;
  at?: string;
}): RouteTemplateBackflowExampleRecord {
  return {
    exampleId: randomUUID(),
    version: ROUTE_TEMPLATE_BACKFLOW_VERSION,
    catalogId: input.catalogId,
    committedAt: input.at ?? new Date().toISOString(),
    anonymizedCrewSize: input.preview.anonymizedCrewSize,
    titleZh: input.preview.suggestedExampleTitleZh,
    summaryZh: input.preview.suggestedExampleSummaryZh,
    featureTags: [...input.preview.featureTags],
    flywheelMetrics: input.flywheelMetrics,
    timelineEventCount: input.timelineEventCount,
    note: input.note ?? null,
  };
}

export function readBackflowMetadata(metadata: unknown): MatchSquareBackflowTemplateMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).matchSquareBackflow_v1;
  if (!raw || typeof raw !== 'object') return null;
  const block = raw as MatchSquareBackflowTemplateMetadata;
  if (block.version !== ROUTE_TEMPLATE_BACKFLOW_VERSION || !Array.isArray(block.examples)) {
    return null;
  }
  return block;
}

export function appendBackflowExampleToTemplateMetadata(
  metadata: unknown,
  example: RouteTemplateBackflowExampleRecord,
): Record<string, unknown> {
  const prev =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  const existing = readBackflowMetadata(metadata);
  const examples = existing ? [...existing.examples, example] : [example];

  return {
    ...prev,
    matchSquareBackflow_v1: {
      version: ROUTE_TEMPLATE_BACKFLOW_VERSION,
      examples: examples.slice(-20),
    },
  };
}

export function readTripBackflowCommit(metadata: unknown): {
  committedAt: string;
  routeTemplateId: number;
  exampleId: string;
} | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).matchSquareTemplateBackflowCommit;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.committedAt !== 'string' || typeof o.exampleId !== 'string') return null;
  if (typeof o.routeTemplateId !== 'number') return null;
  return {
    committedAt: o.committedAt,
    routeTemplateId: o.routeTemplateId,
    exampleId: o.exampleId,
  };
}
