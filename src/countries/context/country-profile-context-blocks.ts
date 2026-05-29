/**
 * CountryProfile V2 → ContextBlock projection for CONTEXT_BUILD.
 * Reuses FactsToReadinessCompiler as the single findings source.
 */
import type { ContextBlock, BlockType } from '../../agent/context-engine/types/context-package.types';
import {
  FactsToReadinessCompiler,
  type CountryFacts,
} from '../../trips/readiness/compilers/facts-to-readiness.compiler';
import type {
  ReadinessFinding,
  ReadinessFindingItem,
} from '../../trips/readiness/types/readiness-findings.types';
import type { TripContext } from '../../trips/readiness/types/trip-context.types';
import type { CountryProfileV2DroneRules } from '../types/country-profile-v2.types';

export type CountryProfileContextTopic =
  | 'VISA'
  | 'DRONE'
  | 'ROAD_RULES'
  | 'MONEY'
  | 'SAFETY'
  | 'WEATHER_WINDOWS'
  | 'LOCAL_TRANSPORT'
  | 'BOOKING_NORMS';

export interface BuildContextBlocksFromCountryFactsOptions {
  topics: CountryProfileContextTopic[];
  travelerNationality?: string;
  tripStartDate?: string;
}

export interface BuildContextBlocksFromFindingsOptions {
  topics: CountryProfileContextTopic[];
  countryCode: string;
  countryName?: string;
  travelerNationality?: string;
}

const TOPIC_META: Record<
  CountryProfileContextTopic,
  { type: BlockType; priority: number; titleZh: string }
> = {
  VISA: { type: 'COUNTRY_VISA', priority: 80, titleZh: '入境与签证' },
  DRONE: { type: 'COUNTRY_DRONE', priority: 70, titleZh: '无人机规则' },
  ROAD_RULES: { type: 'COUNTRY_ROAD_RULES', priority: 75, titleZh: '道路与自驾' },
  MONEY: { type: 'COUNTRY_MONEY', priority: 65, titleZh: '支付与货币' },
  SAFETY: { type: 'COUNTRY_SAFETY', priority: 85, titleZh: '安全与紧急联络' },
  WEATHER_WINDOWS: { type: 'COUNTRY_WEATHER', priority: 72, titleZh: '季节与天气窗口' },
  LOCAL_TRANSPORT: { type: 'COUNTRY_TRANSPORT', priority: 60, titleZh: '当地交通' },
  BOOKING_NORMS: { type: 'COUNTRY_BOOKING', priority: 55, titleZh: '预订规范' },
};

function flattenFindingItems(finding: ReturnType<FactsToReadinessCompiler['compile']>): ReadinessFindingItem[] {
  return [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional];
}

function formatFindingLines(items: ReadinessFindingItem[]): string {
  return items
    .map((item) => {
      const tasks = (item.tasks ?? [])
        .map((t) => {
          const title = typeof t.title === 'string' ? t.title : (t.title as { en?: string; zh?: string })?.zh ?? '';
          const due =
            t.dueOffsetDays != null ? ` (提前 ${Math.abs(t.dueOffsetDays)} 天)` : '';
          return `  • ${title}${due}`;
        })
        .join('\n');
      return `- ${item.message}${tasks ? `\n${tasks}` : ''}`;
    })
    .join('\n');
}

function matchesTopic(item: ReadinessFindingItem, topic: CountryProfileContextTopic): boolean {
  const id = item.id;
  switch (topic) {
    case 'VISA':
      return (
        item.category === 'entry_transit' &&
        (id.includes('.entry.') || id.includes('biosecurity'))
      );
    case 'ROAD_RULES':
      return id.includes('.drive.') || id.includes('time.env-triggers');
    case 'SAFETY':
      return id.includes('.safety.') || id.includes('.experience.');
    case 'MONEY':
      return (
        id.includes('.logistics.') &&
        (id.includes('power') ||
          id.includes('cash') ||
          id.includes('tipping') ||
          id.includes('currency'))
      );
    case 'WEATHER_WINDOWS':
      return id.includes('.time.') && !id.includes('env-triggers');
    case 'LOCAL_TRANSPORT':
    case 'BOOKING_NORMS':
      return false;
    default:
      return false;
  }
}

function buildTripContext(
  facts: CountryFacts,
  options: BuildContextBlocksFromCountryFactsOptions,
): TripContext {
  return {
    traveler: { nationality: options.travelerNationality },
    trip: options.tripStartDate ? { startDate: options.tripStartDate } : {},
    itinerary: {
      countries: [facts.isoCode],
      activities: ['self_drive'],
    },
  };
}

