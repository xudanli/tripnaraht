/**
 * 将天气/路况传感器输出映射为 Live Runtime Evidence。
 */

import type { LiveEvidenceFactV1 } from './live-execution-runtime.util';

export function collectLiveEvidenceFromSensorBlocks(input: {
  weatherBlock?: string | null;
  roadBlock?: string | null;
  weatherRiskZh?: string | null;
  roadAlertZh?: string | null;
  ontologyRoadAggregate?: string | null;
}): LiveEvidenceFactV1[] {
  const out: LiveEvidenceFactV1[] = [];
  const weather =
    String(input.weatherRiskZh ?? '').trim() ||
    String(input.weatherBlock ?? '').trim().slice(0, 240);
  if (weather) {
    const hard = /封路|关闭|不可通行|暴风|极端|红警|红色预警/i.test(weather);
    out.push({
      key: 'weather',
      valueZh: weather.slice(0, 200),
      freshness: 'LIVE',
      source: hard ? 'weather_sensor:hard' : 'weather_sensor',
    });
  }
  const road =
    String(input.roadAlertZh ?? '').trim() ||
    String(input.roadBlock ?? '').trim().slice(0, 240);
  if (road) {
    const closed = /封路|关闭|不可通行|CLOSED|BLOCKED|禁行|门控=BLOCK|\bBLOCK\b/i.test(road);
    out.push({
      key: 'road',
      valueZh: road.slice(0, 200),
      freshness: 'LIVE',
      source: closed ? 'road_sensor:closed' : 'road_sensor',
    });
  }
  const agg = String(input.ontologyRoadAggregate ?? '').trim();
  if (agg) {
    out.push({
      key: 'road_aggregate',
      valueZh: `路况聚合=${agg}`,
      freshness: 'LIVE',
      source: 'ontology_road_status',
    });
  }
  return out;
}

/** 从 Evidence 判断硬阻断（封路/红警） */
export function liveEvidenceImpliesHardBlock(evidence: LiveEvidenceFactV1[]): boolean {
  return evidence.some(
    (e) =>
      e.source?.includes(':closed') ||
      e.source?.includes(':hard') ||
      /封路|关闭|不可通行|红警|红色预警|BLOCKED|CLOSED|门控=BLOCK/i.test(e.valueZh),
  );
}

export function liveEvidenceHasLiveWeatherOrRoad(evidence: LiveEvidenceFactV1[]): boolean {
  return evidence.some(
    (e) =>
      e.freshness === 'LIVE' &&
      (e.key === 'weather' || e.key === 'road' || e.key === 'road_aggregate'),
  );
}
