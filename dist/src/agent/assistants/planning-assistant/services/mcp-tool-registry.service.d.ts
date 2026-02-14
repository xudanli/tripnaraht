import { OnModuleInit } from '@nestjs/common';
export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    description: string;
    defaultValue?: any;
}
export interface McpToolDefinition {
    serviceName: string;
    toolName: string;
    displayName: string;
    description: string;
    category: string;
    parameters: ToolParameter[];
    returnType: string;
    examples: string[];
    authRequired?: boolean;
}
export declare class McpToolRegistryService implements OnModuleInit {
    private readonly logger;
    private tools;
    onModuleInit(): Promise<void>;
    registerTool(serviceName: string, tool: McpToolDefinition): void;
    registerTools(serviceName: string, tools: McpToolDefinition[]): void;
    getServiceTools(serviceName: string): McpToolDefinition[];
    findToolsByCategory(category: string): McpToolDefinition[];
    findToolByFullName(fullName: string): McpToolDefinition | undefined;
    getAllTools(): McpToolDefinition[];
    getTotalToolCount(): number;
    private registerDefaultTools;
}
