/**
 * 今日自驾 — WEATHER 天气详情投影（对齐截图）
 */

import type {
  DailyDriveDetailSeverity,
  DailyDriveDimensionStatus,
  DailyDriveWeatherDetailDto,
  DailyDriveWeatherImpactRow,
  DailyDriveWeatherMetricRow,
  DailyDriveWeatherTrendRow,
} from '../dto/mobile-daily-drive.types';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

export type WeatherDetailContext = {
  localDate: string;
  timezone: string;
  tripLabelZh: string;
  dayLabelZh: string;
  contextVersion?: number;
  summaryStatus: DailyDriveDimensionStatus;
  summaryDetailZh: string;
};

export type WeatherEnvEventInput = {
  description?: string;
  severity?: string;
  detectedAt?: string;
  type?: string;
};

export type WeatherDetailProjectionInput = {
  tempC?: number;
  windMsMin?: number;
  windMsMax?: number;
  summaryZh?: string;
  icy?: boolean;
  visibilityZh?: string;
  snowfallZh?: string;
  envEvents?: WeatherEnvEventInput[];
};

function mapStatusToDetailSeverity(
  status: DailyDriveDimensionStatus,
): DailyDriveDetailSeverity {
  if (status === 'BLOCKED') return 'BLOCKED';
  if (status === 'ATTENTION') return 'ATTENTION';
  return 'OK';
}

function blobOf(input: WeatherDetailProjectionInput): string {
  return [
    input.summaryZh ?? '',
    ...(input.envEvents ?? []).map((e) => e.description ?? ''),
  ]
    .join(' ')
    .toLowerCase();
}

/** 从文案解析气温 / 风速区间 */
export function parseWeatherSignals(blob: string): {
  tempC?: number;
  windMsMin?: number;
  windMsMax?: number;
  icy: boolean;
  snow: boolean;
  rain: boolean;
  crosswind: boolean;
  poorVisibility: boolean;
} {
  const text = blob;
  let tempC: number | undefined;
  const tempMatch = text.match(/(-?\d+(?:\.\d+)?)\s*°?\s*[cC℃]/);
  if (tempMatch) tempC = Number(tempMatch[1]);

  let windMsMin: number | undefined;
  let windMsMax: number | undefined;
  const range = text.match(/(\d+(?:\.\d+)?)\s*[-–~到至]\s*(\d+(?:\.\d+)?)\s*m\s*\/?\s*s/i);
  const single = text.match(/(\d+(?:\.\d+)?)\s*m\s*\/?\s*s/i);
  if (range) {
    windMsMin = Number(range[1]);
    windMsMax = Number(range[2]);
  } else if (single) {
    windMsMax = Number(single[1]);
    windMsMin = Math.max(0, Math.round(windMsMax * 0.7));
  }

  const icy = /冰|结冰|湿滑|icy|ice|frost/i.test(text);
  const snow = /降雪|积雪|blizzard|snowfall|\bsnow\b/i.test(text);
  const rain = /雨|暴雨|降雨|rain|sleet/i.test(text);
  const crosswind = /侧风|横风|阵风|大风|强风|cross.?wind|gust|wind/i.test(text);
  const poorVisibility =
    /能见度\s*(差|低|不良)|浓雾|雾|暴雨|白茫茫|visibility\s*(poor|low)/i.test(text);

  return { tempC, windMsMin, windMsMax, icy, snow, rain, crosswind, poorVisibility };
}

function formatWindZh(min?: number, max?: number): string {
  if (min != null && max != null) return `${Math.round(min)}-${Math.round(max)} m/s`;
  if (max != null) return `${Math.round(max)} m/s`;
  return '待评估';
}

function impactTone(
  severity: DailyDriveDetailSeverity,
  mildZh: string,
  cautionZh: string,
  badZh: string,
): { statusZh: string; severity: DailyDriveDetailSeverity } {
  if (severity === 'BLOCKED') return { statusZh: badZh, severity };
  if (severity === 'ATTENTION' || severity === 'CAUTION') {
    return { statusZh: cautionZh, severity };
  }
  return { statusZh: mildZh, severity: 'OK' };
}

