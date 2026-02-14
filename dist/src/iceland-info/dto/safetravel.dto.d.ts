export declare enum AlertSeverity {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum AlertType {
    WEATHER = "weather",
    ROAD = "road",
    TRAVEL = "travel",
    GENERAL = "general"
}
export declare class SafetravelAlertDto {
    id: string;
    title: string;
    description: string;
    type: AlertType;
    severity: AlertSeverity;
    effectiveTime: string;
    expiryTime?: string;
    regions: string[];
    fRoads?: string[];
}
export declare class SafetravelTravelConditionsDto {
    region: string;
    roadStatus: string;
    weatherStatus: string;
    overallStatus: string;
    description: string;
    lastUpdated: string;
}
export declare class SafetravelResponseDto {
    alerts: SafetravelAlertDto[];
    travelConditions: SafetravelTravelConditionsDto[];
    lastUpdated: string;
}
export declare class SafetravelQueryDto {
    region?: string;
    alertType?: AlertType;
}
