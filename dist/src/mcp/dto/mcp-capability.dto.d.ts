export declare enum McpCapabilityStatus {
    ENABLED = "enabled",
    DISABLED = "disabled"
}
export declare class McpCapabilityDto {
    serviceName: string;
    displayName: string;
    description: string;
    enabled: boolean;
    tools: string[];
    category?: string;
    authRequired?: boolean;
}
export declare class UpdateCapabilityStatusDto {
    serviceName: string;
    status: McpCapabilityStatus;
}
export declare class BatchUpdateCapabilityStatusDto {
    updates: UpdateCapabilityStatusDto[];
}
export declare class QueryCapabilitiesDto {
    serviceName?: string;
    status?: McpCapabilityStatus;
    category?: string;
}