function buildTrends(
  events: WeatherEnvEventInput[],
  signals: ReturnType<typeof parseWeatherSignals>,
): DailyDriveWeatherTrendRow[] {
  const fromEvents = events
    .filter((e) => e.description)
    .slice(0, 6)
    .map((e) => {
      let timeZh = '—';
      if (e.detectedAt) {
        // ISO or already local; take HH:mm
        const m = e.detectedAt.match(/T(\d{2}):(\d{2})/);
        timeZh = m ? `${m[1]}:${m[2]}` : e.detectedAt.slice(11, 16);
      }
      return {
        timeZh,
        labelZh: (e.description ?? '天气动态').slice(0, 48),
        iconHint: /风|wind/i.test(e.description ?? '')
          ? 'wind'
          : /雪|snow/i.test(e.description ?? '')
            ? 'snowflake'
            : 'cloud',
      };
    });
  if (fromEvents.length >= 2) return fromEvents;

  // 合成 4 段 6 小时趋势（无多事件时）
  const base = fromEvents[0]?.labelZh;
  const slots: Array<{ h: number; label: string; icon: string }> = [
    { h: 9, label: signals.crosswind ? '侧风轻微' : '天气平稳', icon: 'wind' },
    {
      h: 11,
      label: signals.windMsMax != null && signals.windMsMax >= 12 ? '风力增强' : '风力平稳',
      icon: 'wind',
    },
    { h: 13, label: signals.rain ? '降水持续' : '多云稳定', icon: 'cloud' },
    {
      h: 16,
      label:
        signals.windMsMax != null
          ? `近海阵风 ${Math.round(signals.windMsMax * 0.9)}-${Math.round(signals.windMsMax)} m/s`
          : base?.slice(0, 28) || '傍晚观察风力',
      icon: 'wind',
    },
  ];
  return slots.map((s) => ({
    timeZh: `${String(s.h).padStart(2, '0')}:00`,
    labelZh: s.label,
    iconHint: s.icon,
  }));
}

function heroTitle(severity: DailyDriveDetailSeverity): string {
  if (severity === 'BLOCKED') return '建议暂缓出发，先评估天气';
  if (severity === 'ATTENTION' || severity === 'CAUTION') {
    return '可继续驾驶，需注意天气风险';
  }
  return '可继续按计划驾驶';
}

