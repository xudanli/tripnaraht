import { buildOpenAiToolsFromMcpDefinitions } from './mcp-openai-tools.adapter';
import type { McpToolDefinition } from './mcp-tool-registry.service';

describe('buildOpenAiToolsFromMcpDefinitions', () => {
  it('maps MCP defs to OpenAI function names and routing', () => {
    const defs: McpToolDefinition[] = [
      {
        serviceName: 'weather',
        toolName: 'weather.getCurrentWeather',
        displayName: '当前天气',
        description: '获取当前天气',
        category: 'weather',
        parameters: [
          {
            name: 'location',
            type: 'string',
            required: true,
            description: '城市',
          },
        ],
        returnType: 'WeatherData',
        examples: [],
      },
    ];

    const { tools, routing, droppedToolNames } = buildOpenAiToolsFromMcpDefinitions(defs);

    expect(tools).toHaveLength(1);
    expect(droppedToolNames).toEqual([]);
    expect(tools[0].function.name).toBe('weather_getCurrentWeather');
    expect(routing.get('weather_getCurrentWeather')).toEqual({
      llmFunctionName: 'weather_getCurrentWeather',
      serviceName: 'weather',
      mcpToolName: 'weather.getCurrentWeather',
    });
  });

  it('drops tools not in AGENTIC_MCP_LLM_EXPOSE_WHITELIST', () => {
    const defs: McpToolDefinition[] = [
      {
        serviceName: 'weather',
        toolName: 'weather.getCurrentWeather',
        displayName: '当前天气',
        description: '获取当前天气',
        category: 'weather',
        parameters: [{ name: 'location', type: 'string', required: true, description: '城市' }],
        returnType: 'WeatherData',
        examples: [],
      },
      {
        serviceName: 'google-calendar',
        toolName: 'google-calendar.createEvent',
        displayName: '创建事件',
        description: '写日历',
        category: 'calendar',
        parameters: [
          { name: 'summary', type: 'string', required: true, description: '标题' },
          { name: 'start', type: 'string', required: true, description: '开始' },
          { name: 'end', type: 'string', required: true, description: '结束' },
        ],
        returnType: 'CalendarEvent',
        examples: [],
      },
    ];

    const { tools, droppedToolNames } = buildOpenAiToolsFromMcpDefinitions(defs);

    expect(tools).toHaveLength(1);
    expect(tools[0].function.name).toBe('weather_getCurrentWeather');
    expect(droppedToolNames).toEqual(['google-calendar.createEvent']);
  });
});
