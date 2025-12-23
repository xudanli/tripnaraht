// src/data-contracts/interfaces/weather.interface.ts

/**
 * 天气数据标准接口
 * 
 * 所有天气数据源（OpenWeather、本地天气 API 等）都必须转换为这个标准格式
 */
export interface WeatherData {
  /** 温度（摄氏度） */
  temperature: number;
  
  /** 天气状况（如 'sunny', 'rainy', 'snowy', 'cloudy'） */
  condition: string;
  
  /** 风速（米/秒，可选） */
  windSpeed?: number;
  
  /** 风向（度，0-360，可选） */
  windDirection?: number;
  
  /** 湿度（百分比，可选） */
  humidity?: number;
  
  /** 能见度（米，可选） */
  visibility?: number;
  
  /** 天气警报（可选） */
  alerts?: WeatherAlert[];
  
  /** 最后更新时间 */
  lastUpdated: Date;
  
  /** 数据源标识（如 'openweather', 'iceland-weather', 'default'） */
  source: string;
  
  /** 额外元数据（可选） */
  metadata?: Record<string, any>;
}

/**
 * 天气警报
 */
export interface WeatherAlert {
  /** 警报类型（如 'storm', 'snow', 'wind', 'ice'） */
  type: string;
  
  /** 严重程度：'info' | 'warning' | 'critical' */
  severity: 'info' | 'warning' | 'critical';
  
  /** 警报标题 */
  title: string;
  
  /** 警报描述 */
  description: string;
  
  /** 生效时间 */
  effectiveTime?: Date;
  
  /** 过期时间 */
  expiryTime?: Date;
}

/**
 * 天气查询请求
 */
export interface WeatherQuery {
  /** 查询点坐标 */
  lat: number;
  lng: number;
  
  /** 日期（可选，用于查询历史或未来天气） */
  date?: string; // ISO 8601 date
  
  /** 时区（可选） */
  timezone?: string;
  
  /** 冰岛特定：是否包含详细风速信息 */
  includeWindDetails?: boolean;
  
  /** 冰岛特定：是否包含极光信息 */
  includeAuroraInfo?: boolean;
}

/**
 * 扩展的天气数据（包含冰岛特定信息）
 */
export interface ExtendedWeatherData extends WeatherData {
  /** 冰岛特定：最大阵风（米/秒，可选） */
  windGust?: number;
  
  /** 冰岛特定：极光 KP 指数（可选） */
  auroraKPIndex?: number;
  
  /** 冰岛特定：云层覆盖（百分比，可选） */
  cloudCover?: number;
  
  /** 冰岛特定：极光可见性预测（可选） */
  auroraVisibility?: 'none' | 'low' | 'moderate' | 'high';
}

