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

/** Search Car Location 返回的坐标项 */
export interface CarLocationItem {
  latitude?: number;
  longitude?: number;
  coordinates?: { latitude?: number; longitude?: number };
  [key: string]: any;
}

export interface SearchCarLocationParams {
  query: string; // 城市名、机场名或地点，如 "New York", "JFK", "Reykjavik"
}

export interface SearchCarLocationResponse {
  data: CarLocationItem[];
}

/**
 * Booking.com MCP 客户端（通过 RapidAPI）
 * 支持传入 apiKey 或从 process.env 读取（兼容旧用法）
 */
export class BookingComMcpClient {
  private axiosInstance: AxiosInstance;
  private readonly apiKey: string;
  private readonly apiHost: string;
  private readonly baseURL: string = 'https://booking-com15.p.rapidapi.com/api/v1/cars';

  constructor(options?: { apiKey?: string; apiHost?: string }) {
    this.apiKey = (options?.apiKey ?? process.env.RAPIDAPI_BOOKING_COM_API_KEY ?? '').trim();
    this.apiHost = (options?.apiHost ?? process.env.RAPIDAPI_BOOKING_COM_HOST ?? 'booking-com15.p.rapidapi.com').trim();

    if (!this.apiKey) {
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
   * 搜索租车取还车地点（第一步：获取 Booking.com 认可的坐标）
   * 坐标需从此接口获取，直接使用地理编码坐标可能导致 searchCarRentals 返回 status:false
   */
  async searchCarLocation(params: SearchCarLocationParams): Promise<SearchCarLocationResponse> {
    try {
      const response = await this.axiosInstance.get('/searchDestination', {
        params: { query: params.query },
      });

      if (response.data?.status === false) {
        const msg = response.data?.message || 'Upstream service error';
        throw new Error(`Booking.com searchCarLocation error: ${msg}`);
      }

      const rawData = response.data?.data ?? response.data;
      const data = Array.isArray(rawData) ? rawData : [];
      return { data };
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `Booking.com searchCarLocation API error: ${error.response.status} - ${error.response.data?.message || error.message}`
        );
      }
      throw error;
    }
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

      // RapidAPI 上游异常时返回 { status: false, message: "..." }，需抛出以便调用方区分「无结果」与「服务异常」
      if (response.data?.status === false) {
        const msg = response.data?.message || 'Upstream service error';
        throw new Error(`Booking.com upstream error: ${msg}`);
      }

      // 转换响应格式：RapidAPI 成功时返回 { data: [...] }
      const rawData = response.data?.data ?? response.data;
      const data = Array.isArray(rawData) ? rawData : [];
      return {
        data,
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
