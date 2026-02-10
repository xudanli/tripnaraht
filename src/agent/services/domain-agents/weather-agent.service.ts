import { Injectable, Logger, Optional } from '@nestjs/common';
import { WeatherAgent, GeoPoint, EvidenceRef, DataQuality } from '../../interfaces/sub-agent.interface';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';
// 护城河扩展：实时世界状态更新
import { RealtimeWeatherService } from '../../../skills/world/services/realtime-weather.service';

@Injectable()
export class WeatherAgentService implements WeatherAgent {
  private readonly logger = new Logger(WeatherAgentService.name);

  constructor(
    @Optional() private readonly dataRouter?: DataSourceRouterService,
    // 护城河扩展：实时天气服务
    @Optional() private readonly realtimeWeatherService?: RealtimeWeatherService,
  ) {
    this.logger.log('[WeatherAgent] Initialized');
  }

  async getForecast(
    location: GeoPoint,
    dateRange: { start: string; end: string },
  ): Promise<{
    forecasts: Array<{
      date: string;
      temperature: { min: number; max: number };
      precipitation: { probability: number; type: string; amount_mm: number };
      wind: { speed_kmh: number; gust_kmh: number; direction: string };
      visibility_km: number;
      travel_suitability: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DANGEROUS';
    }>;
    overall_confidence: number;
    data_freshness: { last_update: string; reliability: number };
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }> {
    const evidence: EvidenceRef[] = [];
    const forecasts: Array<{
      date: string;
      temperature: { min: number; max: number };
      precipitation: { probability: number; type: string; amount_mm: number };
      wind: { speed_kmh: number; gust_kmh: number; direction: string };
      visibility_km: number;
      travel_suitability: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DANGEROUS';
    }> = [];

    try {
      if (this.dataRouter) {
        const weatherData = await this.dataRouter.getWeather({
          lat: location.lat,
          lng: location.lng,
          date: dateRange.start,
        });

        if (weatherData) {
          const startDate = new Date(dateRange.start);
          const endDate = new Date(dateRange.end);
          const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          // Map WeatherData interface to forecast format
          const temp = weatherData.temperature ?? 10;
          const windSpeedMs = weatherData.windSpeed ?? 5;
          const windSpeedKmh = windSpeedMs * 3.6;
          const visibilityM = weatherData.visibility ?? 10000;
          const condition = weatherData.condition ?? 'cloudy';

          for (let i = 0; i < Math.min(days, 7); i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];

            forecasts.push({
              date: dateStr,
              temperature: {
                min: temp - 5,
                max: temp + 5,
              },
              precipitation: {
                probability: condition.includes('rain') || condition.includes('snow') ? 0.7 : 0.3,
                type: condition.includes('snow') ? 'snow' : 'rain',
                amount_mm: condition.includes('rain') ? 5 : condition.includes('snow') ? 3 : 0,
              },
              wind: {
                speed_kmh: Math.round(windSpeedKmh),
                gust_kmh: Math.round(windSpeedKmh * 1.5),
                direction: this.degreeToDirection(weatherData.windDirection ?? 225),
              },
              visibility_km: Math.round(visibilityM / 1000),
              travel_suitability: this.assessTravelSuitabilityFromData(weatherData),
            });
          }

          evidence.push({
            evidence_id: `weather_forecast_${Date.now()}`,
            source: 'WeatherAgent.getForecast',
            timestamp: new Date().toISOString(),
            data: { location, days_requested: days, source: 'DATA_ROUTER' },
          });

          // 护城河扩展：查询实时天气预警
          if (this.realtimeWeatherService) {
            try {
              // 获取区域代码（简化处理，实际应该根据location获取）
              const region = 'IS'; // TODO: 根据location获取实际区域代码
              const realtimeAlerts = await this.realtimeWeatherService.getWeatherAlerts(
                region,
                { start: startDate, end: endDate },
              );

              if (realtimeAlerts.length > 0) {
                // 将实时预警添加到evidence
                evidence.push({
                  evidence_id: `realtime_weather_alerts_${Date.now()}`,
                  source: 'RealtimeWeatherService.getWeatherAlerts',
                  timestamp: new Date().toISOString(),
                  data: {
                    alerts_count: realtimeAlerts.length,
                    alerts: realtimeAlerts.map((a) => ({
                      type: a.alertType,
                      severity: a.severity,
                      impact: a.impact,
                    })),
                  },
                });

                // 如果有CRITICAL或HIGH级别的预警，更新forecasts的travel_suitability
                const criticalAlerts = realtimeAlerts.filter(
                  (a) => a.severity === 'CRITICAL' || a.severity === 'HIGH',
                );
                if (criticalAlerts.length > 0) {
                  forecasts.forEach((forecast) => {
                    // 检查预警是否影响该日期
                    const forecastDate = new Date(forecast.date);
                    const affected = criticalAlerts.some(
                      (alert) =>
                        forecastDate >= alert.startTime && forecastDate <= alert.endTime,
                    );
                    if (affected) {
                      forecast.travel_suitability = 'DANGEROUS';
                    }
                  });
                }
              }
            } catch (error: any) {
              this.logger.warn(
                `[WeatherAgent] 获取实时天气预警失败: ${error?.message}`,
              );
              // 不抛出错误，降级到静态数据
            }
          }
        }
      }

      if (forecasts.length === 0) {
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        for (let i = 0; i < Math.min(days, 7); i++) {
          const date = new Date(startDate);
          date.setDate(date.getDate() + i);
          forecasts.push({
            date: date.toISOString().split('T')[0],
            temperature: { min: 5, max: 15 },
            precipitation: { probability: 0.3, type: 'rain', amount_mm: 5 },
            wind: { speed_kmh: 20, gust_kmh: 35, direction: 'W' },
            visibility_km: 15,
            travel_suitability: 'GOOD',
          });
        }

        evidence.push({
          evidence_id: `weather_fallback_${Date.now()}`,
          source: 'WeatherAgent.getForecast',
          timestamp: new Date().toISOString(),
          data: { location, fallback: true, reason: 'NO_DATA_ROUTER' },
        });
      }
    } catch (e: any) {
      this.logger.warn(`[WeatherAgent] Failed to get forecast: ${e?.message}`);
      evidence.push({
        evidence_id: `weather_error_${Date.now()}`,
        source: 'WeatherAgent.getForecast',
        timestamp: new Date().toISOString(),
        data: { error: e?.message },
      });
    }

