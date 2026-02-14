export declare class WeatherMcpClient {
    private client;
    private transport;
    private isConnected;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private ensureConnected;
    listTools(): Promise<any>;
    getCurrentWeather(params: {
        city: string;
    }): Promise<any>;
    getWeatherByDatetimeRange(params: {
        city: string;
        start_date: string;
        end_date: string;
    }): Promise<any>;
    getCurrentDateTime(params: {
        timezone?: string;
    }): Promise<any>;
}
export declare function getWeatherClient(): WeatherMcpClient;
