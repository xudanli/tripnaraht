/**
 * Parse Vedur.is observation XML (collector raw payload).
 */

import { DOMParser } from '@xmldom/xmldom';

export interface VedurRawObservation {
  stationId: string;
  stationName?: string;
  observedAt: string;
  windSpeedMs: number;
  windGustMs?: number;
  temperatureC?: number;
}

export function parseVedurObservationXml(xml: string, stationIdHint?: string): VedurRawObservation {
  if (!xml?.trim()) {
    throw new Error('empty_vedur_xml');
  }
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  const parseError = parsed.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error(`vedur_xml_parse_error: ${parseError.textContent ?? 'invalid'}`);
  }
  const stations = Array.from(parsed.getElementsByTagName('station'));
  if (stations.length === 0) {
    throw new Error('vedur_xml_no_station');
  }
  const station =
    stations.find((s) => s.getAttribute('id') === String(stationIdHint ?? '')) ?? stations[0];
  const read = (tag: string) => {
    const nodes = station.getElementsByTagName(tag);
    return nodes[0]?.textContent?.trim() ?? '';
  };
  const windSpeedMs = Number(read('F'));
  if (!Number.isFinite(windSpeedMs)) {
    throw new Error('vedur_xml_missing_wind');
  }
  const gustRaw = read('FG');
  const windGustMs = gustRaw ? Number(gustRaw) : undefined;
  const timeRaw = read('time');
  return {
    stationId: station.getAttribute('id') ?? stationIdHint ?? 'unknown',
    stationName: read('name') || undefined,
    observedAt: timeRaw ? new Date(timeRaw.replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString(),
    windSpeedMs,
    windGustMs: Number.isFinite(windGustMs) ? windGustMs : undefined,
    temperatureC: Number.isFinite(Number(read('T'))) ? Number(read('T')) : undefined,
  };
}

export function windMsToKmh(ms: number): number {
  return Math.round(ms * 3.6 * 10) / 10;
}
