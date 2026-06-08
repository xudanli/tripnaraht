import { ROUTE_TEMPLATE_INTENT_CATALOG } from '../config/route-template-intent-bindings.config';
import { resolveCatalogEntry } from './route-template-backflow.engine';
import type { VibeLlmParsePayload, VibeLlmParseView } from '../types/vibe-llm.types';
import type {
  RouteTemplateIntentCatalogEntry,
  RouteTemplateIntentMatchPlan,
} from '../types/route-template-intent.types';
import { ROUTE_TEMPLATE_INTENT_VERSION } from '../types/route-template-intent.types';
import type {
  LaunchRecruitmentFromTemplateInput,
  RouteTemplateBindingView,
  RouteTemplateLaunchSnapshot,
} from '../types/route-template-launch-recruitment.types';
import { ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_VERSION } from '../types/route-template-launch-recruitment.types';
import { buildVibeLlmParseViewFromPayload } from './vibe-llm-parse.engine';
import { buildTrekkingVibeOrchestrationPlan } from './trekking-vibe-orchestration.engine';

export const ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_KEY = '_routeTemplateLaunch' as const;

export function readCatalogIdFromTemplateMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata as Record<string, unknown>;
  const direct = raw.matchSquareCatalogId ?? raw.catalogId;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = raw.matchSquare;
  if (nested && typeof nested === 'object') {
    const catalogId = (nested as Record<string, unknown>).catalogId;
    if (typeof catalogId === 'string' && catalogId.trim()) return catalogId.trim();
  }
  return null;
}

export function resolveCatalogEntryForRouteTemplate(input: {
  routeDirectionName: string;
  durationDays: number;
  templateMetadata?: unknown;
}): RouteTemplateIntentCatalogEntry | null {
  const fromMeta = readCatalogIdFromTemplateMetadata(input.templateMetadata);
  if (fromMeta) {
    return resolveCatalogEntry(fromMeta);
  }

  const exact = ROUTE_TEMPLATE_INTENT_CATALOG.find(
    (e) =>
      e.routeDirectionName === input.routeDirectionName && e.durationDays === input.durationDays,
  );
  if (exact) return exact;

  return (
    ROUTE_TEMPLATE_INTENT_CATALOG.find((e) => e.routeDirectionName === input.routeDirectionName) ??
    null
  );
}

export function buildForcedRouteTemplateMatchPlan(
  entry: RouteTemplateIntentCatalogEntry,
): RouteTemplateIntentMatchPlan {
  return {
    version: ROUTE_TEMPLATE_INTENT_VERSION,
    primaryMatch: {
      catalogId: entry.catalogId,
      routeDirectionName: entry.routeDirectionName,
      durationDays: entry.durationDays,
      titleZh: entry.titleZh,
      subtitleZh: entry.subtitleZh ?? null,
      matchScore: 1,
      matchPercent: 100,
      confidence: 'highlight',
      physicalConstraints: [...(entry.physicalConstraints ?? [])],
      slotAugmentations: [...(entry.slotAugmentations ?? [])],
      vaultMilestoneIds: [...(entry.vaultMilestoneIds ?? [])],
      launchRecruitmentAction: 'confirm_template',
    },
    suggestions: [],
    associationHint: `🗺️ 已绑定路线模板：《${entry.titleZh}》`,
  };
}

export function buildLaunchRecruitmentPostFields(input: {
  catalog: RouteTemplateIntentCatalogEntry;
  templateName: string | null;
  routeDirectionNameCn: string;
  dto: LaunchRecruitmentFromTemplateInput;
}): {
  destination: string;
  itinerarySummary: string;
  captainMessage: string | null;
  preferenceNotes: string | null;
} {
  const destination = input.routeDirectionNameCn || input.catalog.titleZh.split('·')[0]?.trim() || '路线目的地';
  const subtitle = input.catalog.subtitleZh ? ` · ${input.catalog.subtitleZh}` : '';
  const templateLabel = input.templateName?.trim() || input.catalog.titleZh;
  const itinerarySummary = `${templateLabel}${subtitle}`.slice(0, 500);
  const captainMessage =
    input.dto.captainMessage?.trim() ||
    `以此路线模板《${input.catalog.titleZh}》发起车队招募，强绑定 GPS/DEM/里程碑与拼图槽位。`;

  const constraintNote =
    input.catalog.physicalConstraints?.length &&
    `模板物理约束：${input.catalog.physicalConstraints.join('、')}`;
  const preferenceNotes =
    input.dto.preferenceNotes?.trim() ||
    (constraintNote ? constraintNote.slice(0, 2000) : null);

  return {
    destination,
    itinerarySummary,
    captainMessage,
    preferenceNotes,
  };
}