    const daysAhead = Math.ceil((new Date(dateRange.start).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const confidence = daysAhead <= 3 ? 0.85 : daysAhead <= 7 ? 0.7 : daysAhead <= 14 ? 0.5 : 0.3;

    const hasRealData = this.dataRouter && evidence.some(e => e.data?.source === 'DATA_ROUTER');
    return {
      forecasts,
      overall_confidence: confidence,
      data_freshness: {
        last_update: new Date().toISOString(),
        reliability: this.dataRouter ? 0.9 : 0.5,
      },
      evidence,
      data_quality: this.createDataQuality({
        sourceType: hasRealData ? 'REALTIME_API' : 'ESTIMATED',
        confidence,
        coverage: forecasts.length > 0 ? 1.0 : 0.0,
        fallbackInfo: !hasRealData ? {
          original_source: 'DataSourceRouter',
          fallback_reason: 'Weather data unavailable',
          quality_impact: 'MODERATE',
        } : undefined,
      }),
    };
  }

  async assessRoadClosureProbability(
    route: GeoPoint[],
    date: string,
  ): Promise<{
    overall_closure_probability: number;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    closure_factors: Array<{
      factor: 'SNOW' | 'ICE' | 'FLOODING' | 'WIND' | 'VISIBILITY' | 'OTHER';
      probability: number;
      impact: string;
    }>;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }> {
    const evidence: EvidenceRef[] = [];
    const closureFactors: Array<{
      factor: 'SNOW' | 'ICE' | 'FLOODING' | 'WIND' | 'VISIBILITY' | 'OTHER';
      probability: number;
      impact: string;
    }> = [];

    let totalProbability = 0;

    try {
      if (this.dataRouter && route.length > 0) {
        const midPoint = route[Math.floor(route.length / 2)];
        const roadStatus = await this.dataRouter.getRoadStatus({
          lat: midPoint.lat,
          lng: midPoint.lng,
        });

        if (roadStatus) {
          // Map RoadStatus interface (isOpen, riskLevel) to closure factors
          if (!roadStatus.isOpen) {
            totalProbability = 0.95;
            closureFactors.push({
              factor: 'OTHER',
              probability: 0.95,
              impact: roadStatus.reason || 'Road currently closed',
            });
          } else if (roadStatus.riskLevel >= 2) {
            totalProbability = 0.4 + roadStatus.riskLevel * 0.15;
            closureFactors.push({
              factor: 'OTHER',
              probability: totalProbability,
              impact: roadStatus.reason || 'Road has restrictions or hazards',
            });
          }

          evidence.push({
            evidence_id: `road_status_${Date.now()}`,
            source: 'WeatherAgent.assessRoadClosureProbability',
            timestamp: new Date().toISOString(),
            data: { route_points: route.length, road_status: roadStatus },
          });
        }
      }

      const forecast = await this.getForecast(route[0] || { lat: 64, lng: -20 }, { start: date, end: date });
      if (forecast.forecasts.length > 0) {
        const weather = forecast.forecasts[0];
        if (weather.precipitation.probability > 0.7 && weather.temperature.min < 0) {
          closureFactors.push({ factor: 'SNOW', probability: 0.6, impact: 'High snow probability' });
          totalProbability = Math.max(totalProbability, 0.6);
        }
        if (weather.temperature.min < -5 && weather.precipitation.probability > 0.3) {
          closureFactors.push({ factor: 'ICE', probability: 0.5, impact: 'Icing conditions likely' });
          totalProbability = Math.max(totalProbability, 0.5);
        }
        if (weather.wind.gust_kmh > 80) {
          closureFactors.push({ factor: 'WIND', probability: 0.7, impact: 'High winds may close roads' });
          totalProbability = Math.max(totalProbability, 0.7);
        }
        if (weather.visibility_km < 1) {
          closureFactors.push({ factor: 'VISIBILITY', probability: 0.6, impact: 'Very low visibility' });
          totalProbability = Math.max(totalProbability, 0.6);
        }
      }
    } catch (e: any) {
      this.logger.warn(`[WeatherAgent] Failed to assess road closure: ${e?.message}`);
      evidence.push({
        evidence_id: `road_closure_error_${Date.now()}`,
        source: 'WeatherAgent.assessRoadClosureProbability',
        timestamp: new Date().toISOString(),
        data: { error: e?.message },
      });
    }

    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' =
      totalProbability > 0.8 ? 'CRITICAL' :
      totalProbability > 0.5 ? 'HIGH' :
      totalProbability > 0.2 ? 'MEDIUM' : 'LOW';

    const hasRealData = this.dataRouter && closureFactors.length > 0;
    return {
      overall_closure_probability: Math.round(totalProbability * 100) / 100,
      risk_level: riskLevel,
      closure_factors: closureFactors,
      evidence,
      data_quality: this.createDataQuality({
        sourceType: hasRealData ? 'REALTIME_API' : 'ESTIMATED',
        confidence: hasRealData ? 0.8 : 0.5,
        coverage: route.length > 0 ? 1.0 : 0.0,
      }),
    };
  }

  async quantifyWeatherRisk(
    location: GeoPoint,
    date: string,
    activityType: 'DRIVING' | 'HIKING' | 'SIGHTSEEING' | 'OUTDOOR_ACTIVITY',
  ): Promise<{
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    risk_score: number;
    risk_factors: Array<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      description: string;
      mitigation: string;
    }>;
    what_you_pay_for: string;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }> {
    const evidence: EvidenceRef[] = [];
    const riskFactors: Array<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      description: string;
      mitigation: string;
    }> = [];

