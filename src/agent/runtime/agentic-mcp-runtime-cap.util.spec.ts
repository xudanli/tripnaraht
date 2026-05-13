import {
  applyEmergencyConstraintsToMcpAllowlist,
  deriveAgenticMcpRuntimeAllowlist,
  expandSkillAllowlistToMcpToolNames,
  extractAgenticSkillAllowlistForMcpCap,
  PHASE_AGENTIC_MCP_CAP,
} from './agentic-mcp-runtime-cap.util';
import { AGENTIC_MCP_LLM_EXPOSE_WHITELIST } from '../assistants/planning-assistant/services/mcp-openai-tools.adapter';

describe('deriveAgenticMcpRuntimeAllowlist', () => {
  it('planning phase includes full audited whitelist', () => {
    const { allowedMcpToolNames, provenance } = deriveAgenticMcpRuntimeAllowlist({
      phase: 'planning',
    });
    expect(provenance).toContain('phase:planning');
    expect(allowedMcpToolNames.size).toBe(AGENTIC_MCP_LLM_EXPOSE_WHITELIST.size);
  });

  it('countryPack phase is a strict subset of whitelist', () => {
    const { allowedMcpToolNames } = deriveAgenticMcpRuntimeAllowlist({ phase: 'countryPack' });
    for (const t of allowedMcpToolNames) {
      expect(AGENTIC_MCP_LLM_EXPOSE_WHITELIST.has(t)).toBe(true);
    }
    expect(allowedMcpToolNames.has('weather.getCurrentWeather')).toBe(false);
    expect(allowedMcpToolNames.has('exa.webSearch')).toBe(true);
  });

  it('narrows further when skill allowlist names are exact MCP ids', () => {
    const { allowedMcpToolNames, provenance } = deriveAgenticMcpRuntimeAllowlist({
      phase: 'planning',
      skillAllowlist: [{ name: 'weather.getCurrentWeather' }],
    });
    expect(provenance).toContain('toolAllowlist_intersect');
    expect([...allowedMcpToolNames].sort()).toEqual(['weather.getCurrentWeather']);
  });

  it('maps skill names (e.g. weather.search) onto MCP tools then intersects with phase', () => {
    const { allowedMcpToolNames, provenance } = deriveAgenticMcpRuntimeAllowlist({
      phase: 'decision',
      skillAllowlist: [{ name: 'weather.search' }],
    });
    expect(provenance).toContain('toolAllowlist_intersect');
    expect(allowedMcpToolNames.has('hotel.search')).toBe(false);
    expect(allowedMcpToolNames.has('weather.getCurrentWeather')).toBe(true);
    expect(allowedMcpToolNames.has('weather.getWeatherByDatetimeRange')).toBe(true);
  });

  it('skips narrowing when expanded tools do not intersect phase cap', () => {
    const { allowedMcpToolNames, provenance } = deriveAgenticMcpRuntimeAllowlist({
      phase: 'countrypack',
      skillAllowlist: [{ name: 'weather.getCurrentWeather' }],
    });
    expect(provenance).toContain('skipped_empty');
    expect(allowedMcpToolNames.has('exa.webSearch')).toBe(true);
    expect(allowedMcpToolNames.has('weather.getCurrentWeather')).toBe(false);
  });

  it('removes rail MCP when forbidden_modes includes RAIL', () => {
    const { allowedMcpToolNames } = deriveAgenticMcpRuntimeAllowlist({
      phase: 'decision',
      emergency: { forbidden_modes: ['RAIL'] },
    });
    expect(allowedMcpToolNames.has('rail.searchRoutes')).toBe(false);
    expect(allowedMcpToolNames.has('weather.getCurrentWeather')).toBe(true);
  });
});

describe('PHASE_AGENTIC_MCP_CAP', () => {
  it('every listed tool is in the audited LLM whitelist', () => {
    for (const [phase, tools] of Object.entries(PHASE_AGENTIC_MCP_CAP)) {
      for (const t of tools) {
        expect(AGENTIC_MCP_LLM_EXPOSE_WHITELIST.has(t)).toBe(true);
      }
    }
  });
});

describe('applyEmergencyConstraintsToMcpAllowlist', () => {
  it('mutates set in place for RAIL', () => {
    const s = new Set(['rail.searchRoutes', 'weather.getCurrentWeather']);
    applyEmergencyConstraintsToMcpAllowlist(s, { forbidden_modes: ['RAIL'] });
    expect([...s].sort()).toEqual(['weather.getCurrentWeather']);
  });
});

describe('expandSkillAllowlistToMcpToolNames', () => {
  it('strips mcp. prefix when matching whitelist', () => {
    const s = expandSkillAllowlistToMcpToolNames([{ name: 'mcp.exa.webSearch' }]);
    expect(s.has('exa.webSearch')).toBe(true);
  });

  it('expands service alias keys to all whitelisted tools under that MCP service', () => {
    const s = expandSkillAllowlistToMcpToolNames([{ name: 'weather_service' }]);
    expect(s.has('weather.getCurrentWeather')).toBe(true);
    expect(s.has('weather.getWeatherByDatetimeRange')).toBe(true);
  });
});

describe('extractAgenticSkillAllowlistForMcpCap', () => {
  it('prefers options.agentic_runtime_tool_allowlist over memory.constraints', () => {
    const mem = {
      activeTripState: {
        constraints: { toolAllowlist: [{ name: 'context.build' }] },
      },
    };
    const r = extractAgenticSkillAllowlistForMcpCap(
      { options: { agentic_runtime_tool_allowlist: ['weather.search'] } },
      mem,
    );
    expect(r?.map((x) => x.name)).toEqual(['weather.search']);
  });

  it('reads toolAllowlist from trip task constraints', () => {
    const r = extractAgenticSkillAllowlistForMcpCap(
      { options: {} },
      {
        activeTripState: {
          constraints: { toolAllowlist: ['readiness.assess', { name: 'weather.search' }] },
        },
      },
    );
    expect(r?.map((x) => x.name)).toEqual(['readiness.assess', 'weather.search']);
  });
});
