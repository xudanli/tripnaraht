/**
 * 将 AgentService / Orchestrator 宿主能力绑定到 LiveExecutionFastPathHost。
 * LIVE 路径主动拉天气 MCP + SafeTravel（不依赖轻量 DATA_LOOKUP 门闩）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { LiveExecutionFastPathHost } from '../services/live-execution-fast-path.util';
import {
  formatLiveWeatherSensorBlock,
  resolveLiveWeatherLocationForMcp,
  runLiveToolWithTimeout,
} from '../routing/lightweight-live-sensors.runner';
import type { LightweightLiveSensorsHost } from '../routing/lightweight-live-sensors.host';
import { detectLiveDestinationHint } from '../harness/live-execution-runtime.util';

const LIVE_WEATHER_TIMEOUT_MS = 8_000;

function pickLogger(agent: any): LightweightLiveSensorsHost['logger'] {
  return (
    agent?.logger ?? {
      log: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      error: () => undefined,
    }
  );
}

function resolveMcpDispatcher(agent: any): LightweightLiveSensorsHost['mcpToolDispatcher'] {
  return (
    agent?.mcpToolDispatcher ??
    agent?.claudeOrchestrator?.mcpToolDispatcher ??
    agent?.orchestrator?.mcpToolDispatcher
  );
}

function resolvePrisma(agent: any): LightweightLiveSensorsHost['prisma'] | undefined {
  return agent?.prisma ?? agent?.claudeOrchestrator?.prisma;
}

function resolveSafetravelSkill(agent: any): {
  execute: (input: Record<string, unknown>) => Promise<{
    summary?: string;
    gate_recommendation?: string;
    alerts?: Array<{ title?: string; severity?: string }>;
    safetravel_alerts?: unknown[];
  }>;
} | undefined {
  return (
    agent?.safetravelGetAdvisoriesSkill ??
    agent?.claudeOrchestrator?.safetravelGetAdvisoriesSkill
  );
}

function resolveOntologyRoad(agent: any): {
  summarizeForOntologyNodeIds: (
    ids: string[],
  ) => Promise<Map<string, { aggregateAccessState?: string }> | null | undefined>;
} | undefined {
  return (
    agent?.ontologyRoadStatusProvider ??
    agent?.claudeOrchestrator?.ontologyRoadStatusProvider
  );
}

/** 从天气 MCP 块提炼短风险句 */
export function deriveWeatherRiskZhFromBlock(block: string | null | undefined): string | null {
  const b = String(block ?? '').trim();
  if (!b) return null;
  const wind = b.match(/风速:\s*([\d.]+)\s*m\/s/);
  if (wind && Number(wind[1]) >= 15) {
    return `大风风险：观测风速约 ${wind[1]} m/s`;
  }
  if (/暴风|暴雨|雷暴|极端|blizzard|storm/i.test(b)) {
    return b.split('\n').find((l) => /状况|暴风|极端/.test(l))?.replace(/^[-\s]*/, '').slice(0, 120) ??
      '极端天气风险';
  }
  const desc = b.match(/状况:\s*(.+)/);
  return desc?.[1]?.trim().slice(0, 120) ?? null;
}

function regionKeywordForMessage(message: string): string | undefined {
  const dest = detectLiveDestinationHint(message);
  if (!dest) return undefined;
  if (/冰河|冰川|南岸|维克/i.test(dest) || /冰河|冰川/.test(message)) return 'south';
  if (/蓝湖|雷克雅|Reykjav/i.test(dest) || /蓝湖|雷克雅/.test(message)) return 'reykjavik';
  if (/黄金圈/.test(dest) || /黄金圈/.test(message)) return 'golden';
  return undefined;
}

/**
 * 从 Agent 任意宿主对象构建传感器拉取器；缺依赖时对应 fetch 返回 null（不抛）。
 */
export function bindLiveExecutionSensorHostFromAgent(
  agent: any | undefined,
): LiveExecutionFastPathHost {
  const logger = pickLogger(agent);
  const existing = agent as LiveExecutionFastPathHost | undefined;

  const fetchLiveWeatherBlock =
    existing?.fetchLiveWeatherBlock ??
    (async (input: { request: RouteAndRunRequestDto; tripId?: string }) => {
      const prisma = resolvePrisma(agent);
      const mcp = resolveMcpDispatcher(agent);
      if (!prisma || !mcp) return null;
      const host: LightweightLiveSensorsHost = {
        logger,
        prisma,
        mcpToolDispatcher: mcp,
      };
      try {
        const loc = await resolveLiveWeatherLocationForMcp(
          host,
          input.request,
          input.tripId,
        );
        if (!loc) return null;
        const data = (await runLiveToolWithTimeout(
          () =>
            mcp.executeTool('weather', 'weather.getCurrentWeather', {
              location: loc.location,
              countryCode: loc.countryCode,
            }),
          LIVE_WEATHER_TIMEOUT_MS,
        )) as Record<string, unknown>;
        const block = formatLiveWeatherSensorBlock(host, data, {
          anchorLabel: loc.anchorLabel,
        });
        return { block, riskZh: deriveWeatherRiskZhFromBlock(block) };
      } catch (e: any) {
        logger.warn?.(
          `[LiveExecutionSensor] weather failed: ${e?.message ?? e}`,
        );
        return null;
      }
    });

  const fetchLiveRoadBlock =
    existing?.fetchLiveRoadBlock ??
    (async (input: { request: RouteAndRunRequestDto; tripId?: string }) => {
      const skill = resolveSafetravelSkill(agent);
      if (skill?.execute) {
        try {
          const out = await skill.execute({
            max_items: 25,
            region_keyword: regionKeywordForMessage(input.request.message ?? ''),
          });
          const titles = (out.alerts ?? [])
            .slice(0, 3)
            .map((a) => String(a.title ?? '').trim())
            .filter(Boolean);
          const summary = String(out.summary ?? '').trim();
          const gate = String(out.gate_recommendation ?? 'ALLOW');
          const alertZh = [
            gate !== 'ALLOW' ? `SafeTravel门控=${gate}` : null,
            summary || (titles.length ? titles.join('；') : null),
          ]
            .filter(Boolean)
            .join('；');
          if (!alertZh) return { aggregate: gate };
          return {
            alertZh,
            block: alertZh,
            aggregate: gate,
          };
        } catch (e: any) {
          logger.warn?.(
            `[LiveExecutionSensor] safetravel failed: ${e?.message ?? e}`,
          );
        }
      }

      const ont = resolveOntologyRoad(agent);
      if (ont?.summarizeForOntologyNodeIds) {
        try {
          /** 南岸/冰河湖常用 ontology 节点不够稳时仍给空；仅作兜底 */
          const map = await ont.summarizeForOntologyNodeIds([]);
          if (map && map.size > 0) {
            const first = [...map.values()][0];
            return {
              aggregate: first?.aggregateAccessState,
              alertZh: first?.aggregateAccessState
                ? `路况聚合=${first.aggregateAccessState}`
                : undefined,
            };
          }
        } catch (e: any) {
          logger.warn?.(
            `[LiveExecutionSensor] ontology road failed: ${e?.message ?? e}`,
          );
        }
      }
      return null;
    });

  return {
    logger,
    fetchLiveWeatherBlock,
    fetchLiveRoadBlock,
  };
}
