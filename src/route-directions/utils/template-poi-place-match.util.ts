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

type PrismaLike = Pick<PrismaClient, 'place'>;

const PLACE_SELECT = {
  id: true,
  uuid: true,
  nameCN: true,
  nameEN: true,
  category: true,
} as const;

function countryFilter(countryCode?: string): Prisma.PlaceWhereInput {
  if (!countryCode) return {};
  return {
    City: {
      countryCode: countryCode.toUpperCase(),
    },
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
): Promise<TemplatePoiPlaceRow | null> {
  const names = [ref.nameEN?.trim(), ref.nameCN?.trim()].filter(Boolean) as string[];
  if (names.length === 0) return null;

  const baseWhere = countryFilter(countryCode);

  for (const name of names) {
    const exact = await prisma.place.findFirst({
      where: {
        ...baseWhere,
        OR: [{ nameCN: name }, { nameEN: name }],
      },
      select: PLACE_SELECT,
      orderBy: { rating: 'desc' },
    });
    if (exact) return exact;
  }

  for (const name of names) {
    const fuzzy = await prisma.place.findFirst({
      where: {
        ...baseWhere,
        OR: [
          { nameCN: { contains: name, mode: 'insensitive' } },
          { nameEN: { contains: name, mode: 'insensitive' } },
        ],
      },
      select: PLACE_SELECT,
      orderBy: { rating: 'desc' },
    });
    if (fuzzy) return fuzzy;
  }

  return null;
}
