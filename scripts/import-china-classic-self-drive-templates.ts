#!/usr/bin/env npx tsx
/**
 * 将中国经典/小众自驾线目录 + 按日骨架导入为 RouteDirection + RouteTemplate。
 *
 *   npx tsx scripts/import-china-classic-self-drive-templates.ts
 *   npx tsx scripts/import-china-classic-self-drive-templates.ts --dry-run
 *
 * 导入后建议绑定 Place：
 *   npx tsx scripts/bind-china-classic-template-places.ts
 *
 * 匹配键：RouteDirection.name = CN_CLASSIC_<ROUTE_SUFFIX>
 * Template.uuid = cn-classic-<routeId>-<variantId>
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

type RouteRow = {
  id: string;
  aliases: string[];
  nameCN: string;
  nameEN: string;
  tier: string;
  regions: string[];
  typicalDays?: number[];
  distanceKmHint?: number;
  severity: string;
  summaryCN: string;
  summaryEN: string;
  mustHintsCN?: string[];
  anchorPlaces?: string[];
  taxonomySubScopeId?: string;
};

type DayStop = {
  day: number;
  from: string;
  to: string;
  driveKmHint?: number;
  overnight?: string;
  highlights?: string[];
  notesCN?: string;
};

type Variant = {
  id: string;
  days: number;
  labelCN: string;
  labelEN?: string;
  stops: DayStop[];
};

function routeDirectionName(routeId: string): string {
  // cn.route.g318 -> CN_CLASSIC_G318 ; cn.route.qinggan_loop -> CN_CLASSIC_QINGGAN_LOOP
  const suffix = routeId.replace(/^cn\.route\./i, '').toUpperCase();
  return `CN_CLASSIC_${suffix}`;
}

function templateUuid(routeId: string, variantId: string): string {
  return `cn-classic-${routeId.replace(/\./g, '-')}-${variantId}`;
}

/** 主题/节奏标签，不是可绑定景点（到达城由 to 生成 CITY） */
const NON_PLACE_HIGHLIGHT_RE =
  /^(缓冲|返程|适应|休整|整备|轻游|起步|终点|抵|渐进|降海拔|高原|检修|补给|出征|短距|天气|深度|强制|预留|汇入|滇藏|黄土|秦岭|秦巴|巴山|乌江|村寨|传统村落|南段|天山|草原|长江|西安缓冲|入藏|出入境|阿里|新藏|接日|轻活动|金沙江|北线|羌塘|通行|过境)/;

function normalizePlaceKey(name: string): string {
  return name
    .trim()
    .replace(/（[^）]*）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/(周边|一带|方向|附近|或盐井|\/中转)$/g, '')
    .replace(/\s+/g, '');
}

function samePlace(a?: string | null, b?: string | null): boolean {
  if (!a || !b || a === '—' || b === '—') return false;
  const na = normalizePlaceKey(a);
  const nb = normalizePlaceKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // 仅允许「短名是完整市/县/镇」且长名以其为前缀（避免 嘉峪关⊂嘉峪关关城 误伤景点）
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return (
    shorter.length >= 2 &&
    /[市县镇]$/.test(shorter) &&
    longer.startsWith(shorter)
  );
}

function isNonPlaceHighlight(label: string): boolean {
  const t = label.trim();
  if (!t || t === '—') return true;
  if (NON_PLACE_HIGHLIGHT_RE.test(t)) return true;
  // 含斜杠的节奏词，如「适应/轻游」「缓冲/返程」「出入境/通行核验」
  if (
    /[\/／]/.test(t) &&
    /(缓冲|返程|适应|休整|轻游|整备|通行|出入境|核验)/.test(t)
  ) {
    return true;
  }
  return false;
}

function isStayDay(stop: DayStop): boolean {
  return Boolean(stop.from && stop.to && stop.from !== '—' && samePlace(stop.from, stop.to));
}

/**
 * 按日生成 dayPlans.pois：
 * - highlights → ATTRACTION（跳过主题词、与 from/to/overnight 同名的城镇）
 * - 到达城仅在「行驶到达日」写入一次 CITY（停留日不再重复）
 * - overnight 只留在 day.overnight 字段，不再塞 TOWN POI（避免跨天重复）
 * - 同名景点跨天只保留首次出现
 */
