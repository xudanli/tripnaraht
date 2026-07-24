import { Injectable, Logger, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { OpeningHoursUtil } from '../../common/utils/opening-hours.util';
import { DataSourceRouterService } from '../../data-contracts/services/data-source-router.service';
import type { WeatherDailyForecast } from '../../data-contracts/interfaces/weather.interface';
import { resolvePlaceCoordinates } from '../utils/place-coordinates.util';
import type {
  GetPlaceEvidenceQueryDto,
  PlaceEvidenceBusinessHoursDto,
  PlaceEvidenceBusinessHoursExceptionDto,
  PlaceEvidencePayloadDto,
  PlaceEvidenceResponseDto,
  PlaceEvidenceRoadClosureDto,
  PlaceEvidenceWeatherWindowDto,
} from '../dto/place-evidence.dto';

type PlaceRow = {
  id: number;
  nameCN: string | null;
  nameEN: string | null;
  metadata: unknown;
  location?: unknown;
};

@Injectable()
export class PlaceEvidenceService {
  private readonly logger = new Logger(PlaceEvidenceService.name);

  constructor(
    @Optional() private readonly dataSourceRouter?: DataSourceRouterService,
  ) {}

  async buildEvidence(
    place: PlaceRow,
    query: GetPlaceEvidenceQueryDto,
    postgisCoords?: { lat: number; lng: number } | null,
  ): Promise<PlaceEvidenceResponseDto> {
    const metadata = (place.metadata ?? {}) as Record<string, unknown>;
    const targetDate = query.date ?? DateTime.now().toISODate() ?? '';
    const timezone =
      typeof metadata.timezone === 'string' && metadata.timezone.length > 0
        ? metadata.timezone
        : 'Atlantic/Reykjavik';

    const includeWeather = query.includeWeather !== false;
    const includeTraffic = query.includeTraffic !== false;

    const evidence: PlaceEvidencePayloadDto = {};

    const businessHours = this.buildBusinessHours(metadata, targetDate, timezone);
    if (businessHours) evidence.businessHours = businessHours;

    if (includeTraffic) {
      evidence.roadClosure = this.buildRoadClosure(metadata, targetDate);
    }

    if (includeWeather) {
      const coords = resolvePlaceCoordinates(place, postgisCoords);
      const weatherWindow =
        (await this.buildWeatherWindow(coords, targetDate, timezone, metadata)) ??
        this.buildWeatherFromMetadata(metadata, targetDate);
      if (weatherWindow) evidence.weatherWindow = weatherWindow;
    }

    const otherInfo = this.buildOtherInfo(metadata, targetDate);
    if (otherInfo) evidence.otherInfo = otherInfo;

    return {
      placeId: place.id,
      placeName: place.nameCN || place.nameEN || '未知地点',
      evidence,
    };
  }

  private buildBusinessHours(
    metadata: Record<string, unknown>,
    targetDate: string,
    timezone: string,
  ): PlaceEvidenceBusinessHoursDto | undefined {
    const openingHours = metadata.openingHours ?? metadata.opening_hours;
    if (!openingHours && !metadata.visit_info) return undefined;

    const checkDate = DateTime.fromISO(targetDate, { zone: timezone }).toJSDate();
    const hoursForDate = OpeningHoursUtil.getHoursForDate(metadata, checkDate, timezone);

    let open: string | undefined;
    let close: string | undefined;
    if (hoursForDate && hoursForDate !== 'Closed' && hoursForDate !== '24 Hours') {
      const parts = hoursForDate.split('-');
      open = parts[0]?.trim();
      close = parts[1]?.trim();
    } else if (hoursForDate === '24 Hours') {
      open = '00:00';
      close = '23:59';
    }

    const exceptions = this.extractBusinessHourExceptions(metadata, targetDate);

    return {
      ...(open ? { open } : {}),
      ...(close ? { close } : {}),
      timezone,
      ...(exceptions.length > 0 ? { exceptions } : {}),
    };
  }

  private extractBusinessHourExceptions(
    metadata: Record<string, unknown>,
    targetDate: string,
  ): PlaceEvidenceBusinessHoursExceptionDto[] {
    const raw =
      (metadata.openingHours as Record<string, unknown> | undefined)?.exceptions ??
      metadata.hourExceptions ??
      metadata.openingHourExceptions;

    if (!Array.isArray(raw)) return [];

    return raw
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as Record<string, unknown>)
      .filter((item) => String(item.date ?? '') === targetDate)
      .map((item) => ({
        date: targetDate,
        ...(typeof item.open === 'string' ? { open: item.open } : {}),
        ...(typeof item.close === 'string' ? { close: item.close } : {}),
        ...(typeof item.closed === 'boolean' ? { closed: item.closed } : {}),
        ...(typeof item.note === 'string' ? { note: item.note } : {}),
      }));
  }

  private buildRoadClosure(
    metadata: Record<string, unknown>,
    targetDate: string,
  ): PlaceEvidenceRoadClosureDto {
    const roadStatus = (metadata.roadStatus ?? metadata.road_status ?? {}) as Record<
      string,
      unknown
    >;
    const closuresRaw = Array.isArray(roadStatus.closures) ? roadStatus.closures : [];
    const closures = closuresRaw
      .filter((c) => c && typeof c === 'object')
      .map((c) => c as Record<string, unknown>)
      .filter((c) => !c.date || String(c.date) === targetDate)
      .map((c) => ({
        date: String(c.date ?? targetDate),
        reason: String(c.reason ?? '道路管制'),
        ...(Array.isArray(c.affectedRoutes)
          ? { affectedRoutes: c.affectedRoutes.map(String) }
          : {}),
        ...(Array.isArray(c.alternativeRoutes)
          ? { alternativeRoutes: c.alternativeRoutes.map(String) }
          : {}),
      }));

    const hasClosure =
      metadata.roadClosure === true ||
      roadStatus.closed === true ||
      closures.length > 0;

    return { hasClosure, ...(closures.length > 0 ? { closures } : {}) };
  }

  private async buildWeatherWindow(
    coords: { lat: number; lng: number } | null,
    targetDate: string,
    timezone: string,
    metadata: Record<string, unknown>,
  ): Promise<PlaceEvidenceWeatherWindowDto | undefined> {
    if (!coords || !this.dataSourceRouter) return undefined;

    try {
      const daily = await this.dataSourceRouter.getDailyWeatherForecast({
        lat: coords.lat,
        lng: coords.lng,
        startDate: targetDate,
        endDate: targetDate,
        timezone,
      });
      const row = daily.find((d) => d.date === targetDate) ?? daily[0];
      if (!row) return undefined;
      return this.mapDailyForecastToWeatherWindow(row, targetDate);
    } catch (e: unknown) {
      this.logger.debug(
        `Open-Meteo forecast unavailable for place coords: ${e instanceof Error ? e.message : e}`,
      );
      return this.buildWeatherFromMetadata(metadata, targetDate);
    }
  }

  private mapDailyForecastToWeatherWindow(
    row: WeatherDailyForecast,
    targetDate: string,
  ): PlaceEvidenceWeatherWindowDto {
    const windSpeed = row.windSpeedMax ?? row.windGustMax;
    const precip = row.precipitationSum;
    const condition = row.condition ?? 'unknown';
    const suitableForOutdoor =
      (windSpeed ?? 0) < 15 &&
      (precip ?? 0) < 5 &&
      !String(condition).match(/storm|snow|heavy/i);

    return {
      date: targetDate,
      condition,
      description: this.describeWeather(condition, row),
      temperature: {
        min: row.temperatureMin,
        max: row.temperatureMax,
        unit: 'celsius',
      },
      precipitation:
        precip != null
          ? {
              probability: precip > 0 ? Math.min(1, precip / 10) : 0,
              amount: precip,
            }
          : undefined,
      wind: windSpeed != null ? { speed: windSpeed, direction: 'variable' } : undefined,
      suitableForOutdoor,
    };
  }

  private buildWeatherFromMetadata(
    metadata: Record<string, unknown>,
    targetDate: string,
  ): PlaceEvidenceWeatherWindowDto | undefined {
    const weatherInfo = (metadata.weatherInfo ?? metadata.weather ?? {}) as Record<
      string,
      unknown
    >;
    if (Object.keys(weatherInfo).length === 0) return undefined;

    const wind = weatherInfo.wind as Record<string, unknown> | undefined;
    const precip = weatherInfo.precipitation as Record<string, unknown> | undefined;

    return {
      date: targetDate,
      condition: String(weatherInfo.condition ?? weatherInfo.weather ?? '未知'),
      description: String(
        weatherInfo.description ??
          `${weatherInfo.condition ?? '未知'}${weatherInfo.temperature ? `，约 ${weatherInfo.temperature}°C` : ''}`,
      ),
      temperature: {
        min: Number(weatherInfo.tempMin ?? weatherInfo.temperature_min) || undefined,
        max: Number(weatherInfo.tempMax ?? weatherInfo.temperature_max ?? weatherInfo.temperature) ||
          undefined,
        unit: 'celsius',
      },
      precipitation: precip
        ? {
            probability: Number(precip.probability ?? precip.probability_percent) || undefined,
            amount: Number(precip.amount ?? precip.amount_mm) || undefined,
          }
        : undefined,
      wind: wind
        ? {
            speed: Number(wind.speed ?? wind.wind_speed) || undefined,
            direction: String(wind.direction ?? wind.wind_direction ?? 'variable'),
          }
        : undefined,
      suitableForOutdoor: weatherInfo.suitableForOutdoor !== false,
    };
  }

  private buildOtherInfo(
    metadata: Record<string, unknown>,
    targetDate: string,
  ): PlaceEvidencePayloadDto['otherInfo'] {
    const otherInfo: NonNullable<PlaceEvidencePayloadDto['otherInfo']> = {};
    const crowd = metadata.crowdLevel;
    if (crowd === 'low' || crowd === 'medium' || crowd === 'high') {
      otherInfo.crowdLevel = crowd;
    }

    const eventsRaw = metadata.specialEvents;
    if (Array.isArray(eventsRaw)) {
      const events = eventsRaw
        .filter((e) => e && typeof e === 'object')
        .map((e) => e as Record<string, unknown>)
        .filter((e) => !e.date || String(e.date) === targetDate)
        .map((e) => ({
          date: String(e.date ?? targetDate),
          name: String(e.name ?? '特别活动'),
          ...(typeof e.impact === 'string' ? { impact: e.impact } : {}),
        }));
      if (events.length > 0) otherInfo.specialEvents = events;
    }

    return Object.keys(otherInfo).length > 0 ? otherInfo : undefined;
  }

  private describeWeather(condition: string, row: WeatherDailyForecast): string {
    const parts = [condition];
    if (row.temperatureMin != null && row.temperatureMax != null) {
      parts.push(`${Math.round(row.temperatureMin)}–${Math.round(row.temperatureMax)}°C`);
    }
    if (row.windSpeedMax != null) {
      parts.push(`阵风约 ${row.windSpeedMax.toFixed(1)} m/s`);
    }
    return parts.join('，');
  }
}
