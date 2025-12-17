// src/flight-prices/interfaces/price-prediction.interface.ts

/**
 * 价格预测结果
 */
export interface PriceForecast {
  /** 日期 (ISO 8601 date) */
  date: string;
  
  /** 预测价格 */
  price: number;
  
  /** 置信区间下界 */
  lower_bound: number;
  
  /** 置信区间上界 */
  upper_bound: number;
  
  /** 趋势方向 */
  trend: 'up' | 'down' | 'stable';
  
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * 买入信号
 */
export interface BuySignal {
  /** 信号类型 */
  signal: 'BUY' | 'WAIT' | 'NEUTRAL';
  
  /** 原因描述 */
  reason: string;
  
  /** 当前价格 */
  current_price: number;
  
  /** 历史均值 */
  historical_mean: number;
  
  /** 预测价格 */
  predicted_price: number;
  
  /** 价格变化百分比（相对历史均值） */
  price_change_percent: number;
  
  /** 自然语言建议 */
  recommendation: string;
}

/**
 * 历史价格趋势
 */
export interface HistoricalTrend {
  /** 平均价格 */
  mean_price: number;
  
  /** 最低价格 */
  min_price: number;
  
  /** 最高价格 */
  max_price: number;
  
  /** 价格标准差 */
  std_price: number;
  
  /** 样本数量 */
  sample_count: number;
}

/**
 * 机票价格预测请求
 */
export interface FlightPricePredictionRequest {
  /** 出发城市 */
  from_city: string;
  
  /** 目的地城市 */
  to_city: string;
  
  /** 出发日期 (ISO 8601 date) */
  departure_date: string;
  
  /** 返程日期（可选，往返） */
  return_date?: string;
}

/**
 * 机票价格预测响应
 */
export interface FlightPricePredictionResponse {
  /** 当前价格（实时价格或预测价格） */
  current_price: number;
  
  /** 是否为实时价格 */
  is_realtime_price?: boolean;
  
  /** 买入信号 */
  buy_signal: BuySignal;
  
  /** 未来30天预测 */
  forecast: PriceForecast[];
  
  /** 历史价格趋势 */
  historical_trend: HistoricalTrend;
  
  /** 价格对比（如果获取到实时价格） */
  price_comparison?: {
    predicted_price: number;
    realtime_price: number;
    price_difference: number;
    price_difference_percent: number;
    comparison_status: 'MATCH' | 'HIGHER' | 'LOWER';
  };
}

/**
 * 酒店价格预测请求
 */
export interface HotelPricePredictionRequest {
  /** 城市 */
  city: string;
  
  /** 酒店星级 (1-5) */
  star_level: number;
  
  /** 入住日期 (ISO 8601 date) */
  check_in_date: string;
  
  /** 退房日期 (ISO 8601 date) */
  check_out_date: string;
}

/**
 * 酒店价格预测响应
 */
export interface HotelPricePredictionResponse {
  /** 当前价格（每晚） */
  current_price: number;
  
  /** 买入信号 */
  buy_signal: BuySignal;
  
  /** 未来30天预测 */
  forecast: PriceForecast[];
  
  /** 历史价格趋势 */
  historical_trend: HistoricalTrend;
}

