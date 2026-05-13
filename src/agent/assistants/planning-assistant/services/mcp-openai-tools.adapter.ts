import type { OpenAiFunctionToolDefinition } from '../../../../llm/interfaces/chat-completion-tools.interface';
import type { McpToolDefinition, ToolParameter } from './mcp-tool-registry.service';

/**
 * 暴露给 LLM 的 MCP 工具白名单（与 registry 中 `McpToolDefinition.toolName` 一致）。
 * Decision OS：仅将已审计的只读/低风险查询类工具交给模型，避免注册表里尚未复审的能力被幻觉触发。
 * 新增 MCP 能力或放开日历写操作等，须显式改此集合并复核。
 */
export const AGENTIC_MCP_LLM_EXPOSE_WHITELIST = new Set<string>([
  // weather
  'weather.getCurrentWeather',
  'weather.getWeatherByDatetimeRange',
  // exa（不含 crawlUrl：任意 URL 抓取未单独审计）
  'exa.webSearch',
  'exa.webSearchAdvanced',
  'exa.deepSearch',
  // accommodation / transport 查询
  'airbnb.search',
  'airbnb.listingDetails',
  'hotel.search',
  'hotel.getDetails',
  'rail.searchRoutes',
  'rail.getSchedule',
]);

/** LLM 函数名（OpenAI 仅允许 [a-zA-Z0-9_-]+）↔ MCP 路由 */
export interface McpToolRoutingEntry {
  llmFunctionName: string;
  serviceName: string;
  /** registry / dispatcher 使用的完整工具名，如 weather.getCurrentWeather */
  mcpToolName: string;
}

function parameterToJsonSchemaProperty(param: ToolParameter): Record<string, unknown> {
  const prop: Record<string, unknown> = {
    type: param.type === 'array' ? 'array' : param.type,
    description: param.description,
  };
  if (param.defaultValue !== undefined) {
    prop.default = param.defaultValue;
  }
  return prop;
}

function buildParametersSchema(parameters: ToolParameter[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of parameters) {
    properties[p.name] = parameterToJsonSchemaProperty(p);
    if (p.required) {
      required.push(p.name);
    }
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export interface FilterMcpDefinitionsOptions {
  /** 第二道闸：须在审计白名单之后应用；仅保留 toolName 属于此集的 MCP（Decision OS / RCS 硬装配）。 */
  runtimeAllowedMcpToolNames?: Set<string>;
}

export function filterMcpDefinitionsByLlmWhitelist(
  defs: McpToolDefinition[],
  options?: FilterMcpDefinitionsOptions,
): { allowed: McpToolDefinition[]; droppedToolNames: string[] } {
  const runtime = options?.runtimeAllowedMcpToolNames;
  const droppedToolNames: string[] = [];
  const allowed: McpToolDefinition[] = [];
  for (const def of defs) {
    if (!AGENTIC_MCP_LLM_EXPOSE_WHITELIST.has(def.toolName)) {
      droppedToolNames.push(def.toolName);
      continue;
    }
    if (runtime && !runtime.has(def.toolName)) {
      droppedToolNames.push(def.toolName);
      continue;
    }
    allowed.push(def);
  }
  return { allowed, droppedToolNames };
}

/**
 * 将 MCP 工具定义转为 OpenAI tools[]，并生成路由表。
 * 先应用审计白名单 {@link AGENTIC_MCP_LLM_EXPOSE_WHITELIST}，再可选按 {@link FilterMcpDefinitionsOptions.runtimeAllowedMcpToolNames} 第二道闸收窄。
 */
export function buildOpenAiToolsFromMcpDefinitions(
  defs: McpToolDefinition[],
  options?: FilterMcpDefinitionsOptions,
): {
  tools: OpenAiFunctionToolDefinition[];
  routing: Map<string, McpToolRoutingEntry>;
  droppedToolNames: string[];
} {
  const { allowed: filteredDefs, droppedToolNames } = filterMcpDefinitionsByLlmWhitelist(defs, options);
  const routing = new Map<string, McpToolRoutingEntry>();
  const tools: OpenAiFunctionToolDefinition[] = [];

  for (const def of filteredDefs) {
    const llmFunctionName = def.toolName.replace(/\./g, '_');
    routing.set(llmFunctionName, {
      llmFunctionName,
      serviceName: def.serviceName,
      mcpToolName: def.toolName,
    });
    tools.push({
      type: 'function',
      function: {
        name: llmFunctionName,
        description: def.description,
        parameters: buildParametersSchema(def.parameters),
      },
    });
  }

  return { tools, routing, droppedToolNames };
}