function mapPlanningStyleToTeamworkModel(
  planningStyle: LaunchRecruitmentFromTemplateInput['planningStyle'],
): VibeLlmParsePayload['teamwork_contract_model'] {
  if (planningStyle === 'full_managed') return 'Full-Service';
  if (planningStyle === 'casual_play') return 'Improvisational';
  return 'Co-Creation';
}

export function buildLaunchVibeParseView(input: {
  catalog: RouteTemplateIntentCatalogEntry;
  fields: ReturnType<typeof buildLaunchRecruitmentPostFields>;
  routeTemplateMatch: RouteTemplateIntentMatchPlan;
  planningStyle: LaunchRecruitmentFromTemplateInput['planningStyle'];
}): VibeLlmParseView {
  const scriptId = input.catalog.recruitmentScriptIds?.[0] ?? null;
  const sourceText = [input.fields.itinerarySummary, input.fields.captainMessage]
    .filter(Boolean)
    .join('\n')
    .trim();

  const payload: VibeLlmParsePayload = {
    vibe_chips: [
      {
        id: 'route_template_bound',
        label: '路线模板强绑定',
      },
    ],
    teamwork_contract_model: mapPlanningStyleToTeamworkModel(input.planningStyle),
    hard_gates: {
      budget_range: null,
      education_baseline: 'None',
      industry_preference: [],
      security_level: 'Standard',
    },
    slot_definitions: (input.catalog.slotAugmentations ?? []).map((slot, index) => ({
      slot_id: index + 1,
      expected_tag: slot.expectedTagSuffix,
      reason: `模板驱动：${slot.reason}`,
    })),
    behavioral_contracts: [],
    contract_hint: input.routeTemplateMatch.associationHint,
    parse_source: 'rules',
    parse_version: 'vibe_llm_v2',
    source_text: sourceText,
    derived_fields: {
      itinerary_summary: input.fields.itinerarySummary,
      captain_message: input.fields.captainMessage ?? '',
    },
    recruitment_script_id: scriptId,
    recruitment_scene_category: scriptId?.includes('trek') ? 'premium_trekking' : null,
  };

  const baseView = buildVibeLlmParseViewFromPayload(payload);
  const trekkingOrchestration =
    buildTrekkingVibeOrchestrationPlan(payload) ?? baseView.trekkingOrchestration;

  return {
    ...baseView,
    suggestedItinerarySummary: input.fields.itinerarySummary,
    suggestedCaptainMessage: input.fields.captainMessage ?? '',
    trekkingOrchestration,
    routeTemplateMatch: input.routeTemplateMatch,
  };
}

export function buildRouteTemplateLaunchSnapshot(input: {
  routeTemplateId: number;
  routeTemplateUuid: string;
  catalog: RouteTemplateIntentCatalogEntry;
  at?: string;
}): RouteTemplateLaunchSnapshot {
  return {
    version: ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_VERSION,
    routeTemplateId: input.routeTemplateId,
    routeTemplateUuid: input.routeTemplateUuid,
    catalogId: input.catalog.catalogId,
    routeDirectionName: input.catalog.routeDirectionName,
    durationDays: input.catalog.durationDays,
    titleZh: input.catalog.titleZh,
    launchedAt: input.at ?? new Date().toISOString(),
  };
}

export function attachRouteTemplateLaunchSnapshot<T extends object>(
  snapshot: T,
  launch: RouteTemplateLaunchSnapshot,
): T & Record<typeof ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_KEY, RouteTemplateLaunchSnapshot> {
  return { ...snapshot, [ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_KEY]: launch };
}

export function readRouteTemplateLaunchFromSnapshot(raw: unknown): RouteTemplateLaunchSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = (raw as Record<string, unknown>)[ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_KEY];
  if (!stored || typeof stored !== 'object') return null;
  const launch = stored as RouteTemplateLaunchSnapshot;
  if (launch.version !== ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_VERSION) return null;
  if (typeof launch.routeTemplateId !== 'number' || typeof launch.catalogId !== 'string') return null;
  return launch;
}

export function toRouteTemplateBindingView(
  launch: RouteTemplateLaunchSnapshot,
): RouteTemplateBindingView {
  return {
    routeTemplateId: launch.routeTemplateId,
    routeTemplateUuid: launch.routeTemplateUuid,
    catalogId: launch.catalogId,
    routeDirectionName: launch.routeDirectionName,
    durationDays: launch.durationDays,
    titleZh: launch.titleZh,
    launchedAt: launch.launchedAt,
  };
}
