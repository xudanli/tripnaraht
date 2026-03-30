/**
 * 天气预警定时同步服务
 * 
 * 使用 NestJS @Cron 装饰器实现定时任务
 * 每 6 小时从 Open-Meteo API 同步天气预警数据
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import * as https from 'https';

// 主要旅行目的地
const PRIORITY_DESTINATIONS = [
  { region: 'Iceland-Reykjavik', lat: 64.15, lng: -21.95 },
  { region: 'Iceland-Akureyri', lat: 65.68, lng: -18.09 },
  { region: 'Iceland-Vik', lat: 63.42, lng: -19.01 },
  { region: 'Norway-Lofoten', lat: 68.23, lng: 14.22 },
  { region: 'Norway-Tromsø', lat: 69.65, lng: 18.96 },
  { region: 'Switzerland-Zermatt', lat: 46.02, lng: 7.75 },
  { region: 'Switzerland-Grindelwald', lat: 46.62, lng: 8.04 },
  { region: 'NewZealand-Queenstown', lat: -45.03, lng: 168.66 },
  { region: 'NewZealand-Milford', lat: -44.67, lng: 167.93 },
  { region: 'Nepal-Kathmandu', lat: 27.70, lng: 85.32 },
  { region: 'Nepal-Pokhara', lat: 28.21, lng: 83.99 },
  { region: 'Argentina-Ushuaia', lat: -54.80, lng: -68.30 },
  { region: 'Argentina-ElCalafate', lat: -50.34, lng: -72.27 },
  { region: 'Greenland-Ilulissat', lat: 69.22, lng: -51.10 },
  { region: 'Italy-Cortina', lat: 46.54, lng: 12.14 },
];

// 天气代码映射
const WEATHER_CODE_TO_ALERT: Record<number, { type: string; severity: string; description: string }> = {
  95: { type: 'THUNDERSTORM', severity: 'HIGH', description: '雷暴' },
  96: { type: 'THUNDERSTORM_HAIL', severity: 'HIGH', description: '雷暴伴冰雹' },
  99: { type: 'THUNDERSTORM_HAIL', severity: 'CRITICAL', description: '强雷暴伴大冰雹' },
  71: { type: 'SNOW', severity: 'MEDIUM', description: '小雪' },
  73: { type: 'SNOW', severity: 'HIGH', description: '中雪' },
  75: { type: 'SNOW', severity: 'HIGH', description: '大雪' },
  77: { type: 'SNOW_GRAINS', severity: 'MEDIUM', description: '雪粒' },
  85: { type: 'SNOW_SHOWER', severity: 'MEDIUM', description: '小阵雪' },
  86: { type: 'SNOW_SHOWER', severity: 'HIGH', description: '大阵雪' },
  66: { type: 'FREEZING_RAIN', severity: 'HIGH', description: '小冻雨' },
  67: { type: 'FREEZING_RAIN', severity: 'CRITICAL', description: '大冻雨' },
  45: { type: 'FOG', severity: 'MEDIUM', description: '雾' },
  48: { type: 'FOG_RIME', severity: 'HIGH', description: '雾凇/冻雾' },
};

interface WeatherAlert {
  region: string;
  alert_type: string;
  severity: string;
  start_time: Date;
  end_time: Date;
  impact_description: string;
}

@Injectable()
export class WeatherSyncCronService {
  private readonly logger = new Logger(WeatherSyncCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 每 6 小时同步天气预警
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async syncWeatherAlerts(): Promise<void> {
    this.logger.log('开始同步天气预警...');

    try {
      const allAlerts: WeatherAlert[] = [];

      for (const dest of PRIORITY_DESTINATIONS) {
        const data = await this.fetchWeatherData(dest.lat, dest.lng);
        if (data) {
          const alerts = this.analyzeWeatherAlerts(dest.region, data);
          allAlerts.push(...alerts);
        }
        // 避免 API 频率限制
        await this.sleep(200);
      }

      this.logger.log(`检测到 ${allAlerts.length} 个天气预警`);

      // 清理过期预警
      await this.prisma.$executeRaw`
        DELETE FROM realtime_weather_alerts 
        WHERE end_time < NOW() - INTERVAL '1 day'
      `;

      // 插入新预警
      for (const alert of allAlerts) {
        await this.prisma.$executeRaw`
          DELETE FROM realtime_weather_alerts 
          WHERE region = ${alert.region}
            AND alert_type = ${alert.alert_type}
            AND start_time >= ${alert.start_time}::timestamp - INTERVAL '2 hours'
            AND start_time <= ${alert.end_time}::timestamp + INTERVAL '2 hours'
        `;

        await this.prisma.$executeRaw`
          INSERT INTO realtime_weather_alerts (
            id, region, alert_type, severity, 
            start_time, end_time, impact_description,
            created_at, updated_at
          ) VALUES (
            gen_random_uuid(),
            ${alert.region},
            ${alert.alert_type},
            ${alert.severity},
            ${alert.start_time},
            ${alert.end_time},
            ${alert.impact_description},
            NOW(),
            NOW()
          )
        `;
      }

      this.logger.log(`天气预警同步完成，共 ${allAlerts.length} 条`);
    } catch (error) {
      this.logger.error('天气预警同步失败', error);
    }
  }

  private async fetchWeatherData(lat: number, lng: number): Promise<any> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=weather_code,wind_speed_10m,wind_gusts_10m,visibility,precipitation,temperature_2m&timezone=UTC&forecast_days=3`;

    return new Promise((resolve) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      }).on('error', () => resolve(null));
    });
  }

  private analyzeWeatherAlerts(region: string, data: any): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];
    if (!data.hourly) return alerts;

    const { time, weather_code, wind_speed_10m, wind_gusts_10m, visibility, temperature_2m } = data.hourly;

    let currentAlert: WeatherAlert | null = null;

    for (let i = 0; i < time.length; i++) {
      const code = weather_code[i];
      const wind = wind_speed_10m[i];
      const gusts = wind_gusts_10m[i];
      const vis = visibility[i];
      const temp = temperature_2m[i];
      const hourTime = new Date(time[i]);

      let alertInfo: { type: string; severity: string; description: string } | null = null;

      if (WEATHER_CODE_TO_ALERT[code]) {
        alertInfo = WEATHER_CODE_TO_ALERT[code];
      }

      if (wind > 60 || gusts > 80) {
        const severity = gusts > 100 ? 'CRITICAL' : wind > 80 ? 'HIGH' : 'MEDIUM';
        alertInfo = { type: 'STRONG_WIND', severity, description: `强风 ${Math.round(wind)} km/h，阵风 ${Math.round(gusts)} km/h` };
      }

      if (vis < 1000) {
        const severity = vis < 200 ? 'CRITICAL' : vis < 500 ? 'HIGH' : 'MEDIUM';
        alertInfo = { type: 'LOW_VISIBILITY', severity, description: `低能见度 ${Math.round(vis)}m` };
      }

      if (temp < -20) {
        const severity = temp < -30 ? 'CRITICAL' : 'HIGH';
        alertInfo = { type: 'EXTREME_COLD', severity, description: `极端低温 ${Math.round(temp)}°C` };
      }

      if (alertInfo) {
        if (currentAlert && currentAlert.alert_type === alertInfo.type) {
          currentAlert.end_time = new Date(hourTime.getTime() + 3600000);
        } else {
          if (currentAlert) alerts.push(currentAlert);
          currentAlert = {
            region,
            alert_type: alertInfo.type,
            severity: alertInfo.severity,
            start_time: hourTime,
            end_time: new Date(hourTime.getTime() + 3600000),
            impact_description: alertInfo.description,
          };
        }
      } else if (currentAlert) {
        alerts.push(currentAlert);
        currentAlert = null;
      }
    }

    if (currentAlert) alerts.push(currentAlert);

    return alerts.filter((a) => a.end_time.getTime() - a.start_time.getTime() >= 2 * 3600000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