function buildDroneBlock(
  facts: CountryFacts,
  meta: (typeof TOPIC_META)['DRONE'],
): ContextBlock | null {
  const drone: CountryProfileV2DroneRules | undefined = facts.complianceInfo?.droneRules;
  if (!drone || (drone.allowed === undefined && !drone.restrictions?.length)) {
    return null;
  }

  const countryName = facts.nameCN || facts.nameEN || facts.isoCode;
  const lines: string[] = [];
  if (drone.allowed === false) {
    lines.push('- 该国禁止或严格限制无人机使用');
  } else {
    lines.push('- 允许使用无人机（须遵守下列限制）');
  }
  if (drone.maxAltitudeMeter != null) {
    lines.push(`- 最大飞行高度：${drone.maxAltitudeMeter} 米`);
  }
  if (drone.requiresRegistration) {
    lines.push(
      `- 需要登记${drone.registrationUrl ? `：${drone.registrationUrl}` : ''}`,
    );
  }
  for (const r of drone.restrictions ?? []) {
    lines.push(`- ${r}`);
  }
  if (drone.prohibitedPoiCategories?.length) {
    lines.push(`- 禁飞 POI 类型：${drone.prohibitedPoiCategories.join(', ')}`);
  }

  const text = `${countryName} ${meta.titleZh}:\n${lines.join('\n')}`;
  const now = new Date().toISOString();

  return {
    key: `COUNTRY_DRONE_${facts.isoCode}_PROFILE`,
    type: meta.type,
    text,
    priority: meta.priority,
    visibility: 'public',
    provenance: {
      source: 'db',
      identifier: `countryProfile:${facts.isoCode}`,
      version: '2',
      timestamp: now,
    },
    data: {
      derivedFrom: 'countryProfile',
      topic: 'DRONE',
      schemaVersion: 2,
      droneRules: drone,
    },
    dataSource: 'FACTS',
    lastVerifiedAt: now,
  };
}

function buildBlockFromItems(
  facts: CountryFacts,
  topic: CountryProfileContextTopic,
  items: ReadinessFindingItem[],
  nationality?: string,
): ContextBlock | null {
  if (items.length === 0) return null;

  const meta = TOPIC_META[topic];
  const countryName = facts.nameCN || facts.nameEN || facts.isoCode;
  const text = `${countryName} ${meta.titleZh}:\n${formatFindingLines(items)}`;
  const now = new Date().toISOString();

  return {
    key: `${meta.type}_${facts.isoCode}_PROFILE`,
    type: meta.type,
    text,
    priority: meta.priority,
    visibility: 'public',
    provenance: {
      source: 'db',
      identifier: `countryProfile:${facts.isoCode}`,
      version: '2',
      timestamp: now,
    },
    data: {
      derivedFrom: 'countryProfile',
      topic,
      schemaVersion: 2,
      nationality: nationality?.toUpperCase(),
      findingIds: items.map((i) => i.id),
    },
    dataSource: 'FACTS',
    lastVerifiedAt: now,
  };
}

/**
 * Phase 3: Context blocks as read-only projection of Readiness Findings (not Pack keyword scrape).
 */
export function buildContextBlocksFromReadinessFinding(
  finding: ReadinessFinding,
  options: BuildContextBlocksFromFindingsOptions,
  droneFacts?: CountryFacts,
): ContextBlock[] {
  const blocks: ContextBlock[] = [];
  const allItems = flattenFindingItems(finding);
  const nationality = options.travelerNationality?.trim().toUpperCase();
  const countryName =
    options.countryName || finding.destinationId || options.countryCode;
  const labelFacts: CountryFacts = {
    isoCode: options.countryCode,
    nameCN: countryName,
  };
  const now = new Date().toISOString();

  for (const topic of options.topics) {
    if (topic === 'DRONE' && droneFacts) {
      const droneBlock = buildDroneBlock(droneFacts, TOPIC_META.DRONE);
      if (droneBlock) {
        blocks.push({
          ...droneBlock,
          data: { ...droneBlock.data, derivedFrom: 'findings', packId: finding.packId },
        });
      }
      continue;
    }
    if (topic === 'LOCAL_TRANSPORT' || topic === 'BOOKING_NORMS') {
      continue;
    }

    const items = allItems.filter((item) => matchesTopic(item, topic));
    const block = buildBlockFromItems(labelFacts, topic, items, nationality);
    if (block) {
      blocks.push({
        ...block,
        key: `${block.type}_${options.countryCode}_FINDINGS`,
        provenance: {
          source: 'db',
          identifier: `findings:${finding.packId ?? options.countryCode}`,
          version: '3',
          timestamp: now,
        },
        data: {
          derivedFrom: 'findings',
          topic,
          packId: finding.packId,
          nationality,
          findingIds: items.map((i) => i.id),
        },
        dataSource: 'FACTS',
        lastVerifiedAt: now,
      });
    }
  }

  return blocks;
}

/**
 * Build ContextBlocks for requested topics from CountryProfile facts.
 */
export function buildContextBlocksFromCountryFacts(
  facts: CountryFacts,
  options: BuildContextBlocksFromCountryFactsOptions,
  compiler: FactsToReadinessCompiler = new FactsToReadinessCompiler(),
): ContextBlock[] {
  const finding = compiler.compile(facts, buildTripContext(facts, options));
  return buildContextBlocksFromReadinessFinding(
    finding,
    {
      topics: options.topics,
      countryCode: facts.isoCode,
      countryName: facts.nameCN || facts.nameEN,
      travelerNationality: options.travelerNationality,
    },
    facts,
  );
}

/** Map Context block type back to pack topic (for missingTopics cleanup). */
export function contextBlockTypeToTopic(type: BlockType): CountryProfileContextTopic | undefined {
  for (const [topic, meta] of Object.entries(TOPIC_META) as Array<
    [CountryProfileContextTopic, (typeof TOPIC_META)[CountryProfileContextTopic]]
  >) {
    if (meta.type === type) return topic;
  }
  return undefined;
}
