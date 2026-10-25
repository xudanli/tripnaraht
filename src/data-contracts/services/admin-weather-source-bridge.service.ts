import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DefaultWeatherAdapter } from '../adapters/default-weather.adapter';
import { WeatherAdapter } from '../adapters/weather.adapter.interface';
import { BaseAdapter } from '../adapters/base.adapter';

export const ADMIN_WEATHER_SOURCE_DEFAULT_BASE_URL =
  'https://api.openweathermap.org/data/2.5';

export const ADMIN_WEATHER_SOURCE_PROBE_QUERY = {
  lat: 64.147,
  lng: -21.9408,
} as const;

export type AdminWeatherSourceRuntimePatch = {
  enabled?: boolean;
  baseUrl?: string | null;
};

export type AdminWeatherSourceProbeResult = {
  sourceId: string;
  ok: boolean;
  checkedAt: string;
  detail: string;
};

/**
 * Bridges Physical Domain Admin data-source configs to runtime weather adapters.
 * Currently maps sourceId `weather-api` → DefaultWeatherAdapter (OpenWeather).
 */
@Injectable()
export class AdminWeatherSourceBridge implements OnModuleInit {
  private readonly logger = new Logger(AdminWeatherSourceBridge.name);
  private readonly enabledByAdapterName = new Map<string, boolean>();
  private readonly adaptersBySourceId = new Map<string, WeatherAdapter & BaseAdapter>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly defaultWeather: DefaultWeatherAdapter,
  ) {
    this.adaptersBySourceId.set('weather-api', this.defaultWeather);
  }

  async onModuleInit(): Promise<void> {
    try {
      const rows = await (this.prisma as any).physicalDomainDataSourceConfig.findMany();
      for (const row of rows ?? []) {
        if (!this.adaptersBySourceId.has(row.sourceId)) continue;
        this.applyRuntime(row.sourceId, {
          enabled: row.enabled,
          baseUrl: row.baseUrl,
        });
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to load admin weather source configs on init: ${error?.message || error}`,
      );
    }
  }

  resolveAdapter(sourceId: string): (WeatherAdapter & BaseAdapter) | undefined {
    return this.adaptersBySourceId.get(sourceId);
  }

  isEnabled(adapterName: string): boolean {
    if (!this.enabledByAdapterName.has(adapterName)) {
      return true;
    }
    return this.enabledByAdapterName.get(adapterName) !== false;
  }

  applyRuntime(sourceId: string, patch: AdminWeatherSourceRuntimePatch): void {
    const adapter = this.adaptersBySourceId.get(sourceId);
    if (!adapter) {
      this.logger.debug(`No runtime weather adapter mapped for sourceId=${sourceId}`);
      return;
    }

    if (patch.enabled !== undefined) {
      this.enabledByAdapterName.set(adapter.getName(), patch.enabled);
    }

    if (patch.baseUrl !== undefined && patch.baseUrl !== null && patch.baseUrl.trim()) {
      adapter.setBaseUrl(patch.baseUrl.trim());
    }
  }

  async probe(sourceId: string): Promise<AdminWeatherSourceProbeResult> {
    const checkedAt = new Date().toISOString();
    const adapter = this.adaptersBySourceId.get(sourceId);

    if (!adapter) {
      return {
        sourceId,
        ok: false,
        checkedAt,
        detail: `UNMAPPED_SOURCE:${sourceId}`,
      };
    }

    if (!this.isEnabled(adapter.getName())) {
      return {
        sourceId,
        ok: false,
        checkedAt,
        detail: 'DISABLED',
      };
    }

    try {
      const weather = await adapter.getWeather({ ...ADMIN_WEATHER_SOURCE_PROBE_QUERY });
      const temp =
        typeof weather.temperature === 'number' ? `${weather.temperature}C` : 'n/a';
      return {
        sourceId,
        ok: true,
        checkedAt,
        detail: `OK source=${weather.source ?? adapter.getName()} temp=${temp}`,
      };
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error?.message ||
        error?.message ||
        'Unknown error';
      return {
        sourceId,
        ok: false,
        checkedAt,
        detail: `ERROR:${message}`,
      };
    }
  }
}
