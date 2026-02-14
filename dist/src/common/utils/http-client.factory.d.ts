import { AxiosInstance } from 'axios';
export declare class HttpClientFactory {
    static create(config: {
        baseURL?: string;
        timeout?: number;
        headers?: Record<string, string>;
        params?: Record<string, any>;
    }): AxiosInstance;
    static createWithApiKey(apiKey: string | undefined, config: {
        baseURL?: string;
        timeout?: number;
        paramName?: string;
        additionalParams?: Record<string, any>;
    }): AxiosInstance;
}
