/**
 * ClaudeOrchestrator 依赖健康检查注册（从 God Service 迁出）。
 */

import type { DependencyHealthChecksHost } from './dependency-health-checks.host';
import type { DependencyCheckConfig } from '../services/dependency-health-check.service';

export function registerDependencyHealthChecks(host: DependencyHealthChecksHost): void {
  if (!host.dependencyHealthCheck) {
    host.logger.debug('DependencyHealthCheckService 未注入，跳过依赖健康检查注册');
    return;
  }

  const injectedAgentCheck =
    (name: string, agent: unknown): DependencyCheckConfig => ({
      name,
      required: false,
      timeout: 3000,
      check: async () => {
        const start = Date.now();
        if (!agent || typeof agent !== 'object') {
          return { healthy: false, latency: Date.now() - start, error: 'not_injected' };
        }
        return { healthy: true, latency: Date.now() - start };
      },
    });

  const checks: DependencyCheckConfig[] = [];

  if (host.llmService) {
    checks.push({
      name: 'llm_service',
      required: true,
      timeout: 5000,
      check: async () => {
        const probe = host.llmService as { healthProbe?: () => Promise<{ healthy: boolean; latency?: number; error?: string }> };
        if (typeof probe.healthProbe === 'function') {
          return probe.healthProbe();
        }
        const start = Date.now();
        try {
          const provider = (host.llmService as { getDefaultProvider?: () => unknown }).getDefaultProvider?.();
          if (!provider) {
            return { healthy: false, latency: Date.now() - start, error: 'no_default_provider' };
          }
          return { healthy: true, latency: Date.now() - start };
        } catch (error: any) {
          return { healthy: false, latency: Date.now() - start, error: error?.message };
        }
      },
    });
  }

  if (host.plannerAgent) checks.push(injectedAgentCheck('planner_agent', host.plannerAgent));
  if (host.gatekeeperAgent) checks.push(injectedAgentCheck('gatekeeper_agent', host.gatekeeperAgent));
  if (host.complianceAgent) checks.push(injectedAgentCheck('compliance_agent', host.complianceAgent));
  if (host.geoAgent) checks.push(injectedAgentCheck('geo_agent', host.geoAgent));
  if (host.weatherAgent) checks.push(injectedAgentCheck('weather_agent', host.weatherAgent));
  if (host.costAgent) checks.push(injectedAgentCheck('cost_agent', host.costAgent));
  if (host.experienceAgent) checks.push(injectedAgentCheck('experience_agent', host.experienceAgent));

  if (host.decisionKernel) {
    checks.push({
      name: 'decision_kernel',
      required: false,
      timeout: 3000,
      check: async () => {
        const start = Date.now();
        const kernel = host.decisionKernel as {
          finalizeHarnessTraceIfRecorded?: unknown;
        };
        if (typeof kernel?.finalizeHarnessTraceIfRecorded !== 'function') {
          return {
            healthy: false,
            latency: Date.now() - start,
            error: 'kernel_api_missing',
          };
        }
        return { healthy: true, latency: Date.now() - start };
      },
    });
  }

  if (host.chunkRetrieval) {
    checks.push({
      name: 'chunk_retrieval',
      required: false,
      timeout: 5000,
      check: async () => {
        const start = Date.now();
        const svc = host.chunkRetrieval as { retrieve?: unknown };
        if (typeof svc?.retrieve !== 'function') {
          return {
            healthy: false,
            latency: Date.now() - start,
            error: 'retrieve_api_missing',
          };
        }
        return { healthy: true, latency: Date.now() - start };
      },
    });
  }

  if (host.mcpToolDispatcher) {
    checks.push({
      name: 'mcp_tool_dispatcher',
      required: false,
      timeout: 3000,
      check: async () => {
        const start = Date.now();
        const mcp = host.mcpToolDispatcher as {
          executeTool?: unknown;
          isServiceAvailable?: (name: string) => boolean;
        };
        if (typeof mcp?.executeTool !== 'function') {
          return {
            healthy: false,
            latency: Date.now() - start,
            error: 'executeTool_api_missing',
          };
        }
        if (typeof mcp.isServiceAvailable === 'function') {
          const anyService = ['weather', 'exa', 'airbnb', 'google-calendar'].some((n) =>
            mcp.isServiceAvailable!(n),
          );
          if (!anyService) {
            return {
              healthy: false,
              latency: Date.now() - start,
              error: 'no_mcp_backend_available',
            };
          }
        }
        return { healthy: true, latency: Date.now() - start };
      },
    });
  }

  host.dependencyHealthCheck.registerDependencies(checks);
  host.logger.log(`[ClaudeOrchestratorService] 已注册 ${checks.length} 个依赖健康检查`);
}