    let riskScore = 0;

    try {
      const forecast = await this.getForecast(location, { start: date, end: date });
      if (forecast.forecasts.length > 0) {
        const weather = forecast.forecasts[0];

        if (activityType === 'DRIVING') {
          if (weather.wind.gust_kmh > 60) {
            riskFactors.push({ type: 'WIND', severity: 'HIGH', description: 'Strong wind gusts', mitigation: 'Use larger vehicle, drive slowly' });
            riskScore += 30;
          }
          if (weather.visibility_km < 5) {
            riskFactors.push({ type: 'VISIBILITY', severity: 'MEDIUM', description: 'Reduced visibility', mitigation: 'Use fog lights, increase following distance' });
            riskScore += 20;
          }
          if (weather.temperature.min < 0) {
            riskFactors.push({ type: 'ICE', severity: 'MEDIUM', description: 'Potential road ice', mitigation: 'Ensure winter tires, drive cautiously' });
            riskScore += 15;
          }
        } else if (activityType === 'HIKING') {
          if (weather.wind.gust_kmh > 40) {
            riskFactors.push({ type: 'WIND', severity: 'HIGH', description: 'Strong winds on exposed trails', mitigation: 'Choose sheltered routes' });
            riskScore += 35;
          }
          if (weather.precipitation.probability > 0.6) {
            riskFactors.push({ type: 'RAIN', severity: 'MEDIUM', description: 'High rain probability', mitigation: 'Waterproof gear essential' });
            riskScore += 20;
          }
          if (weather.temperature.max < 5) {
            riskFactors.push({ type: 'COLD', severity: 'MEDIUM', description: 'Cold conditions', mitigation: 'Layer up, bring warm drinks' });
            riskScore += 15;
          }
        }

        evidence.push({
          evidence_id: `weather_risk_${Date.now()}`,
          source: 'WeatherAgent.quantifyWeatherRisk',
          timestamp: new Date().toISOString(),
          data: { location, date, activity: activityType, weather_summary: weather },
        });
      }
    } catch (e: any) {
      this.logger.warn(`[WeatherAgent] Failed to quantify risk: ${e?.message}`);
      evidence.push({
        evidence_id: `weather_risk_error_${Date.now()}`,
        source: 'WeatherAgent.quantifyWeatherRisk',
        timestamp: new Date().toISOString(),
        data: { error: e?.message },
      });
    }

    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' =
      riskScore > 60 ? 'CRITICAL' :
      riskScore > 40 ? 'HIGH' :
      riskScore > 20 ? 'MEDIUM' : 'LOW';

