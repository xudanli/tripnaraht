import type { OpenWorldPoiStub } from '../types/open-world-poi.types';
import { buildOpenWorldPoiStub } from './open-world-poi-stub.util';

/** 极地稀疏区默认 Open-World Stub（P0：registry 级占位，无 LLM） */
export function buildDefaultPolarRegionStubs(
  regionTag: 'greenland' | 'svalbard',
  destinationHint?: string,
): OpenWorldPoiStub[] {
  const hint = String(destinationHint ?? '');

  if (regionTag === 'greenland') {
    const discoIntent = /disco|disko|伊卢利萨特|ilulissat|皮划艇|kayak|冰山/i.test(hint);
    const stubs: OpenWorldPoiStub[] = [
      buildOpenWorldPoiStub({
        displayName: 'Nuuk 市区探索（弹性）',
        regionHint: 'Nuuk, Greenland',
        lat: 64.1814,
        lng: -51.6941,
        radiusKm: 25,
        constraintTags: ['weather_window'],
        elasticMinutes: { min: 90, max: 180 },
      }),
      buildOpenWorldPoiStub({
        displayName: '天气窗 / 远征弹性时段',
        regionHint: 'Greenland',
        lat: 64.1814,
        lng: -51.6941,
        radiusKm: 60,
        constraintTags: ['weather_window', 'expedition_flexible'],
        elasticMinutes: { min: 120, max: 240 },
        stubId: 'provisional_weather_window_gl',
      }),
    ];
    if (discoIntent) {
      stubs.unshift(
        buildOpenWorldPoiStub({
          displayName: '迪斯科湾皮划艇看冰山（待核实）',
          regionHint: 'Disko Bay, Greenland',
          lat: 69.2198,
          lng: -51.0986,
          radiusKm: 50,
          constraintTags: ['guide_required', 'weather_window', 'permit_required'],
          elasticMinutes: { min: 180, max: 240 },
          stubId: 'provisional_disco_kayak_gl',
        }),
      );
    }
    return stubs;
  }

  const auroraIntent = /极光|aurora|northern\s+lights/i.test(hint);
  const stubs: OpenWorldPoiStub[] = [
    buildOpenWorldPoiStub({
      displayName: '朗伊尔城基地活动（弹性）',
      regionHint: 'Longyearbyen, Svalbard',
      lat: 78.2232,
      lng: 15.6267,
      radiusKm: 20,
      constraintTags: ['guide_required'],
      elasticMinutes: { min: 90, max: 180 },
    }),
    buildOpenWorldPoiStub({
      displayName: '防熊区安全缓冲 / 待命',
      regionHint: 'Svalbard',
      lat: 78.2232,
      lng: 15.6267,
      radiusKm: 30,
      constraintTags: ['bear_zone_buffer', 'guide_required'],
      elasticMinutes: { min: 120, max: 240 },
      stubId: 'provisional_bear_buffer_sj',
    }),
  ];
  if (auroraIntent) {
    stubs.push(
      buildOpenWorldPoiStub({
        displayName: '极光天气窗等待（弹性 4h）',
        regionHint: 'Longyearbyen, Svalbard',
        lat: 78.2232,
        lng: 15.6267,
        radiusKm: 15,
        constraintTags: ['weather_window'],
        elasticMinutes: { min: 120, max: 240 },
        stubId: 'provisional_aurora_window_sj',
      }),
    );
  }
  return stubs;
}
