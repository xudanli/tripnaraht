import { CreateRouteDirectionDto } from './create-route-direction.dto';
export declare class ImportCountryPackDto {
    countryCode: string;
    countryName: string;
    countryNameCN?: string;
    routeDirections: CreateRouteDirectionDto[];
    regions?: string[];
    policy?: {
        defaultPace?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
        defaultRiskTolerance?: 'low' | 'medium' | 'high';
    };
}
export declare class ImportCountryPackResultDto {
    countryCode: string;
    successCount: number;
    failedCount: number;
    results: Array<{
        name: string;
        success: boolean;
        id?: number;
        error?: string;
    }>;
}
