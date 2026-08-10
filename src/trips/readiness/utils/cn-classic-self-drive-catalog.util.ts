/**
 * 中国经典自驾线 Catalog 投影（HTTP / bootstrap 选线）。
 */
import {
  cnClassicRoutesDisclaimer,
  getCnClassicRouteById,
  listCnClassicRoutes,
  listCnClassicDaySkeletonVariants,
  type CnClassicRoute,
  type CnClassicRouteTier,
} from './cn-classic-routes.util';
import { listCnClassicSeasonWindows } from './cn-classic-season-windows.util';
import { resolveCnDrivingThresholdPackCode } from './cn-driving-threshold-pack.util';

export type CnClassicRouteCatalogItem = {
  id: string;
  nameCN: string;
  nameEN: string;
  tier: CnClassicRouteTier;
  regions: string[];
  typicalDays: number[];
  distanceKmHint: number | null;
  severity: CnClassicRoute['severity'];
  summaryCN: string;
  summaryEN: string;
  skeletonVariantIds: string[];
  drivingThresholdPackCode: string;
  taxonomySubScopeId: string | null;
};

export type CnClassicRouteCatalogDetail = CnClassicRouteCatalogItem & {
  aliases: string[];
  mustHintsCN: string[];
  anchorPlaces: string[];
  skeletonVariants: Array<{
    id: string;
    days: number;
    labelCN: string;
    labelEN?: string;
    stopCount: number;
  }>;
  seasonWindows: Array<{
    id: string;
    kind: string;
    severity: string;
    months: number[];
    summaryCN: string;
    summaryEN: string;
  }>;
  wantsXizang: boolean;
  wantsSichuan: boolean;
  disclaimer: string;
};

function toCatalogItem(route: CnClassicRoute): CnClassicRouteCatalogItem {
  const variants = listCnClassicDaySkeletonVariants(route.id);
  return {
    id: route.id,
    nameCN: route.nameCN,
    nameEN: route.nameEN,
    tier: route.tier,
    regions: route.regions.slice(),
    typicalDays: (route.typicalDays ?? []).slice(),
    distanceKmHint: route.distanceKmHint ?? null,
    severity: route.severity,
    summaryCN: route.summaryCN,
    summaryEN: route.summaryEN,
    skeletonVariantIds: variants.map((v) => v.id),
    drivingThresholdPackCode: resolveCnDrivingThresholdPackCode({
      destination: 'CN',
      classicRouteId: route.id,
    }),
    taxonomySubScopeId: route.taxonomySubScopeId ?? null,
  };
}

export function listCnClassicRouteCatalog(options?: {
  tier?: CnClassicRouteTier;
}): {
  countryCode: 'CN';
  disclaimer: string;
  routes: CnClassicRouteCatalogItem[];
} {
  let routes = listCnClassicRoutes();
  if (options?.tier) {
    routes = routes.filter((r) => r.tier === options.tier);
  }
  return {
    countryCode: 'CN',
    disclaimer: cnClassicRoutesDisclaimer(),
    routes: routes.map(toCatalogItem),
  };
}

export function getCnClassicRouteCatalogDetail(
  routeId: string,
): CnClassicRouteCatalogDetail | null {
  const route = getCnClassicRouteById(routeId);
  if (!route) return null;
  const variants = listCnClassicDaySkeletonVariants(route.id);
  const seasonWindows = listCnClassicSeasonWindows(route.id);
  return {
    ...toCatalogItem(route),
    aliases: route.aliases.slice(),
    mustHintsCN: (route.mustHintsCN ?? []).slice(),
    anchorPlaces: (route.anchorPlaces ?? []).slice(),
    skeletonVariants: variants.map((v) => ({
      id: v.id,
      days: v.days,
      labelCN: v.labelCN,
      labelEN: v.labelEN,
      stopCount: v.stops.length,
    })),
    seasonWindows: seasonWindows.map((w) => ({
      id: w.id,
      kind: w.kind,
      severity: w.severity,
      months: w.months.slice(),
      summaryCN: w.summaryCN,
      summaryEN: w.summaryEN,
    })),
    wantsXizang: route.regions.includes('xizang'),
    wantsSichuan: route.regions.includes('sichuan'),
    disclaimer: cnClassicRoutesDisclaimer(),
  };
}
