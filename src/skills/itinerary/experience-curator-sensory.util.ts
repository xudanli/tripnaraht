/**
 * ② 感官交替与审美疲劳对齐（Sensory De-escalation）
 */

import type { ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { ExperiencePreferences } from './experience-curator.types';
import {
  classifyPoiExperienceCategory,
  poiSensoryEnergy,
  type SensoryEnergyLevel,
} from './experience-poi-taxonomy.util';

function buildLowEnergyRest(dateIso: string, label: string): ItineraryItem {
  return {
    id: `sensory-rest-${dateIso}-${Date.now()}`,
    type: 'REST',
    start_window: `${dateIso}T15:00`,
    end_window: `${dateIso}T15:45`,
    location_ref: { name: label },
    evidence_refs: [],
    verified: false,
    notes: '感官降维：高能量景观后的温暖人文/包裹感缓冲',
  };
}

const LOW_ENERGY_FALLBACK_LABELS = [
  '街角独立咖啡馆',
  '小镇手作工坊',
  '私密温泉小憩',
];

export function applySensoryDeescalation(params: {
  items: ItineraryItem[];
  dateIso: string;
  prefs: ExperiencePreferences;
}): { items: ItineraryItem[]; notes_zh: string[]; sensory_balance: number } {
  const notes_zh: string[] = [];
  let items = params.items.map((it) => ({ ...it }));

  if (!params.prefs.sensoryAlternation) {
    return { items, notes_zh, sensory_balance: 75 };
  }

  const pois = items.filter((it) => it.type === 'POI');
  const energies = pois.map((p) => poiSensoryEnergy(p.location_ref.name, p.notes));

  let consecutiveHigh = 0;
  let penalty = 0;
  for (let i = 0; i < energies.length; i++) {
    if (energies[i] === 'high') {
      consecutiveHigh += 1;
      if (consecutiveHigh >= 2) {
        penalty += 18;
        const nextIdx = i + 1;
        const hasLowAfter = energies.slice(nextIdx).some((e) => e === 'low');
        if (!hasLowAfter && pois.length >= 3) {
          const label = LOW_ENERGY_FALLBACK_LABELS[consecutiveHigh % LOW_ENERGY_FALLBACK_LABELS.length];
          items.push(buildLowEnergyRest(params.dateIso, label));
          notes_zh.push(
            `感官交替：连续宏大景观后插入「${label}」，避免审美麻木与情绪过载。`,
          );
        } else if (nextIdx < pois.length && energies[nextIdx] === 'high') {
          const swapTarget = pois.findIndex(
            (p, j) => j > nextIdx && poiSensoryEnergy(p.location_ref.name, p.notes) === 'low',
          );
          if (swapTarget > 0) {
            const aId = pois[nextIdx].id;
            const bId = pois[swapTarget].id;
            const ai = items.findIndex((it) => it.id === aId);
            const bi = items.findIndex((it) => it.id === bId);
            if (ai >= 0 && bi >= 0) {
              const tmpStart = items[ai].start_window;
              const tmpEnd = items[ai].end_window;
              items[ai].start_window = items[bi].start_window;
              items[ai].end_window = items[bi].end_window;
              items[bi].start_window = tmpStart;
              items[bi].end_window = tmpEnd;
              notes_zh.push(
                `感官对立唤醒：将低能量「${items[bi].location_ref.name}」提前，打断连续高震撼景观链。`,
              );
            }
          }
        }
        consecutiveHigh = 0;
      }
    } else {
      consecutiveHigh = 0;
    }
  }

  const categories = pois.map((p) => classifyPoiExperienceCategory(p.location_ref.name, p.notes));
  const unique = new Set(categories).size;
  const sensory_balance = Math.max(20, Math.min(100, 60 + unique * 10 - penalty));

  return { items, notes_zh, sensory_balance };
}
