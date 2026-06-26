import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { TravelRiskEvent } from '../../../agent/execution/risk-event.types';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';

const OUTDOOR_KEYWORDS = /冰川|徒步|瀑布|高地|环岛|自驾|户外|冰川|hike|glacier|waterfall|highland/i;

@Injectable()
export class EnvironmentDataAdapter {
  private readonly logger = new Logger(EnvironmentDataAdapter.name);

  async collectRiskSignals(
    anchor: InTripAnchorSnapshot,
  ): Promise<TravelRiskEvent[]> {
    const dest = anchor.metadata.destination.toUpperCase();
    if (dest === 'IS' || dest.includes('ICELAND') || dest.includes('冰岛')) {
      return this.collectIcelandWeatherRisks(anchor);
    }
    return this.collectStubRisks(anchor);
  }

  private async collectIcelandWeatherRisks(
    anchor: InTripAnchorSnapshot,
  ): Promise<TravelRiskEvent[]> {
    try {
      const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: 64.1466,
          longitude: -21.9426,
          hourly: 'windspeed_10m,precipitation,weathercode',
          forecast_days: 3,
          timezone: anchor.metadata.timezone,
        },
        timeout: 8000,
      });

      const winds: number[] = data?.hourly?.windspeed_10m ?? [];
      const precip: number[] = data?.hourly?.precipitation ?? [];
      const maxWind = winds.length ? Math.max(...winds) : 0;
      const maxPrecip = precip.length ? Math.max(...precip) : 0;
      const observedAt = new Date().toISOString();

      const events: TravelRiskEvent[] = [];

      if (maxWind >= 15) {
        events.push({
          id: `weather-wind-${anchor.tripId}`,
          category: 'WEATHER_NATURAL',
          urgency: maxWind >= 20 ? 5 : 4,
          entityRef: { type: 'DESTINATION', id: anchor.metadata.destination },
          message: `未来 72 小时冰岛最大风速约 ${maxWind.toFixed(0)} m/s，户外/高地活动可能受影响`,
          source: { provider: 'open-meteo', sourceType: 'OFFICIAL' },
          observedAt,
          confidence: 0.82,
          suggestedAction: 'ASK_USER',
        });
      }

      if (maxPrecip >= 8) {
        events.push({
          id: `weather-precip-${anchor.tripId}`,
          category: 'WEATHER_NATURAL',
          urgency: maxPrecip >= 15 ? 4 : 3,
          entityRef: { type: 'DESTINATION', id: anchor.metadata.destination },
          message: `未来 72 小时降水峰值约 ${maxPrecip.toFixed(1)} mm，部分路段或景点可达性下降`,
          source: { provider: 'open-meteo', sourceType: 'OFFICIAL' },
          observedAt,
          confidence: 0.78,
          suggestedAction: 'DELAY',
        });
      }

      return this.attachAffectedOutdoorItems(events, anchor);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Open-Meteo fetch failed trip=${anchor.tripId}: ${msg}`);
      return this.collectStubRisks(anchor);
    }
  }

  private collectStubRisks(anchor: InTripAnchorSnapshot): TravelRiskEvent[] {
    const outdoorItems = this.findOutdoorItems(anchor);
    if (outdoorItems.length === 0) return [];

    return [
      {
        id: `stub-weather-${anchor.tripId}`,
        category: 'WEATHER_NATURAL',
        urgency: 3,
        entityRef: { type: 'POI', id: outdoorItems[0]?.id },
        message: '环境数据适配器暂用启发式监测：今日户外项目建议关注天气变化',
        source: { provider: 'in_trip_heuristic', sourceType: 'MODEL' },
        observedAt: new Date().toISOString(),
        confidence: 0.55,
        suggestedAction: 'RECHECK',
      },
    ];
  }

  private attachAffectedOutdoorItems(
    events: TravelRiskEvent[],
    anchor: InTripAnchorSnapshot,
  ): TravelRiskEvent[] {
    const outdoor = this.findOutdoorItems(anchor);
    if (outdoor.length === 0) return events;
    return events.map((e, idx) => ({
      ...e,
      entityRef: { type: 'POI', id: outdoor[idx % outdoor.length]?.id ?? outdoor[0].id },
    }));
  }

  findOutdoorItems(anchor: InTripAnchorSnapshot) {
    const items: Array<{ id: string; title: string; date: string }> = [];
    for (const day of anchor.itinerary.days) {
      for (const item of day.items) {
        if (OUTDOOR_KEYWORDS.test(item.title) || /ACTIVITY|HIKE|TOUR/i.test(item.type)) {
          items.push({ id: item.id, title: item.title, date: day.date });
        }
      }
    }
    return items;
  }
}
