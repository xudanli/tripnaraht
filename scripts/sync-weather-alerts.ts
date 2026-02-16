/**
 * 天气预警同步脚本
 * 
 * 功能：
 * 1. 从 Open-Meteo API 获取主要目的地的天气预警
 * 2. 将预警数据存储到 realtime_weather_alerts 表
 * 3. 支持定时同步（通过 cron 调用）
 * 
 * Open-Meteo API (免费无需 API Key):
 * https://open-meteo.com/en/docs
 * 
 * 使用方法：
 *   npx ts-node scripts/sync-weather-alerts.ts
 *   npx ts-node scripts/sync-weather-alerts.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import * as https from 'https';

const prisma = new PrismaClient();

// 主要旅行目的地（国家和代表性城市）
const PRIORITY_DESTINATIONS = [
  // 冰岛（极端天气频繁）
  { region: 'Iceland-Reykjavik', lat: 64.15, lng: -21.95, country: 'IS' },
  { region: 'Iceland-Akureyri', lat: 65.68, lng: -18.09, country: 'IS' },
  { region: 'Iceland-Vik', lat: 63.42, lng: -19.01, country: 'IS' },
  // 挪威
  { region: 'Norway-Lofoten', lat: 68.23, lng: 14.22, country: 'NO' },
  { region: 'Norway-Tromsø', lat: 69.65, lng: 18.96, country: 'NO' },
  // 瑞士
  { region: 'Switzerland-Zermatt', lat: 46.02, lng: 7.75, country: 'CH' },
  { region: 'Switzerland-Grindelwald', lat: 46.62, lng: 8.04, country: 'CH' },
  // 新西兰
  { region: 'NewZealand-Queenstown', lat: -45.03, lng: 168.66, country: 'NZ' },
  { region: 'NewZealand-Milford', lat: -44.67, lng: 167.93, country: 'NZ' },
  // 尼泊尔
  { region: 'Nepal-Kathmandu', lat: 27.70, lng: 85.32, country: 'NP' },
  { region: 'Nepal-Pokhara', lat: 28.21, lng: 83.99, country: 'NP' },
  // 阿根廷
  { region: 'Argentina-Ushuaia', lat: -54.80, lng: -68.30, country: 'AR' },
  { region: 'Argentina-ElCalafate', lat: -50.34, lng: -72.27, country: 'AR' },
  // 格陵兰
  { region: 'Greenland-Ilulissat', lat: 69.22, lng: -51.10, country: 'GL' },
  // 意大利（多洛米蒂）
  { region: 'Italy-Cortina', lat: 46.54, lng: 12.14, country: 'IT' },
];

// 天气代码对应的预警类型
const WEATHER_CODE_TO_ALERT: Record<number, { type: string; severity: string; description: string }> = {
  // 雷暴
  95: { type: 'THUNDERSTORM', severity: 'HIGH', description: '雷暴' },
  96: { type: 'THUNDERSTORM_HAIL', severity: 'HIGH', description: '雷暴伴冰雹' },
  99: { type: 'THUNDERSTORM_HAIL', severity: 'CRITICAL', description: '强雷暴伴大冰雹' },
  // 降雪
  71: { type: 'SNOW', severity: 'MEDIUM', description: '小雪' },
  73: { type: 'SNOW', severity: 'HIGH', description: '中雪' },
  75: { type: 'SNOW', severity: 'HIGH', description: '大雪' },
  77: { type: 'SNOW_GRAINS', severity: 'MEDIUM', description: '雪粒' },
  85: { type: 'SNOW_SHOWER', severity: 'MEDIUM', description: '小阵雪' },
  86: { type: 'SNOW_SHOWER', severity: 'HIGH', description: '大阵雪' },
  // 冻雨
  66: { type: 'FREEZING_RAIN', severity: 'HIGH', description: '小冻雨' },
  67: { type: 'FREEZING_RAIN', severity: 'CRITICAL', description: '大冻雨' },
  // 雾
  45: { type: 'FOG', severity: 'MEDIUM', description: '雾' },
  48: { type: 'FOG_RIME', severity: 'HIGH', description: '雾凇/冻雾' },
  // 大风（由风速判断）
};

interface WeatherResponse {
  latitude: number;
  longitude: number;
  hourly?: {
    time: string[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    visibility: number[];
    precipitation: number[];
    temperature_2m: number[];
  };
}

async function fetchWeatherData(lat: number, lng: number): Promise<WeatherResponse | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=weather_code,wind_speed_10m,wind_gusts_10m,visibility,precipitation,temperature_2m&timezone=UTC&forecast_days=3`;
  
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

interface WeatherAlert {
  region: string;
  alert_type: string;
  severity: string;
  start_time: Date;
  end_time: Date;
  impact_description: string;
}

function analyzeWeatherAlerts(region: string, data: WeatherResponse): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  if (!data.hourly) return alerts;
  
  const { time, weather_code, wind_speed_10m, wind_gusts_10m, visibility, precipitation, temperature_2m } = data.hourly;
  
  let currentAlert: WeatherAlert | null = null;
  
  for (let i = 0; i < time.length; i++) {
    const code = weather_code[i];
    const wind = wind_speed_10m[i];
    const gusts = wind_gusts_10m[i];
    const vis = visibility[i];
    const precip = precipitation[i];
    const temp = temperature_2m[i];
    const hourTime = new Date(time[i]);
    
    let alertInfo: { type: string; severity: string; description: string } | null = null;
    
    // 检查天气代码
    if (WEATHER_CODE_TO_ALERT[code]) {
      alertInfo = WEATHER_CODE_TO_ALERT[code];
    }
    
    // 检查大风 (> 60 km/h)
    if (wind > 60 || gusts > 80) {
      const severity = gusts > 100 ? 'CRITICAL' : wind > 80 ? 'HIGH' : 'MEDIUM';
      alertInfo = { type: 'STRONG_WIND', severity, description: `强风 ${Math.round(wind)} km/h，阵风 ${Math.round(gusts)} km/h` };
    }
    
    // 检查低能见度 (< 1000m)
    if (vis < 1000) {
      const severity = vis < 200 ? 'CRITICAL' : vis < 500 ? 'HIGH' : 'MEDIUM';
      alertInfo = { type: 'LOW_VISIBILITY', severity, description: `低能见度 ${Math.round(vis)}m` };
    }
    
    // 检查极端低温 (< -20°C)
    if (temp < -20) {
      const severity = temp < -30 ? 'CRITICAL' : 'HIGH';
      alertInfo = { type: 'EXTREME_COLD', severity, description: `极端低温 ${Math.round(temp)}°C` };
    }
    
    // 检查强降水 (> 10mm/h)
    if (precip > 10) {
      const severity = precip > 20 ? 'CRITICAL' : 'HIGH';
      alertInfo = { type: 'HEAVY_PRECIPITATION', severity, description: `强降水 ${precip.toFixed(1)} mm/h` };
    }
    
    if (alertInfo) {
      if (currentAlert && currentAlert.alert_type === alertInfo.type) {
        // 延长当前预警
        currentAlert.end_time = new Date(hourTime.getTime() + 3600000);
      } else {
        // 保存前一个预警
        if (currentAlert) {
          alerts.push(currentAlert);
        }
        // 开始新预警
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
      // 预警结束
      alerts.push(currentAlert);
      currentAlert = null;
    }
  }
  
  // 保存最后一个预警
  if (currentAlert) {
    alerts.push(currentAlert);
  }
  
  // 只保留持续超过 2 小时的预警
  return alerts.filter(a => (a.end_time.getTime() - a.start_time.getTime()) >= 2 * 3600000);
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              天气预警同步脚本 (Open-Meteo)                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 运行模式: 仅检查\n');
  }
  
  const allAlerts: WeatherAlert[] = [];
  
  console.log(`📡 获取 ${PRIORITY_DESTINATIONS.length} 个目的地的天气数据...\n`);
  
  for (const dest of PRIORITY_DESTINATIONS) {
    process.stdout.write(`   ${dest.region}... `);
    
    const data = await fetchWeatherData(dest.lat, dest.lng);
    
    if (!data) {
      console.log('❌ 获取失败');
      continue;
    }
    
    const alerts = analyzeWeatherAlerts(dest.region, data);
    
    if (alerts.length > 0) {
      console.log(`⚠️ ${alerts.length} 个预警`);
      allAlerts.push(...alerts);
    } else {
      console.log('✓ 无预警');
    }
    
    // 避免 API 频率限制
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n📊 共检测到 ${allAlerts.length} 个天气预警\n`);
  
  if (allAlerts.length > 0) {
    console.log('预警详情:');
    for (const alert of allAlerts) {
      console.log(`  [${alert.severity}] ${alert.region}: ${alert.alert_type}`);
      console.log(`      ${alert.impact_description}`);
      console.log(`      ${alert.start_time.toISOString()} - ${alert.end_time.toISOString()}\n`);
    }
  }
  
  if (!isDryRun && allAlerts.length > 0) {
    console.log('📥 存储预警到数据库...\n');
    
    // 清理旧的预警（已过期的）
    const deleteCount = await prisma.$executeRaw`
      DELETE FROM realtime_weather_alerts 
      WHERE end_time < NOW() - INTERVAL '1 day'
    `;
    console.log(`   删除 ${deleteCount} 条过期预警`);
    
    // 插入新预警（先删除同一地区当前时段的旧预警）
    let insertCount = 0;
    for (const alert of allAlerts) {
      // 删除同一地区同一类型重叠时段的旧预警
      await prisma.$executeRaw`
        DELETE FROM realtime_weather_alerts 
        WHERE region = ${alert.region}
          AND alert_type = ${alert.alert_type}
          AND start_time >= ${alert.start_time}::timestamp - INTERVAL '2 hours'
          AND start_time <= ${alert.end_time}::timestamp + INTERVAL '2 hours'
      `;
      
      await prisma.$executeRaw`
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
      insertCount++;
    }
    
    console.log(`   插入/更新 ${insertCount} 条预警\n`);
  }
  
  // 显示当前预警统计
  const stats = await prisma.$queryRaw<any[]>`
    SELECT severity, COUNT(*) as count
    FROM realtime_weather_alerts
    WHERE end_time > NOW()
    GROUP BY severity
    ORDER BY 
      CASE severity 
        WHEN 'CRITICAL' THEN 1 
        WHEN 'HIGH' THEN 2 
        WHEN 'MEDIUM' THEN 3 
        ELSE 4 
      END
  `;
  
  console.log('📈 当前有效预警统计:');
  if (stats.length === 0) {
    console.log('   暂无有效预警');
  } else {
    stats.forEach((s: any) => console.log(`   ${s.severity}: ${s.count} 条`));
  }
  
  console.log('\n✅ 脚本执行完成\n');
}

main()
  .catch((e) => {
    console.error('❌ 执行失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export {};
