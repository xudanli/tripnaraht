import {
  formatLiveWeatherSensorBlock,
  runLiveCarRentalSensorBranch,
  runLiveToolWithTimeout,
  shouldAttemptActivitySensor,
  shouldAttemptLiveWeatherSensor,
  shouldAttemptXhsSensor,
} from './lightweight-live-sensors.runner';
import type { LightweightLiveSensorsHost } from './lightweight-live-sensors.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';

describe('lightweight-live-sensors.runner', () => {
  const host = {
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    prisma: {} as any,
    mcpToolDispatcher: {},
  } as LightweightLiveSensorsHost;

  it('runLiveToolWithTimeout resolves before timeout', async () => {
    const out = await runLiveToolWithTimeout(async () => 42, 1000);
    expect(out).toBe(42);
  });

  it('runLiveToolWithTimeout rejects on timeout', async () => {
    await expect(
      runLiveToolWithTimeout(
        () => new Promise((resolve) => setTimeout(() => resolve(1), 200)),
        20,
      ),
    ).rejects.toThrow('LIVE_TOOL_TIMEOUT');
  });

  it('formatLiveWeatherSensorBlock includes temperature', () => {
    const block = formatLiveWeatherSensorBlock(host, {
      current: {
        time: '2026-08-01T12:00',
        temperature: 8,
        apparent_temperature: 6,
        weather_description: 'cloudy',
        wind_speed: 3,
      },
    }, { anchorLabel: 'Reykjavik' });
    expect(block).toContain('8');
    expect(block).toContain('Reykjavik');
  });

  it('shouldAttemptLiveWeatherSensor is boolean', () => {
    const request = {
      message: '今天天气怎么样',
      options: { enable_live_tools: ['weather'] },
    } as RouteAndRunRequestDto;
    const context = {} as AgentContext;
    expect(typeof shouldAttemptLiveWeatherSensor(host, request, context)).toBe(
      'boolean',
    );
  });

  describe('shouldAttemptActivitySensor (P1 predicate convergence)', () => {
    const ctx = { routingTaskType: 'DATA_LOOKUP' } as AgentContext;

    it('预订+冰川徒步 / 提前订 / 蓝湖订票链接 → true', () => {
      expect(
        shouldAttemptActivitySensor(
          host,
          { message: '可以帮我去预订吗，冰川徒步' } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(true);
      expect(
        shouldAttemptActivitySensor(
          host,
          { message: '冰川徒步需要提前订吗' } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(true);
      expect(
        shouldAttemptActivitySensor(
          host,
          { message: '给我蓝湖的订票链接' } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(true);
    });

    it('订酒店 / 租车 → false', () => {
      expect(
        shouldAttemptActivitySensor(
          host,
          { message: '帮我订酒店' } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(false);
      expect(
        shouldAttemptActivitySensor(
          host,
          { message: '帮我租车' } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(false);
    });

    it('这个需要提前订吗？无 referent → false；有日程活动 → true', () => {
      expect(
        shouldAttemptActivitySensor(
          host,
          { message: '这个需要提前订吗？' } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(false);
      expect(
        shouldAttemptActivitySensor(
          host,
          {
            message: '这个需要提前订吗？\n\n[日程] Day4 Day 4 · 冰川徒步',
          } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(true);
    });
  });

  describe('shouldAttemptXhsSensor', () => {
    const ctx = { routingTaskType: 'DATA_LOOKUP' } as AgentContext;

    it('小红书 / 值不值得 → true', () => {
      expect(
        shouldAttemptXhsSensor(
          host,
          {
            message: '这趟行程需要注意什么值不值得，然后看看小红书怎么做',
          } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(true);
    });

    it('推荐酒店 → false', () => {
      expect(
        shouldAttemptXhsSensor(
          host,
          { message: '推荐酒店' } as RouteAndRunRequestDto,
          ctx,
        ),
      ).toBe(false);
    });
  });

  it('无 Booking 时仍可走 CarRentalDirect（isCarRentalSearchAvailable）', async () => {
    const executeTool = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'blue',
          nameZh: 'Blue Car Rental',
          cta_zh: '打开官网',
          source: 'catalog_fallback',
          actions: [{ action: 'open_car_rental_url', label: 'Open', labelCN: '打开官网' }],
        },
      ],
      meta: { mode: 'catalog_only', browserbase_available: false },
    });
    const hostWithDirect = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      prisma: {
        trip: {
          findUnique: jest.fn().mockResolvedValue({
            destination: 'IS',
            startDate: new Date('2026-08-10'),
            endDate: new Date('2026-08-20'),
          }),
        },
      } as any,
      mcpToolDispatcher: {
        executeTool,
        isBookingComCarRentalAvailable: () => false,
        isCarRentalSearchAvailable: () => true,
      },
    } as LightweightLiveSensorsHost;
    const out = await runLiveCarRentalSensorBranch(
      hostWithDirect,
      {
        request_id: 't-car-direct',
        message: '推荐租车公司',
        trip_id: 'trip-1',
      } as RouteAndRunRequestDto,
      { routingTaskType: 'DATA_LOOKUP' } as AgentContext,
      'trip-1',
    );
    expect(executeTool).toHaveBeenCalled();
    expect(out.carRentals?.length).toBe(1);
    expect(out.block).toContain('本地车行');
  });
});
