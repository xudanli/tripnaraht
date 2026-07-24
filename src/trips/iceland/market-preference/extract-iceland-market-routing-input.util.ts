// src/trips/iceland/market-preference/extract-iceland-market-routing-input.util.ts

import type { AgentMemoryContext } from '../../../agent/memory/interfaces/agent-memory-context.interface';
import type { RouteAndRunRequestDto } from '../../../agent/dto/route-and-run.dto';
import {
  inferMonthFromStartDate,
  inferVehicleClassFromQuery,
  normalizeIsoCountry,
} from './infer-iceland-market-signals.util';
import type { IcelandMarketRoutingInput } from './iceland-market-preference.types';

function inferCountryFromDestination(destination: string | undefined): string | undefined {
  if (!destination) return undefined;
  if (/冰岛|\bIceland\b/i.test(destination)) return 'IS';
  return undefined;
}

export function extractIcelandMarketRoutingInput(
  memory: AgentMemoryContext | null | undefined,
  request?: Pick<
    RouteAndRunRequestDto,
    'message' | 'conversation_context' | 'structured_travel_input'
  > | null,
): IcelandMarketRoutingInput {
  const basics = memory?.userBasics;
  const tp = memory?.travelPreference as Record<string, unknown> | null | undefined;
  const structured = request?.structured_travel_input;

  const residency =
    normalizeIsoCountry(basics?.residencyCountry as string | undefined) ??
    normalizeIsoCountry(tp?.routing_residency_country as string | undefined);
  const nationality =
    normalizeIsoCountry(basics?.nationality as string | undefined) ??
    normalizeIsoCountry(tp?.routing_nationality as string | undefined);

  const locale =
    (request?.conversation_context?.locale as string | undefined) ??
    (tp?.routing_locale as string | undefined);

  const userQuery = request?.message ?? (tp?.routing_user_query as string | undefined);
  const month =
    inferMonthFromStartDate(structured?.start_date) ??
    (typeof tp?.routing_month === 'number' ? tp.routing_month : undefined);

  const countryCode =
    inferCountryFromDestination(structured?.destination) ??
    (tp?.routing_country_code as string | undefined);

  const vehicleClass =
    (tp?.routing_vehicle_class as IcelandMarketRoutingInput['vehicleClass']) ??
    inferVehicleClassFromQuery(userQuery);

  const budgetRaw = tp?.routing_budget_style;
  const budgetStyle =
    budgetRaw === 'low' || budgetRaw === 'medium' || budgetRaw === 'high' ? budgetRaw : undefined;

  return {
    countryCode,
    residencyCountry: residency,
    nationality,
    locale,
    month,
    userQuery,
    vehicleClass,
    budgetStyle,
  };
}
