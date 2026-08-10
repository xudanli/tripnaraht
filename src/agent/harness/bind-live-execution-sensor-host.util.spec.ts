import {
  bindLiveExecutionSensorHostFromAgent,
  deriveWeatherRiskZhFromBlock,
} from './bind-live-execution-sensor-host.util';
import { tryBuildLiveExecutionFastPath } from '../services/live-execution-fast-path.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('bind-live-execution-sensor-host', () => {
  it('deriveWeatherRiskZhFromBlock flags high wind', () => {
    const block = [
      '【实时天气传感器 MCP】',
      '- 风速: 18.2 m/s',
      '- 状况: 多云',
    ].join('\n');
    expect(deriveWeatherRiskZhFromBlock(block)).toMatch(/大风/);
  });

  it('binds weather MCP + safetravel into live fast path evidence', async () => {
    const agent = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      prisma: {
        trip: {
          findUnique: jest.fn().mockResolvedValue({
            id: 't1',
            destination: 'Iceland',
            destinationCode: 'IS',
            startDate: new Date('2026-06-10'),
            TripDay: [],
          }),
        },
      },
      mcpToolDispatcher: {
        executeTool: jest.fn().mockResolvedValue({
          city: 'Hofn',
          country: 'IS',
          current: {
            time: '2026-06-10T12:00',
            temperature: 8,
            apparent_temperature: 5,
            weather_description: '强风',
            wind_speed: 16,
          },
        }),
      },
      safetravelGetAdvisoriesSkill: {
        execute: jest.fn().mockResolvedValue({
          summary: '南岸有黄色预警',
          gate_recommendation: 'ADJUST_REQUIRED',
          alerts: [{ title: 'South coast wind', severity: 'WARNING' }],
        }),
      },
    };

    const host = bindLiveExecutionSensorHostFromAgent(agent);
    const weather = await host.fetchLiveWeatherBlock!({
      request: {
        request_id: 'r1',
        user_id: 'u',
        trip_id: 't1',
        message: '晚两小时还能去冰河湖吗？雷克雅未克出发',
      } as RouteAndRunRequestDto,
      tripId: 't1',
    });
    expect(weather?.block).toMatch(/风速/);
    expect(weather?.riskZh).toMatch(/大风/);

    const road = await host.fetchLiveRoadBlock!({
      request: {
        request_id: 'r1',
        user_id: 'u',
        trip_id: 't1',
        message: '晚两小时还能去冰河湖吗？',
      } as RouteAndRunRequestDto,
      tripId: 't1',
    });
    expect(road?.alertZh).toMatch(/SafeTravel|南岸/);
    expect(agent.safetravelGetAdvisoriesSkill.execute).toHaveBeenCalled();

    const res = await tryBuildLiveExecutionFastPath(
      agent as any,
      {
        request_id: 'r-live-bind',
        user_id: 'u',
        trip_id: 't1',
        message: '我们晚两个小时，还能去冰河湖吗？',
        options: { remaining_drive_hours: 3.5 },
      } as RouteAndRunRequestDto,
      Date.now(),
    );
    expect(res).toBeTruthy();
    expect((res!.observability as any).live_sensor_audit?.length).toBeGreaterThan(0);
    expect(
      (res!.observability as any).live_execution_conclusion.evidence_count,
    ).toBeGreaterThanOrEqual(1);
  });

  it('SafeTravel BLOCK becomes hard NO via host road alert', async () => {
    const agent = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      fetchLiveWeatherBlock: async () => null,
      fetchLiveRoadBlock: async () => ({
        alertZh: 'SafeTravel门控=BLOCK；红警封路',
        aggregate: 'BLOCK',
      }),
    };
    const res = await tryBuildLiveExecutionFastPath(
      agent,
      {
        request_id: 'r-block',
        user_id: 'u',
        trip_id: 't1',
        message: '晚1小时还能去冰河湖吗？',
        options: {},
      } as RouteAndRunRequestDto,
      Date.now(),
    );
    expect((res!.observability as any).live_execution_conclusion.verdict).toBe('NO');
  });
});
