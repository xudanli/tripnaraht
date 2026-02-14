export interface PriceForecast {
    date: string;
    price: number;
    lower_bound: number;
    upper_bound: number;
    trend: 'up' | 'down' | 'stable';
    confidence: number;
}
export interface BuySignal {
    signal: 'BUY' | 'WAIT' | 'NEUTRAL';
    reason: string;
    current_price: number;
    historical_mean: number;
    predicted_price: number;
    price_change_percent: number;
    recommendation: string;
}
export interface HistoricalTrend {
    mean_price: number;
    min_price: number;
    max_price: number;
    std_price: number;
    sample_count: number;
}
export interface FlightPricePredictionRequest {
    from_city: string;
    to_city: string;
    departure_date: string;
    return_date?: string;
}
export interface FlightPricePredictionResponse {
    current_price: number;
    is_realtime_price?: boolean;
    buy_signal: BuySignal;
    forecast: PriceForecast[];
    historical_trend: HistoricalTrend;
    price_comparison?: {
        predicted_price: number;
        realtime_price: number;
        price_difference: number;
        price_difference_percent: number;
        comparison_status: 'MATCH' | 'HIGHER' | 'LOWER';
    };
}
export interface HotelPricePredictionRequest {
    city: string;
    star_level: number;
    check_in_date: string;
    check_out_date: string;
}
export interface HotelPricePredictionResponse {
    current_price: number;
    buy_signal: BuySignal;
    forecast: PriceForecast[];
    historical_trend: HistoricalTrend;
}
