export interface RouteDirectionHealth {
    routeDirectionId: number;
    countryCode: string;
    totalRuns: number;
    successRuns: number;
    failureRuns: number;
    commonFailureReasons: string[];
    commonRepairs: string[];
    lastUpdated: Date;
}
export declare function calculateRouteDirectionHealthScore(health: RouteDirectionHealth): number;