    const tradeoffMessages: Record<string, string> = {
      LOW: 'Good conditions - minimal weather impact expected',
      MEDIUM: 'Some weather challenges - flexibility recommended',
      HIGH: 'Significant weather risks - backup plans needed',
      CRITICAL: 'Severe conditions - consider postponing activity',
    };

    return {
      risk_level: riskLevel,
      risk_score: Math.min(100, riskScore),
      risk_factors: riskFactors,
      what_you_pay_for: tradeoffMessages[riskLevel],
      evidence,
      data_quality: this.createDataQuality({
        sourceType: this.dataRouter ? 'REALTIME_API' : 'ESTIMATED',
        confidence: this.dataRouter ? 0.75 : 0.5,
        coverage: 1.0,
      }),
    };
  }

  /**
   * Convert wind direction degrees to compass direction
   */
  private degreeToDirection(degrees: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  }

  /**
   * Assess travel suitability from WeatherData interface
   */
  private assessTravelSuitabilityFromData(weather: any): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DANGEROUS' {
    let score = 100;
    const windSpeedKmh = (weather.windSpeed ?? 5) * 3.6;
    const visibilityKm = (weather.visibility ?? 10000) / 1000;
    const temp = weather.temperature ?? 10;
    const condition = weather.condition ?? '';

    // Wind assessment
    if (windSpeedKmh > 80) score -= 40;
    else if (windSpeedKmh > 50) score -= 20;

    // Visibility assessment
    if (visibilityKm < 1) score -= 40;
    else if (visibilityKm < 5) score -= 20;

    // Precipitation from condition
    if (condition.includes('rain') || condition.includes('snow')) score -= 20;

    // Temperature assessment
    if (temp < -10) score -= 20;
    else if (temp < 0) score -= 10;

    if (score >= 80) return 'EXCELLENT';
    if (score >= 60) return 'GOOD';
    if (score >= 40) return 'FAIR';
    if (score >= 20) return 'POOR';
    return 'DANGEROUS';
  }

  /**
   * 生成数据质量标注
   */
  private createDataQuality(options: {
    sourceType: DataQuality['source_type'];
    confidence: number;
    coverage: number;
    fallbackInfo?: DataQuality['fallback_info'];
  }): DataQuality {
    const now = new Date().toISOString();
    return {
      source_type: options.sourceType,
      freshness_seconds: 0,
      confidence: options.confidence,
      coverage: options.coverage,
      retrieved_at: now,
      expires_at: new Date(Date.now() + 1800000).toISOString(), // 30 minutes for weather
      fallback_info: options.fallbackInfo,
    };
  }
}
