/**
 * 从应用 log 聚合 narrative drift 指标（离线 DS 复盘）。
 */
import fs from 'fs';
import {
  parseNarrativeDriftMetricEvents,
  summarizeNarrativeDriftEvents,
  type NarrativeDriftMetricEvent,
} from '../../src/trips/decision/explainability/narrative-drift-monitor.util';

export function loadNarrativeDriftEventsFromLog(logPath: string): NarrativeDriftMetricEvent[] {
  return parseNarrativeDriftMetricEvents(fs.readFileSync(logPath, 'utf8'));
}

export function buildNarrativeDriftLogReport(logPath: string) {
  const events = loadNarrativeDriftEventsFromLog(logPath);
  return {
    logPath,
    ...summarizeNarrativeDriftEvents(events),
    sampleSize: events.length,
  };
}
