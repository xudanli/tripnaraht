import type { InspirationAsset } from '../types/trip-wish.types';

/** Seed Iceland inspiration gallery assets (expandable via CMS later). */
export const ICELAND_INSPIRATION_ASSETS: InspirationAsset[] = [
  {
    id: 'is-insp-jokulsarlon',
    region: 'South Coast',
    tags: ['glacier', 'lagoon', 'photography'],
    imageUrl: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800',
    caption: '杰古沙龙冰河湖 — 漂浮的冰山与黑沙海岸',
    relatedPoiIds: ['jokulsarlon'],
    seasonHint: '全年；冬季极光季加分',
  },
  {
    id: 'is-insp-sky-lagoon',
    region: 'Reykjavik',
    tags: ['hot_spring', 'relaxation'],
    imageUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800',
    caption: '雷克雅未克周边地热温泉 — 面朝大海泡汤',
    seasonHint: '全年',
  },
  {
    id: 'is-insp-stokksnes',
    region: 'East',
    tags: ['mountain', 'beach', 'film_location'],
    imageUrl: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800',
    caption: '斯托克斯内斯 — 维斯特拉horn与黑沙滩',
    relatedPoiIds: ['vestrahorn'],
  },
  {
    id: 'is-insp-golden-circle',
    region: 'Golden Circle',
    tags: ['geyser', 'waterfall', 'classic_route'],
    imageUrl: 'https://images.unsplash.com/photo-1529963183134-2821d09487ad?w=800',
    caption: '黄金圈 — 间歇泉、黄金瀑布与辛格维利尔',
    relatedPoiIds: ['geysir', 'gullfoss', 'thingvellir'],
  },
  {
    id: 'is-insp-landmannalaugar',
    region: 'Highlands',
    tags: ['hiking', 'colorful_mountains'],
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    caption: '兰德曼纳劳卡 — 彩色山脊与温泉徒步',
    seasonHint: '夏季公路开放',
  },
  {
    id: 'is-insp-reykjavik-food',
    region: 'Reykjavik',
    tags: ['food', 'street_food'],
    imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    caption: '雷克雅未克街头 — 网红热狗与本地小馆',
    relatedPoiIds: ['baejarins-beztu'],
  },
  {
    id: 'is-insp-northern-lights',
    region: 'Countrywide',
    tags: ['aurora', 'night'],
    imageUrl: 'https://images.unsplash.com/photo-1483348720936-4b0d390dde12?w=800',
    caption: '极光 — 从玻璃屋或远离光害处仰望夜空',
    seasonHint: '9月—3月',
  },
  {
    id: 'is-insp-snaefellsnes',
    region: 'West',
    tags: ['peninsula', 'church', 'coast'],
    imageUrl: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800',
    caption: '斯奈山半岛 — 教会山与海岸线一日慢游',
    relatedPoiIds: ['kirkjufell'],
  },
];

export function listIcelandInspirationAssets(filters?: {
  region?: string;
  tag?: string;
  offset?: number;
  limit?: number;
}): { items: InspirationAsset[]; total: number } {
  let items = [...ICELAND_INSPIRATION_ASSETS];
  if (filters?.region) {
    const r = filters.region.toLowerCase();
    items = items.filter((a) => a.region.toLowerCase().includes(r));
  }
  if (filters?.tag) {
    const t = filters.tag.toLowerCase();
    items = items.filter((a) => a.tags.some((x) => x.toLowerCase().includes(t)));
  }
  const total = items.length;
  const offset = filters?.offset ?? 0;
  const limit = Math.min(filters?.limit ?? 20, 50);
  return { items: items.slice(offset, offset + limit), total };
}

export function getIcelandInspirationAsset(id: string): InspirationAsset | null {
  return ICELAND_INSPIRATION_ASSETS.find((a) => a.id === id) ?? null;
}
