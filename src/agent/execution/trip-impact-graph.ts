import type { PhaseExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import { normalizeItem } from '../../decision/kernel/itinerary.types';
import type { RiskImpactAssessment, RiskImpactEdge, TravelRiskEvent } from './risk-event.types';

interface ImpactNode {
  id: string;
  day: string;
  type?: string;
  poiId?: string;
}

function parseMinutes(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : undefined;
}

function buildNodes(ctx: PhaseExecutorContext): ImpactNode[] {
  const nodes: ImpactNode[] = [];
  for (const day of ctx.itinerary?.days ?? []) {
    const date = String(day.date);
    const items = Array.isArray(day.items) ? day.items : [];
    for (const raw of items) {
      const item = normalizeItem(raw);
      if (!item) continue;
      nodes.push({ id: item.id, day: date, type: item.type, poiId: item.poiId });
    }
  }
  return nodes;
}

export function buildTripImpactEdges(ctx: PhaseExecutorContext): RiskImpactEdge[] {
  const edges: RiskImpactEdge[] = [];
  for (const day of ctx.itinerary?.days ?? []) {
    const items = Array.isArray(day.items) ? day.items : [];
    for (let i = 0; i < items.length - 1; i++) {
      const a = normalizeItem(items[i]);
      const b = normalizeItem(items[i + 1]);
      if (!a || !b) continue;
      const bufferMinutes =
        parseMinutes((items[i + 1] as any)?.metadata?.buffer_minutes) ??
        parseMinutes((items[i + 1] as any)?.metadata?.transfer_buffer_minutes);
      edges.push({
        from: a.id,
        to: b.id,
        dependency: 'TIME_DEPENDENCY',
        ...(bufferMinutes !== undefined ? { bufferMinutes } : {}),
      });
      if (a.location?.geoBucket !== b.location?.geoBucket) {
        edges.push({ from: a.id, to: b.id, dependency: 'LOCATION_DEPENDENCY' });
      }
    }
  }
  return edges;
}

function seedAffectedNodes(event: TravelRiskEvent, nodes: ImpactNode[]): Set<string> {
  const out = new Set<string>();
  const id = event.entityRef.id;
  if (event.entityRef.type === 'DAY' && id) {
    nodes.filter((n) => n.day === id).forEach((n) => out.add(n.id));
  } else if (event.entityRef.type === 'POI' && id) {
    nodes.filter((n) => n.poiId === id || n.id === id).forEach((n) => out.add(n.id));
  } else if (event.entityRef.type === 'SEGMENT' && id) {
    nodes.filter((n) => n.id === id).forEach((n) => out.add(n.id));
  } else if (event.entityRef.type === 'DESTINATION') {
    nodes.slice(0, Math.min(3, nodes.length)).forEach((n) => out.add(n.id));
  } else if (event.entityRef.type === 'FLIGHT') {
    nodes.slice(0, Math.min(2, nodes.length)).forEach((n) => out.add(n.id));
  } else if (event.entityRef.type === 'ROAD') {
    nodes.filter((n) => /DRIVE|TRANSIT|ROAD/i.test(String(n.type ?? ''))).forEach((n) => out.add(n.id));
  }
  return out;
}

function propagate(seed: Set<string>, edges: RiskImpactEdge[], limit = 2): Set<string> {
  const affected = new Set(seed);
  let frontier = new Set(seed);
  for (let depth = 0; depth < limit; depth++) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (frontier.has(edge.from) && !affected.has(edge.to)) {
        affected.add(edge.to);
        next.add(edge.to);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return affected;
}

function recommendedActions(event: TravelRiskEvent): RiskImpactAssessment['recommendedActions'] {
  if (event.category === 'ROAD_ACCESS' || event.category === 'OPENING_CLOSURE') return ['REPLACE', 'ASK_USER'];
  if (event.category === 'TRANSPORT_DISRUPTION') return ['ADD_BUFFER', 'REORDER', 'ASK_USER'];
  if (event.category === 'WEATHER_NATURAL') return ['DELAY', 'REORDER', 'ADD_BUFFER'];
  return ['ASK_USER'];
}

export function assessRiskImpacts(events: TravelRiskEvent[], ctx: PhaseExecutorContext): RiskImpactAssessment[] {
  const nodes = buildNodes(ctx);
  if (events.length === 0 || nodes.length === 0) return [];
  const edges = buildTripImpactEdges(ctx);
  return events.map((event) => {
    const seed = seedAffectedNodes(event, nodes);
    const affected = propagate(seed, edges);
    const affectedItems = Array.from(affected);
    const affectedDays = Array.from(new Set(nodes.filter((n) => affected.has(n.id)).map((n) => n.day)));
    const severity = event.urgency >= 5 || affectedItems.length >= 4 ? 'HIGH' : event.urgency >= 4 || affectedItems.length >= 2 ? 'MEDIUM' : 'LOW';
    return {
      eventId: event.id,
      affectedItems,
      affectedDays,
      severity,
      recommendedActions: recommendedActions(event),
      summaryZh:
        affectedItems.length === 0
          ? '未能在当前行程结构中定位直接受影响项目。'
          : `该风险可能影响 ${affectedDays.length} 天、${affectedItems.length} 个行程项，建议先处理受影响链路再推进原计划。`,
    };
  });
}
