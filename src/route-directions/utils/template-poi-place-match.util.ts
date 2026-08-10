import { Prisma, PrismaClient } from '@prisma/client';

export interface TemplatePoiPlaceRow {
  id: number;
  uuid: string;
  nameCN: string;
  nameEN: string | null;
  category: string;
}

export interface TemplatePoiNameRef {
  nameCN?: string;
  nameEN?: string;
}

export type FindPlaceByTemplatePoiOptions = {
  /** 排除类别（经典自驾绑定默认排除 HOTEL/RESTAURANT） */
  excludeCategories?: string[];
  /** 额外别名（先于原始名尝试） */
  aliasNames?: string[];
  /** 地名无 POI 时，按同名 City 取评分最高的非酒店 Place */
  cityFallback?: boolean;
};

type PrismaLike = Pick<PrismaClient, 'place'> & {
  city?: PrismaClient['city'];
};

const PLACE_SELECT = {
  id: true,
  uuid: true,
  nameCN: true,
  nameEN: true,
  category: true,
} as const;

const DEFAULT_SOFT_EXCLUDE = ['HOTEL', 'RESTAURANT'] as const;

function countryFilter(countryCode?: string): Prisma.PlaceWhereInput {
  if (!countryCode) return {};
  return {
    City: {
      countryCode: countryCode.toUpperCase(),
    },
  };
}

function withExclude(
  where: Prisma.PlaceWhereInput,
  excludeCategories?: string[],
): Prisma.PlaceWhereInput {
  if (!excludeCategories?.length) return where;
  return {
    AND: [where, { NOT: { category: { in: excludeCategories as any } } }],
  };
}

/**
 * Resolve a template POI to a Place row by nameEN/nameCN (exact then contains).
 * Aligns with frontend fallback when template POIs lack place library ids.
 */
export async function findPlaceByTemplatePoiNames(
  prisma: PrismaLike,
  ref: TemplatePoiNameRef,
  countryCode?: string,
  options?: FindPlaceByTemplatePoiOptions,
): Promise<TemplatePoiPlaceRow | null> {
  const names = [
    ...(options?.aliasNames ?? []),
    ref.nameEN?.trim(),
    ref.nameCN?.trim(),
  ].filter(Boolean) as string[];
  if (names.length === 0) return null;

  const baseWhere = countryFilter(countryCode);
  const exclude = options?.excludeCategories;

  for (const name of names) {
    const exact = await prisma.place.findFirst({
      where: withExclude(
        {
          ...baseWhere,
          OR: [{ nameCN: name }, { nameEN: name }],
        },
        exclude,
      ),
      select: PLACE_SELECT,
      orderBy: { rating: 'desc' },
    });
    if (exact) return exact;
  }

  for (const name of names) {
    const fuzzy = await prisma.place.findFirst({
      where: withExclude(
        {
          ...baseWhere,
          OR: [
            { nameCN: { contains: name, mode: 'insensitive' } },
            { nameEN: { contains: name, mode: 'insensitive' } },
          ],
        },
        exclude,
      ),
      select: PLACE_SELECT,
      orderBy: { rating: 'desc' },
    });
    if (fuzzy) return fuzzy;
  }

  if (options?.cityFallback && prisma.city) {
    const cityHit = await findCityHubPlace(
      prisma,
      names,
      countryCode,
      exclude ?? [...DEFAULT_SOFT_EXCLUDE],
    );
    if (cityHit) return cityHit;
  }

  return null;
}

/** 按城市名取代表性枢纽 Place（过夜地/城市锚点；避免误绑城郊高分景区） */
export async function findCityHubPlace(
  prisma: PrismaLike,
  cityNames: string[],
  countryCode?: string,
  excludeCategories: string[] = [...DEFAULT_SOFT_EXCLUDE],
): Promise<TemplatePoiPlaceRow | null> {
  if (!prisma.city) return null;
  const cc = countryCode?.toUpperCase();
  for (const name of cityNames) {
    const q = name.trim();
    if (!q) continue;
    const city = await prisma.city.findFirst({
      where: {
        ...(cc ? { countryCode: cc } : {}),
        OR: [
          { nameCN: q },
          { name: q },
          { nameEN: q },
          // 仅短名允许 contains，避免 "拉萨" 误命中过长别名城
          ...(q.length <= 4
            ? [{ nameCN: { contains: q } }, { name: { contains: q } }]
            : []),
        ],
      },
      select: { id: true, nameCN: true },
      orderBy: { id: 'asc' },
    });
    if (!city) continue;

    const cityLabel = (city.nameCN || q).trim();
    const base = {
      cityId: city.id,
      ...(cc ? { City: { countryCode: cc } } : {}),
    };

    // 1) 与城市同名（最佳城市锚点，如 Place「成都」）
    const exactName = await prisma.place.findFirst({
      where: withExclude(
        {
          ...base,
          OR: [
            { nameCN: cityLabel },
            { nameCN: q },
            { nameEN: q },
          ],
        },
        excludeCategories,
      ),
      select: PLACE_SELECT,
      // 同名优先 TRANSIT_HUB，再按评分
      orderBy: [{ rating: 'desc' }],
    });
    if (exactName) return exactName;

    // 2) 交通枢纽
    const transit = await prisma.place.findFirst({
      where: withExclude(
        {
          ...base,
          category: 'TRANSIT_HUB' as any,
        },
        excludeCategories,
      ),
      select: PLACE_SELECT,
      orderBy: { rating: 'desc' },
    });
    if (transit) return transit;

    // 3) 名称以城市名开头且较短（市区地标，避开「青城山」等无关高分点）
    const prefixed = await prisma.place.findFirst({
      where: withExclude(
        {
          ...base,
          OR: [
            { nameCN: { startsWith: cityLabel } },
            { nameCN: { startsWith: q } },
          ],
        },
        excludeCategories,
      ),
      select: PLACE_SELECT,
      orderBy: { rating: 'desc' },
    });
    if (prefixed && prefixed.nameCN.length <= cityLabel.length + 8) {
      return prefixed;
    }

    // 4) 最后才按评分：仍优先名称包含城市名的点
    const named = await prisma.place.findFirst({
      where: withExclude(
        {
          ...base,
          OR: [
            { nameCN: { contains: cityLabel } },
            { nameCN: { contains: q } },
          ],
        },
        excludeCategories,
      ),
      select: PLACE_SELECT,
      orderBy: { rating: 'desc' },
    });
    if (named) return named;

    const fallback = await prisma.place.findFirst({
      where: withExclude(base, excludeCategories),
      select: PLACE_SELECT,
      orderBy: { rating: 'desc' },
    });
    if (fallback) return fallback;
  }
  return null;
}
