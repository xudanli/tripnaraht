/**
 * ③ 电影感转场与空间留白（Cinematic Transition & Buffering）
 */

import type { ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { ExperiencePreferences } from './experience-curator.types';

function driveMinutes(item: ItineraryItem): number {
  return item.metadata?.duration_minutes ?? 0;
}

function buildDriveByScenic(dateIso: string, seq: number, scenicWeight: number): ItineraryItem {
  const labels =
    scenicWeight > 0.7
      ? ['车窗观景点 · 苔原旷野', '景观路段 · 一号公路慢驶段']
      : ['途中观景留白', '安静转场缓冲带'];
  const label = labels[seq % labels.length];
  return {
    id: `driveby-${dateIso}-${seq}`,
    type: 'DRIVE',
    start_window: `${dateIso}T12:00`,
    end_window: `${dateIso}T12:20`,
    location_ref: { name: label },
    evidence_refs: [],
    verified: false,
    notes:
      '电影感转场：无需下车，车内即可观赏；适合放空、老人小憩，保持隐私边界与车内安静。',
    metadata: { duration_minutes: 20, slot_source: 'experience_curator' },
  };
}

function buildQuietTransitionNote(driveMin: number): string {
  return `接下来约 ${driveMin} 分钟为安静景观路段，车内可放空——也是情绪疗愈的转场空档。`;
}

export function applyCinematicTransitions(params: {
  items: ItineraryItem[];
  dateIso: string;
  prefs: ExperiencePreferences;
}): { items: ItineraryItem[]; notes_zh: string[]; transition_cushion: number } {
  const notes_zh: string[] = [];
  const items = [...params.items.map((it) => ({ ...it }))];
  let inserted = 0;
  let longLegs = 0;

  const drives = items.filter((it) => it.type === 'DRIVE' || it.type === 'TRANSIT');
  for (const d of drives) {
    const mins = driveMinutes(d);
    if (mins >= 60) {
      longLegs += 1;
      if (inserted < 2 && params.prefs.scenicDriveWeight >= 0.5) {
        items.push(buildDriveByScenic(params.dateIso, inserted, params.prefs.scenicDriveWeight));
        inserted += 1;
        notes_zh.push(buildQuietTransitionNote(Math.min(mins, 90)));
      } else {
        notes_zh.push(buildQuietTransitionNote(mins));
      }
    }
  }

  if (longLegs === 0 && items.filter((it) => it.type === 'POI').length >= 3) {
    notes_zh.push('转场留白：今日动线紧凑，建议在车内保留 15–20 分钟无安排静默段。');
  }

  const transition_cushion = Math.min(
    100,
    55 + inserted * 18 + (params.prefs.scenicDriveWeight > 0.65 ? 12 : 0) + (longLegs > 0 ? 10 : 0),
  );

  return { items, notes_zh, transition_cushion };
}