function stopsToDayPlans(stops: DayStop[]) {
  const usedAttractionKeys = new Set<string>();
  const usedCityKeys = new Set<string>();

  return stops.map((stop) => {
    const pois: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const pushPoi = (
      nameCN: string,
      priority: 'MUST_SEE' | 'HIGH' | 'MEDIUM',
      category: string,
    ) => {
      const key = nameCN.trim();
      if (!key || key === '—' || seen.has(key)) return;
      seen.add(key);
      pois.push({
        nameCN: key,
        category,
        priority,
        required: priority === 'MUST_SEE',
        durationMinutes: priority === 'MUST_SEE' ? 90 : 60,
      });
    };

    for (const h of stop.highlights ?? []) {
      const label = h.trim();
      if (isNonPlaceHighlight(label)) continue;
      if (
        samePlace(label, stop.from) ||
        samePlace(label, stop.to) ||
        samePlace(label, stop.overnight)
      ) {
        continue;
      }
      const attrKey = normalizePlaceKey(label);
      if (usedAttractionKeys.has(attrKey)) continue;
      usedAttractionKeys.add(attrKey);
      pushPoi(label, 'HIGH', 'ATTRACTION');
    }

    // 仅行驶到达日写入城市枢纽；停留/缓冲日依赖 overnight，不重复 CITY
    if (stop.to && stop.to !== '—' && !isStayDay(stop)) {
      const cityKey = normalizePlaceKey(stop.to);
      if (cityKey && !usedCityKeys.has(cityKey)) {
        usedCityKeys.add(cityKey);
        pushPoi(stop.to, 'MUST_SEE', 'CITY');
      }
    }

    return {
      day: stop.day,
      theme: `${stop.from}→${stop.to}`,
      overnight: stop.overnight,
      driveKmHint: stop.driveKmHint,
      notes: stop.notesCN || undefined,
      pois,
    };
  });
}

async function upsertDirection(route: RouteRow, defaultVariant: Variant | null) {
  const name = routeDirectionName(route.id);
  const tags = Array.from(
    new Set([
      'self_drive',
      'classic_route',
      route.tier,
      ...route.aliases.slice(0, 8),
      ...route.regions,
      ...(route.taxonomySubScopeId ? [route.taxonomySubScopeId] : []),
    ]),
  );

  const itinerarySkeleton = defaultVariant
    ? {
        dayThemes: defaultVariant.stops.map(
          (s) => `D${s.day} ${s.from}→${s.to}`,
        ),
        dailyPace: route.severity === 'high' ? 'intense' : 'moderate',
        classicRouteId: route.id,
      }
    : { classicRouteId: route.id };

  const data = {
    countryCode: 'CN',
    name,
    nameCN: route.nameCN,
    nameEN: route.nameEN,
    description: route.summaryCN,
    tags,
    regions: route.regions,
    entryHubs: (route.anchorPlaces ?? []).slice(0, 4),
    seasonality: { note: '见 classic-self-drive-routes 与季节窗口' },
    constraints: {
      soft: {
        maxDailyDriveKmHint: 580,
        classicRouteSeverity: route.severity,
      },
    },
    riskProfile: {
      severity: route.severity,
      mustHintsCN: route.mustHintsCN ?? [],
    },
    signaturePois: {
      examples: route.anchorPlaces ?? [],
      weights: Object.fromEntries(
        (route.anchorPlaces ?? []).map((p, i) => [p, Math.max(0.5, 1 - i * 0.05)]),
      ),
    },
    itinerarySkeleton: itinerarySkeleton as Prisma.InputJsonValue,
    metadata: {
      classicRouteId: route.id,
      taxonomySubScopeId: route.taxonomySubScopeId,
      distanceKmHint: route.distanceKmHint,
      typicalDays: route.typicalDays,
      source: 'classic-self-drive-routes.v1.json',
    } as Prisma.InputJsonValue,
    isActive: true,
    status: 'active',
    version: '1.0.0',
    rolloutPercent: 100,
    updatedAt: new Date(),
  };

  const existing = await prisma.routeDirection.findFirst({
    where: { OR: [{ name }, { nameCN: route.nameCN }] },
  });

  if (dryRun) {
    console.log(`  [DRY] direction ${existing ? 'UPDATE' : 'CREATE'} ${name}`);
    return existing?.id ?? -1;
  }

  if (existing) {
    await prisma.routeDirection.update({ where: { id: existing.id }, data });
    console.log(`  ✅ direction UPDATE ${name} (id=${existing.id})`);
    return existing.id;
  }

  const created = await prisma.routeDirection.create({
    data: { ...data, uuid: randomUUID(), createdAt: new Date() },
  });
  console.log(`  ✅ direction CREATE ${name} (id=${created.id})`);
  return created.id;
}