export function projectWeatherDetailRich(
  ctx: WeatherDetailContext,
  input: WeatherDetailProjectionInput,
): DailyDriveWeatherDetailDto {
  const blob = blobOf(input);
  const parsed = parseWeatherSignals(blob);
  const tempC = input.tempC ?? parsed.tempC;
  const windMsMin = input.windMsMin ?? parsed.windMsMin;
  const windMsMax = input.windMsMax ?? parsed.windMsMax;
  const icy = input.icy ?? parsed.icy;
  const snow = parsed.snow;
  const poorVis =
    parsed.poorVisibility ||
    (input.visibilityZh ? /差|低|不良/.test(input.visibilityZh) : false);

  let severity = mapStatusToDetailSeverity(ctx.summaryStatus);
  if (icy && severity === 'OK') severity = 'ATTENTION';
  if (windMsMax != null && windMsMax >= 12 && severity === 'OK') severity = 'CAUTION';
  if (windMsMax != null && windMsMax >= 20) severity = 'BLOCKED';
  if (
    (input.envEvents ?? []).some(
      (e) => e.severity === 'red' || e.severity === 'high',
    )
  ) {
    severity = 'BLOCKED';
  } else if (
    severity === 'OK' &&
    (input.envEvents ?? []).some(
      (e) => e.severity === 'yellow' || e.severity === 'medium',
    )
  ) {
    severity = 'ATTENTION';
  }

  const visibilityZh =
    input.visibilityZh ??
    (poorVis ? '偏差' : severity === 'BLOCKED' && parsed.rain ? '偏差' : '良好');
  const snowfallZh =
    input.snowfallZh ?? (snow ? '有降雪风险' : '无明显降雪');

  const windZh = formatWindZh(windMsMin, windMsMax);
  const tempZh = tempC != null ? `${Math.round(tempC)}℃` : '待评估';

  const metrics: DailyDriveWeatherMetricRow[] = [
    { id: 'TEMP', labelZh: '气温', valueZh: tempZh, iconHint: 'thermometer' },
    { id: 'WIND', labelZh: '风力', valueZh: windZh, iconHint: 'wind' },
    { id: 'VISIBILITY', labelZh: '能见度', valueZh: visibilityZh, iconHint: 'eye' },
    { id: 'SNOWFALL', labelZh: '降雪', valueZh: snowfallZh, iconHint: 'snowflake' },
  ];

  const crossSeverity: DailyDriveDetailSeverity =
    windMsMax != null && windMsMax >= 18
      ? 'BLOCKED'
      : windMsMax != null && windMsMax >= 12
        ? 'ATTENTION'
        : parsed.crosswind
          ? 'ATTENTION'
          : 'OK';
  const iceSeverity: DailyDriveDetailSeverity = icy
    ? 'ATTENTION'
    : 'OK';
  const visSeverity: DailyDriveDetailSeverity = poorVis
    ? 'ATTENTION'
    : 'OK';

  const cross = impactTone(crossSeverity, '轻微影响', '注意', '较强');
  const ice = impactTone(iceSeverity, '低', '注意', '高');
  const vis = impactTone(visSeverity, '正常', '注意', '偏差');

  const impacts: DailyDriveWeatherImpactRow[] = [
    {
      id: 'CROSSWIND',
      titleZh: '横风',
      statusZh: cross.statusZh,
      detailZh:
        windMsMax != null
          ? `阵风约 ${windZh}`
          : parsed.crosswind
            ? '局部侧风'
            : '暂无明显横风',
      severity: cross.severity,
    },
    {
      id: 'ICING',
      titleZh: '结冰可能',
      statusZh: ice.statusZh,
      detailZh: icy ? '低温或湿滑路面，注意结冰' : '结冰风险较低',
      severity: ice.severity,
    },
    {
      id: 'VISIBILITY',
      titleZh: '能见度',
      statusZh: vis.statusZh,
      detailZh: poorVis ? '降水或雾可能降低能见度' : '能见度总体正常',
      severity: vis.severity,
    },
  ];

  const impactParts: string[] = [];
  if (parsed.crosswind || (windMsMax != null && windMsMax >= 8)) {
    impactParts.push('局部侧风');
  }
  if (icy || (tempC != null && tempC <= 0)) impactParts.push('低温');
  if (snow) impactParts.push('降雪');
  if (poorVis) impactParts.push('能见度偏差');
  if (parsed.rain && !snow) impactParts.push('降雨湿滑');
  const mainImpactZh =
    impactParts.length > 0
      ? `当前主要影响：${impactParts.join('、')}`
      : '当前无明显驾驶天气影响';

  const summaryLineZh = [
    tempZh !== '待评估' ? tempZh : null,
    windZh !== '待评估' ? `阵风 ${windZh}` : null,
    `能见度${visibilityZh}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const trends = buildTrends(input.envEvents ?? [], parsed);

  const suggestionsZh: string[] = [];
  if (parsed.crosswind || (windMsMax != null && windMsMax >= 8)) {
    suggestionsZh.push('暴露路段双手握紧方向盘，降低车速');
  }
  suggestionsZh.push('与前车保持更大安全距离');
  if (icy) suggestionsZh.push('出发前检查轮胎与除霜，阴影路段防滑');
  suggestionsZh.push('如风力增强，停车前请重新查看天气');

  return {
    schemaId: DAILY_DRIVE_DIMENSION_SCHEMA_IDS.WEATHER,
    localDate: ctx.localDate,
    timezone: ctx.timezone,
    contextVersion: ctx.contextVersion,
    context: {
      tripLabelZh: ctx.tripLabelZh,
      dayLabelZh: ctx.dayLabelZh,
    },
    hero: {
      titleZh: heroTitle(severity),
      detailZh: summaryLineZh || ctx.summaryDetailZh || '暂无显著天气影响',
      metaZh: mainImpactZh,
      severity,
      iconHint: 'cloud.sun',
    },
    primaryAction: {
      labelZh: '开启天气提醒',
      action: 'ENABLE_WEATHER_REMINDERS',
    },
    summaryLineZh: summaryLineZh || undefined,
    mainImpactZh,
    metrics,
    trends,
    impacts,
    suggestionsZh,
    reminderSettings: [
      { id: 'wind', labelZh: '风力提醒', enabled: true },
      { id: 'snowfall', labelZh: '降雪提醒', enabled: snow || icy },
      { id: 'visibility', labelZh: '能见度提醒', enabled: poorVis },
    ],
  };
}
