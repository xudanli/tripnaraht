// src/data-contracts/adapters/iceland-aurora.adapter.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IcelandAuroraAdapter } from './iceland-aurora.adapter';
import { AxiosInstance } from 'axios';

describe('IcelandAuroraAdapter', () => {
  let adapter: IcelandAuroraAdapter;
  let configService: ConfigService;
  let mockHttpClient: jest.Mocked<AxiosInstance>;
  let mockOpenWeatherClient: jest.Mocked<AxiosInstance>;

  beforeEach(async () => {
    // 创建 mock HTTP 客户端
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      request: jest.fn(),
    } as any;

    mockOpenWeatherClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      request: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IcelandAuroraAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    adapter = module.get<IcelandAuroraAdapter>(IcelandAuroraAdapter);
    configService = module.get<ConfigService>(ConfigService);

    // 替换适配器的 HTTP 客户端
    (adapter as any).httpClient = mockHttpClient;
    (adapter as any).openWeatherClient = mockOpenWeatherClient;
  });

  it('应该被定义', () => {
    expect(adapter).toBeDefined();
  });

  describe('getAuroraKPIndex', () => {
    it('应该从 AuroraReach API 获取 KP 指数', async () => {
      const mockKpValue = 4.5;
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: mockKpValue },
      } as any);

      const result = await adapter.getAuroraKPIndex();

      expect(result).toBe(mockKpValue);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api.aurorareach.com/kp',
        { params: { format: 'json' } }
      );
    });

    it('当 AuroraReach API 失败时应该回退到 NOAA API', async () => {
      const mockKpValue = 3.2;
      // AuroraReach 失败
      mockHttpClient.get.mockRejectedValueOnce(new Error('API unavailable'));
      // NOAA 成功
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: mockKpValue },
      } as any);

      const result = await adapter.getAuroraKPIndex();

      expect(result).toBe(mockKpValue);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
      expect(mockHttpClient.get).toHaveBeenNthCalledWith(
        2,
        'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'
      );
    });

    it('当所有 API 都失败时应该返回默认值 3', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('API unavailable'));

      const result = await adapter.getAuroraKPIndex();

      expect(result).toBe(3);
    });

    it('当 API 返回无效数据时应该返回默认值 3', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {},
      } as any);
      mockHttpClient.get.mockResolvedValueOnce({
        data: {},
      } as any);

      const result = await adapter.getAuroraKPIndex();

      expect(result).toBe(3);
    });
  });

  describe('getCloudCover', () => {
    const testLat = 64.1265;
    const testLng = -21.8174; // 雷克雅未克坐标

    it('应该从 OpenWeather API 获取云层覆盖', async () => {
      const mockCloudCover = 25;
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: mockCloudCover } },
      } as any);

      const result = await adapter.getCloudCover(testLat, testLng);

      expect(result).toBe(mockCloudCover);
      expect(configService.get).toHaveBeenCalledWith('OPENWEATHER_API_KEY');
      expect(mockOpenWeatherClient.get).toHaveBeenCalledWith('/weather', {
        params: {
          lat: testLat,
          lon: testLng,
          appid: 'test-api-key',
          units: 'metric',
        },
      });
    });

    it('当 API Key 未配置时应该返回默认值 50', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      const result = await adapter.getCloudCover(testLat, testLng);

      expect(result).toBe(50);
      expect(mockOpenWeatherClient.get).not.toHaveBeenCalled();
    });

    it('当 API 调用失败时应该返回默认值 50', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockRejectedValue(new Error('API error'));

      const result = await adapter.getCloudCover(testLat, testLng);

      expect(result).toBe(50);
    });

    it('当 API 返回数据中没有云层信息时应该返回 0', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: {},
      } as any);

      const result = await adapter.getCloudCover(testLat, testLng);

      expect(result).toBe(0);
    });
  });

  describe('calculateAuroraVisibility', () => {
    const testLat = 64.1265;
    const testLng = -21.8174;

    it('当 KP 指数 < 3 时应该返回 none', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: 2.5 },
      } as any);
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: 10 } },
      } as any);

      const result = await adapter.calculateAuroraVisibility(testLat, testLng);

      expect(result).toBe('none');
    });

    it('当云层覆盖 > 70% 时应该返回 none', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: 4.5 },
      } as any);
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: 80 } },
      } as any);

      const result = await adapter.calculateAuroraVisibility(testLat, testLng);

      expect(result).toBe('none');
    });

    it('当 KP >= 5 且云层覆盖 < 20% 时应该返回 high', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: 5.5 },
      } as any);
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: 15 } },
      } as any);

      const result = await adapter.calculateAuroraVisibility(testLat, testLng);

      expect(result).toBe('high');
    });

    it('当 KP >= 4 且云层覆盖 < 30% 时应该返回 moderate', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: 4.2 },
      } as any);
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: 25 } },
      } as any);

      const result = await adapter.calculateAuroraVisibility(testLat, testLng);

      expect(result).toBe('moderate');
    });

    it('当其他条件满足时应该返回 low', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: 3.5 },
      } as any);
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: 25 } },
      } as any);

      const result = await adapter.calculateAuroraVisibility(testLat, testLng);

      expect(result).toBe('low');
    });

    it('应该接受预计算的 KP 指数和云层覆盖', async () => {
      const result = await adapter.calculateAuroraVisibility(
        testLat,
        testLng,
        4.5,
        20
      );

      expect(result).toBe('moderate');
      expect(mockHttpClient.get).not.toHaveBeenCalled();
      expect(mockOpenWeatherClient.get).not.toHaveBeenCalled();
    });

    it('当计算失败时应该返回默认值（基于默认 KP 和云层覆盖）', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('API error'));
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockRejectedValue(new Error('API error'));

      // 当 API 失败时，适配器返回默认值：KP=3, cloudCover=50
      // KP=3 且 cloudCover=50，根据逻辑应该返回 'low'
      const result = await adapter.calculateAuroraVisibility(testLat, testLng);

      expect(result).toBe('low');
    });
  });

  describe('getAuroraForecast', () => {
    const testLat = 64.1265;
    const testLng = -21.8174;

    it('应该返回极光预测数组', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: 4.5 },
      } as any);
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: 25 } },
      } as any);

      const result = await adapter.getAuroraForecast(testLat, testLng);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('time');
      expect(result[0]).toHaveProperty('kpIndex');
      expect(result[0]).toHaveProperty('cloudCover');
      expect(result[0]).toHaveProperty('visibility');
      expect(result[0].time).toBeInstanceOf(Date);
    });

    it('应该包含正确的预测数据', async () => {
      const mockKp = 4.5;
      const mockCloudCover = 25;
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: mockKp },
      } as any);
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: mockCloudCover } },
      } as any);

      const result = await adapter.getAuroraForecast(testLat, testLng, 24);

      expect(result[0].kpIndex).toBe(mockKp);
      expect(result[0].cloudCover).toBe(mockCloudCover);
      expect(result[0].visibility).toBe('moderate');
    });

    it('当 API 调用失败时应该返回包含默认值的预测数组', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('API error'));
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockRejectedValue(new Error('API error'));

      // 当 API 失败时，适配器返回默认值：KP=3, cloudCover=50
      const result = await adapter.getAuroraForecast(testLat, testLng);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0].kpIndex).toBe(3); // 默认 KP 值
      expect(result[0].cloudCover).toBe(50); // 默认云层覆盖
      expect(result[0].visibility).toBe('low'); // 基于默认值的可见性
    });

    it('应该接受自定义小时数参数', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { kp: 4.5 },
      } as any);
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      mockOpenWeatherClient.get.mockResolvedValueOnce({
        data: { clouds: { all: 25 } },
      } as any);

      const result = await adapter.getAuroraForecast(testLat, testLng, 48);

      expect(result).toBeInstanceOf(Array);
      // 注意：当前实现只返回当前值，未来应该返回多小时的预测
    });
  });
});

