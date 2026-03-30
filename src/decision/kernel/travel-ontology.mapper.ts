/**
 * Travel vertical ontology → DSO.travelOntologyState
 *
 * Phase A: INTAKE/STATE_UPDATE 将 ontology_context 与 itinerary.action_plan
 * 映射为单一 DSO 子状态，避免平行状态源。
 */

import { createHash } from 'crypto';
import type { DecisionState } from './decision-state.types';
import type { OrchestratorState, TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';

export type TravelOntologyState = NonNullable<DecisionState['travelOntologyState']>;

function digestKey(parts: string[]): string {
  const raw = parts.filter((p) => p != null && String(p).length > 0).join('|');
  const base = raw.length > 0 ? raw : 'empty';
  return createHash('sha256').update(base, 'utf8').digest('hex').slice(0, 16);
}

/** 由 Orchestrator 当前视图构建 travelOntologyState（无数据则 undefined） */
export function buildTravelOntologyStateFromOrchestrator(
  os: OrchestratorState,
): TravelOntologyState | undefined {
  const req = os.trip_plan_request;
  const nouns = req?.ontology_context ? ontologyContextToNouns(req.ontology_context) : undefined;
  const pending = actionPlanToVerbsPending(os.itinerary?.action_plan);
  const tripId = req?.ontology_context?.trip_id;

  const hasNouns = nouns && Object.keys(nouns).length > 0;
  if (!tripId && !hasNouns && pending.length === 0) return undefined;

  const out: TravelOntologyState = {};
  if (tripId) out.tripId = tripId;
  if (hasNouns) out.nouns = nouns;
  if (pending.length > 0) {
    out.verbs = { pending };
  }
  return out;
}

export function ontologyContextToNouns(
  ctx: NonNullable<TripPlanRequest['ontology_context']>,
): NonNullable<TravelOntologyState['nouns']> {
  const nouns: NonNullable<TravelOntologyState['nouns']> = {};

  if (ctx.destination && (ctx.destination.name || ctx.destination.destination_id)) {
    nouns.destination = {
      id: ctx.destination.destination_id ?? digestKey(['dest', ctx.destination.name ?? '', ctx.destination.city_code ?? '']),
      name: ctx.destination.name,
      countryCode: ctx.destination.country_code,
    };
  }

  if (ctx.flights?.length) {
    nouns.flights = ctx.flights.map((f, i) => ({
      id:
        f.flight_id ??
        digestKey(['flight', f.flight_no ?? '', f.departure_time ?? '', String(i)]),
      flightNo: f.flight_no,
      airline: f.airline,
      from: f.departure ?? f.from,
      to: f.arrival ?? f.to,
      departureTime: f.departure_time,
      arrivalTime: f.arrival_time,
      price: f.price,
    }));
  }

  if (ctx.hotels?.length) {
    nouns.hotels = ctx.hotels.map((h, i) => ({
      id: h.hotel_id ?? digestKey(['hotel', h.name ?? '', h.check_in ?? '', String(i)]),
      name: h.name,
      checkIn: h.check_in,
      checkOut: h.check_out,
      nightlyPrice: h.nightly_price,
      roomAvailable: h.room_available,
    }));
  }

  if (ctx.transportations?.length) {
    nouns.transportation = ctx.transportations.map((t, i) => ({
      id: digestKey(['tr', t.mode, t.provider ?? '', String(i)]),
      mode: t.mode,
      provider: t.provider,
      etaMinutes: t.eta_minutes,
      costEstimate: t.cost_estimate,
    }));
  }

  if (ctx.activities?.length) {
    nouns.activities = ctx.activities.map((a, i) => ({
      id: a.activity_id ?? digestKey(['act', a.name ?? '', a.start_time ?? '', String(i)]),
      name: a.name,
      type: a.type,
      startTime: a.start_time,
      endTime: a.end_time,
      location: a.location,
      price: a.price,
    }));
  }

  return nouns;
}

type VerbPending = NonNullable<NonNullable<TravelOntologyState['verbs']>['pending']>[number];

export function actionPlanToVerbsPending(
  plan: NonNullable<NonNullable<OrchestratorState['itinerary']>['action_plan']> | undefined,
): VerbPending[] {
  if (!plan?.length) return [];
  return plan.map((p) => ({
    actionId: p.action_id,
    verb: p.action_type,
    targetType: p.target_type,
    targetRef: p.target_ref,
    requiresConfirmation: p.requires_confirmation,
    riskLevel: p.risk_level,
  }));
}

/**
 * DSO 为主：合并已有 travelOntologyState 与本轮 Orchestrator 投影。
 * - nouns：incoming 字段显式出现时更新（空数组表示清除该类名词）
 * - verbs：incoming 显式出现时合并；pending 可由空数组清空
 */
export function mergeTravelOntologyState(
  base: DecisionState['travelOntologyState'],
  incoming: DecisionState['travelOntologyState'],
): DecisionState['travelOntologyState'] | undefined {
  if (!incoming && !base) return undefined;
  if (!incoming) return base;
  if (!base) return incoming;

  const nouns = mergeOntologyNouns(base.nouns, incoming.nouns);
  const verbs = mergeOntologyVerbs(base.verbs, incoming.verbs);
  const tripId = incoming.tripId ?? base.tripId;

  const out: TravelOntologyState = {};
  if (tripId !== undefined) out.tripId = tripId;
  if (nouns !== undefined && Object.keys(nouns).length > 0) out.nouns = nouns;
  else if (base.nouns && incoming.nouns === undefined) out.nouns = base.nouns;

  if (verbs !== undefined) out.verbs = verbs;
  else if (base.verbs) out.verbs = base.verbs;

  if (out.tripId === undefined && !out.nouns && !out.verbs) return base;
  return out;
}

function mergeOntologyNouns(
  base?: TravelOntologyState['nouns'],
  incoming?: TravelOntologyState['nouns'],
): TravelOntologyState['nouns'] | undefined {
  if (!base && !incoming) return undefined;
  const out: NonNullable<TravelOntologyState['nouns']> = { ...(base ?? {}) };
  if (!incoming) return Object.keys(out).length ? out : undefined;

  const applyArr = <K extends keyof NonNullable<TravelOntologyState['nouns']>>(key: K) => {
    const inc = incoming[key];
    if (inc === undefined) return;
    if (Array.isArray(inc) && inc.length > 0) (out as any)[key] = inc;
    else if (Array.isArray(inc) && inc.length === 0) delete (out as any)[key];
  };

  applyArr('flights');
  applyArr('hotels');
  applyArr('activities');
  applyArr('transportation');

  if (incoming.destination !== undefined) {
    out.destination =
      incoming.destination && Object.keys(incoming.destination).length > 0
        ? { ...base?.destination, ...incoming.destination }
        : undefined;
    if (!out.destination) delete (out as any).destination;
  }

  return Object.keys(out).length ? out : undefined;
}

function mergeOntologyVerbs(
  base?: TravelOntologyState['verbs'],
  incoming?: TravelOntologyState['verbs'],
): TravelOntologyState['verbs'] | undefined {
  if (!base && !incoming) return undefined;
  if (!incoming) return base;
  if (!base) {
    return {
      pending: incoming.pending,
      committed: incoming.committed ?? [],
      rolledBack: incoming.rolledBack ?? [],
    };
  }

  const pending = incoming.pending !== undefined ? incoming.pending : base.pending;
  const committed = incoming.committed !== undefined ? incoming.committed : base.committed;
  const rolledBack = incoming.rolledBack !== undefined ? incoming.rolledBack : base.rolledBack;

  return {
    pending,
    committed: committed ?? [],
    rolledBack: rolledBack ?? [],
  };
}

/**
 * Action commit 成功后合并已提交 action_id（调用方持 DSO/payload 时自行 merge 回状态）。
 */
export function appendCommittedActionIds(
  current: DecisionState['travelOntologyState'],
  acceptedActionIds: string[],
): DecisionState['travelOntologyState'] | undefined {
  const ids = acceptedActionIds.filter(Boolean);
  if (!ids.length) return current;
  const committed = [...new Set([...(current?.verbs?.committed ?? []), ...ids])];
  return {
    ...(current ?? {}),
    verbs: {
      pending: current?.verbs?.pending,
      committed,
      rolledBack: current?.verbs?.rolledBack ?? [],
    },
  };
}
