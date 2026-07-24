import type { OdysseyScenarioWallpaper } from '../types/odyssey-intake-ext.types';

const BASE =
  process.env.ODYSSEY_WALLPAPER_BASE_URL?.replace(/\/$/, '') ??
  'https://cdn.tripnara.com/odyssey/wallpapers';

/** PRD 3.1：每道题意境壁纸（wallpaperKey → CDN URL） */
export const ODYSSEY_WALLPAPER_ASSETS: Record<string, OdysseyScenarioWallpaper> = {
  snow_mountain_restaurant: {
    key: 'snow_mountain_restaurant',
    url: `${BASE}/snow-mountain-restaurant.jpg`,
    blurHash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
  },
  blizzard_road_closure: {
    key: 'blizzard_road_closure',
    url: `${BASE}/blizzard-road-closure.jpg`,
    blurHash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
  },
  early_morning_alarm: {
    key: 'early_morning_alarm',
    url: `${BASE}/early-morning-alarm.jpg`,
    blurHash: 'LGF=?]+YJ%_M-;xCxoJ@x]RjRj',
  },
  hostel_communal_fire: {
    key: 'hostel_communal_fire',
    url: `${BASE}/hostel-communal-fire.jpg`,
    blurHash: 'LCCG3]~q00?b-;RjM{of00Rj?bRj',
  },
  ancient_ruins_sun: {
    key: 'ancient_ruins_sun',
    url: `${BASE}/ancient-ruins-sun.jpg`,
    blurHash: 'LPII~#~q00?b-;RjM{of00Rj?bRj',
  },
  black_sand_luxury_outage: {
    key: 'black_sand_luxury_outage',
    url: `${BASE}/black-sand-luxury-outage.jpg`,
    blurHash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
  },
  convoy_roadside_chaos: {
    key: 'convoy_roadside_chaos',
    url: `${BASE}/convoy-roadside-chaos.jpg`,
    blurHash: 'LGF=?]+YJ%_M-;xCxoJ@x]RjRj',
  },
  helicopter_glacier_premium: {
    key: 'helicopter_glacier_premium',
    url: `${BASE}/helicopter-glacier-premium.jpg`,
    blurHash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
  },
};

export function resolveWallpaperUrl(wallpaperKey: string): OdysseyScenarioWallpaper {
  return (
    ODYSSEY_WALLPAPER_ASSETS[wallpaperKey] ?? {
      key: wallpaperKey,
      url: `${BASE}/default.jpg`,
    }
  );
}
