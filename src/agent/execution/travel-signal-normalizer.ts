import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { TravelSignalEvent } from './travel-signal.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTravelSignals(dso: DecisionState, ctx: PhaseExecutorContext): TravelSignalEvent[] {
  const out: TravelSignalEvent[] = [];
  const raw = ctx.researchData?.__travel_signals;
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!isRecord(row)) continue;
      const type = String(row.type ?? '').trim().toUpperCase();
      if (
        type !== 'WEATHER_CHANGED' &&
        type !== 'ROAD_CLOSED' &&
        type !== 'FLIGHT_DELAYED' &&
        type !== 'FLIGHT_CANCELLED' &&
        type !== 'POI_CLOSED' &&
        type !== 'SAFETY_ALERT' &&
        type !== 'DATA_STALE'
      ) {
        continue;
      }
      const observedAt = String(row.observedAt ?? row.observed_at ?? '').trim();
      if (!observedAt) continue;
      const entity = isRecord(row.entityRef) ? row.entityRef : {};
      out.push({
        id: String(row.id ?? `${type}_${observedAt}`),
        type,
        entityRef: {
          type: String(entity.type ?? 'OTHER').toUpperCase() as TravelSignalEvent['entityRef']['type'],
          ...(entity.id !== undefined ? { id: String(entity.id) } : {}),
        },
        observedAt,
        source: String(row.source ?? 'researchData.__travel_signals'),
        severity: row.severity === 'HIGH' || row.severity === 'MEDIUM' || row.severity === 'LOW' ? row.severity : 'MEDIUM',
        payload: isRecord(row.payload) ? row.payload : undefined,
      });
    }
  }

  const flights = dso.environmentState?.flights;
  if (Array.isArray(flights)) {
    for (const f of flights) {
      if (!isRecord(f)) continue;
      const status = String(f.status ?? '').toLowerCase();
      const flight = String(f.flight ?? f.id ?? 'flight');
      const observedAt = String(f.observedAt ?? f.updatedAt ?? f.data_timestamp ?? '').trim();
      if (!observedAt) continue;
      if (/cancelled|canceled/.test(status)) {
        out.push({
          id: `signal_flight_cancelled_${flight}`,
          type: 'FLIGHT_CANCELLED',
          entityRef: { type: 'FLIGHT', id: flight },
          observedAt,
          source: 'environmentState.flights',
          severity: 'HIGH',
          payload: { status },
        });
      } else if (/delayed|diverted|disrupted/.test(status)) {
        out.push({
          id: `signal_flight_delayed_${flight}`,
          type: 'FLIGHT_DELAYED',
          entityRef: { type: 'FLIGHT', id: flight },
          observedAt,
          source: 'environmentState.flights',
          severity: 'HIGH',
          payload: { status },
        });
      }
    }
  }

  const weatherRisk = Number(dso.environmentState?.weatherRisk);
  if (Number.isFinite(weatherRisk) && weatherRisk >= 0.7) {
    out.push({
      id: `signal_weather_changed_${ctx.requestId}`,
      type: 'WEATHER_CHANGED',
      entityRef: { type: 'DESTINATION', id: String(ctx.tripPlanRequest?.destination ?? '') || ctx.requestId },
      observedAt: new Date().toISOString(),
      source: 'environmentState.weatherRisk',
      severity: weatherRisk >= 0.9 ? 'HIGH' : 'MEDIUM',
      payload: { weatherRisk },
    });
  }

  const unique = new Map<string, TravelSignalEvent>();
  for (const signal of out) unique.set(signal.id, signal);
  return Array.from(unique.values());
}