async function upsertTemplate(
  routeDirectionId: number,
  route: RouteRow,
  variant: Variant,
) {
  const uuid = templateUuid(route.id, variant.id);
  const dayPlans = stopsToDayPlans(variant.stops);
  const data = {
    routeDirectionId,
    durationDays: variant.days,
    name: `${route.nameEN} · ${variant.labelEN || variant.id}`,
    nameCN: `${route.nameCN} · ${variant.labelCN}`,
    nameEN: `${route.nameEN} · ${variant.labelEN || variant.id}`,
    dayPlans: dayPlans as unknown as Prisma.InputJsonValue,
    defaultPacePreference: route.severity === 'high' ? 'ACTIVE' : 'BALANCED',
    metadata: {
      classicRouteId: route.id,
      variantId: variant.id,
      taxonomySubScopeId: route.taxonomySubScopeId,
      source: 'classic-self-drive-day-skeletons.v1.json',
    } as Prisma.InputJsonValue,
    isActive: true,
  };

  const existing = await prisma.routeTemplate.findUnique({ where: { uuid } });
  if (dryRun) {
    console.log(
      `  [DRY] template ${existing ? 'UPDATE' : 'CREATE'} ${uuid} (${variant.days}d)`,
    );
    return;
  }

  if (existing) {
    await prisma.routeTemplate.update({ where: { uuid }, data });
    console.log(`  ✅ template UPDATE ${uuid}`);
    return;
  }

  await prisma.routeTemplate.create({
    data: { ...data, uuid, updatedAt: new Date() },
  });
  console.log(`  ✅ template CREATE ${uuid}`);
}

async function main() {
  const routesPath = join(
    process.cwd(),
    'data/country-packs/CN/classic-self-drive-routes.v1.json',
  );
  const skeletonsPath = join(
    process.cwd(),
    'data/country-packs/CN/classic-self-drive-day-skeletons.v1.json',
  );
  if (!existsSync(routesPath) || !existsSync(skeletonsPath)) {
    throw new Error('Missing classic self-drive JSON files');
  }

  const routes = (JSON.parse(readFileSync(routesPath, 'utf-8')) as { routes: RouteRow[] })
    .routes;
  const skeletons = (
    JSON.parse(readFileSync(skeletonsPath, 'utf-8')) as {
      skeletons: Record<
        string,
        { defaultVariantId?: string; variants: Variant[] }
      >;
    }
  ).skeletons;

  console.log(
    `Importing ${routes.length} classic CN self-drive routes${dryRun ? ' (dry-run)' : ''}...`,
  );

  for (const route of routes) {
    console.log(`\n→ ${route.id} ${route.nameCN}`);
    const sk = skeletons[route.id];
    const defaultVariant =
      sk?.variants.find((v) => v.id === sk.defaultVariantId) ?? sk?.variants[0] ?? null;
    const directionId = await upsertDirection(route, defaultVariant);
    if (!sk?.variants?.length) {
      console.log('  (no day skeleton variants)');
      continue;
    }
    if (directionId < 0 && dryRun) {
      for (const v of sk.variants) await upsertTemplate(0, route, v);
      continue;
    }
    for (const variant of sk.variants) {
      await upsertTemplate(directionId, route, variant);
    }
  }

  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
