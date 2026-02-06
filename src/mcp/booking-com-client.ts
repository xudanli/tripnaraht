/**
 * Booking.com MCP Client (via RapidAPI)
 * 
 * 用于在代码中直接使用 Booking.com 租车搜索服务的客户端类
 */

import axios, { AxiosInstance } from 'axios';

export interface SearchCarRentalsParams {
  pick_up_latitude: number;
  pick_up_longitude: number;
  drop_off_latitude: number;
  drop_off_longitude: number;
  pick_up_time: string; // HH:mm format
  drop_off_time: string; // HH:mm format
  driver_age: number;
  currency_code?: string; // Default: USD
  location?: string; // Default: US
  pick_up_date?: string; // YYYY-MM-DD format
  drop_off_date?: string; // YYYY-MM-DD format
}

export interface CarRental {
  id: string;
  company: string;
  vehicle_type: string;
  price: {
    amount: number;
    currency: string;
  };
  pickup_location: {
    lat: number;
    lng: number;
    address: string;
  };
  dropoff_location: {
    lat: number;
    lng: number;
    address: string;
  };
  pickup_time: string;
  dropoff_time: string;
  [key: string]: any; // 允许其他字段
}

export interface SearchCarRentalsResponse {
  data: CarRental[];
  meta?: {
    total: number;
    [key: string]: any;
  };
}

/**
 * Booking.com MCP 客户端（通过 RapidAPI）
 */
export class BookingComMcpClient {
  private axiosInstance: AxiosInstance;
  private readonly apiKey: string;
  private readonly apiHost: string;
  private readonly baseURL: string = 'https://booking-com15.p.rapidapi.com/api/v1/cars';

  constructor() {
    this.apiKey = process.env.RAPIDAPI_BOOKING_COM_API_KEY || '';
    this.apiHost = process.env.RAPIDAPI_BOOKING_COM_HOST || 'booking-com15.p.rapidapi.com';

    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error(
        'RAPIDAPI_BOOKING_COM_API_KEY environment variable is required. ' +
        'Please set it in .env file and restart the server.'
      );
    }

    // 创建 Axios 实例
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        'x-rapidapi-host': this.apiHost,
        'x-rapidapi-key': this.apiKey,
      },
      timeout: 10000, // 10秒超时
    });
  }

  /**
   * 搜索租车
   */
  async searchCarRentals(params: SearchCarRentalsParams): Promise<SearchCarRentalsResponse> {
    try {
      const response = await this.axiosInstance.get('/searchCarRentals', {
        params: {
          pick_up_latitude: params.pick_up_latitude,
          pick_up_longitude: params.pick_up_longitude,
          drop_off_latitude: params.drop_off_latitude,
          drop_off_longitude: params.drop_off_longitude,
          pick_up_time: params.pick_up_time,
          drop_off_time: params.drop_off_time,
          driver_age: params.driver_age,
          currency_code: params.currency_code || 'USD',
          location: params.location || 'US',
          ...(params.pick_up_date && { pick_up_date: params.pick_up_date }),
          ...(params.drop_off_date && { drop_off_date: params.drop_off_date }),
        },
      });

      // 转换响应格式
      return {
        data: response.data?.data || response.data || [],
        meta: response.data?.meta,
      };
    } catch (error: any) {
      if (error.response) {
        // API 返回了错误响应
        throw new Error(
          `Booking.com API error: ${error.response.status} - ${error.response.data?.message || error.message}`
        );
      } else if (error.request) {
        // 请求已发送但没有收到响应
        throw new Error('Booking.com API request timeout or network error');
      } else {
        // 请求配置错误
        throw new Error(`Booking.com API request error: ${error.message}`);
      }
    }
  }
}
