import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateRouteDirectionDto } from './dto/create-route-direction.dto';
import { UpdateRouteDirectionDto } from './dto/update-route-direction.dto';
import { CreateRouteTemplateDto } from './dto/create-route-template.dto';
import { UpdateRouteTemplateDto } from './dto/update-route-template.dto';
import { QueryRouteDirectionDto } from './dto/query-route-direction.dto';
import { ImportCountryPackDto, ImportCountryPackResultDto } from './dto/import-country-pack.dto';
import { CreateTripFromRouteTemplateDto } from './dto/create-trip-from-template.dto';
export declare class RouteDirectionsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    createRouteDirection(dto: CreateRouteDirectionDto): Promise<any>;
    createRouteTemplate(dto: CreateRouteTemplateDto): Promise<any>;
    findRouteDirections(query: QueryRouteDirectionDto): Promise<Prisma.RouteDirectionGetPayload<{
        include: {
            templates: true;
        };
    }>[]>;
    findRouteDirectionById(id: number): Promise<any>;
    findRouteDirectionByUuid(uuid: string): Promise<any>;
    findRouteDirectionsByCountry(countryCode: string, options?: {
        tags?: string[];
        month?: number;
        limit?: number;
        userId?: string;
        persona?: string[];
        locale?: string;
        includeDeprecated?: boolean;
    }): Promise<{
        active: Prisma.RouteDirectionGetPayload<{
            include: {
                templates: true;
            };
        }>[];
        deprecated?: Prisma.RouteDirectionGetPayload<{
            include: {
                templates: true;
            };
        }>[];
    }>;
    updateRouteDirection(id: number, data: UpdateRouteDirectionDto): Promise<any>;
    deleteRouteDirection(id: number): Promise<void>;
    private normalizeDayPlans;
    findRouteTemplateById(id: number): Promise<any>;
    getTemplateMigrationStatus(templateId: number): Promise<{
        templateId: number;
        templateName: string;
        usesOldFormat: boolean;
        dayPlans: Array<{
            day: number;
            theme?: string;
            hasRequiredNodes: boolean;
            requiredNodesCount: number;
            hasPois: boolean;
            poisCount: number;
            needsMigration: boolean;
            missingPoiIds?: number[];
        }>;
        needsMigration: boolean;
    }>;
    getAvailablePoisByTemplate(templateId: number, options?: {
        category?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        places: {
            id: number;
            uuid: string;
            nameCN: string;
            nameEN: string;
            category: import(".prisma/client").$Enums.PlaceCategory;
            rating: number;
            location: {
                lat: number;
                lng: number;
            };
            city: {
                id: number;
                name: string;
                countryCode: string;
            };
        }[];
        total: number;
        page: number;
        limit: number;
        routeDirection: {
            id: any;
            countryCode: any;
            nameCN: any;
        };
    }>;
    findRouteTemplateByDirectionAndDuration(routeDirectionId: number, durationDays: number): Promise<any>;
    findRouteTemplates(options?: {
        routeDirectionId?: number;
        durationDays?: number;
        isActive?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<any[]>;
    updateRouteTemplate(id: number, dto: UpdateRouteTemplateDto): Promise<any>;
    deleteRouteTemplate(id: number): Promise<void>;
    hardDeleteRouteTemplate(id: number): Promise<void>;
    addPoiToTemplate(templateId: number, dto: {
        day: number;
        poiId: number;
        required?: boolean;
        priority?: 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
        order?: number;
        durationMinutes?: number;
        priorityReason?: string;
    }): Promise<any>;
    removePoiFromTemplate(templateId: number, dto: {
        day: number;
        poiId?: number;
        poiUuid?: string;
        index?: number;
    }): Promise<any>;
    updatePoiInTemplate(templateId: number, dto: {
        day: number;
        poiId: number;
        required?: boolean;
        priority?: 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
        startTime?: string;
        endTime?: string;
        durationMinutes?: number;
        priorityReason?: string;
    }): Promise<any>;
    bulkUpdatePoiPriority(templateId: number, updates: Array<{
        day: number;
        poiId: number;
        priority: 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
        priorityReason?: string;
    }>): Promise<any>;
    private applyGrayReleaseFilter;
    private hashString;
    importCountryPack(dto: ImportCountryPackDto): Promise<ImportCountryPackResultDto>;
    createTripFromTemplate(templateId: number, dto: CreateTripFromRouteTemplateDto, userId?: string | null): Promise<any>;
    private retrievePlaceCandidates;
    private extractCategoriesFromDayPlans;
    private orchestrateWithLLM;
    private mockLLMOrchestration;
    private buildOrchestrationPrompt;
    private calculateSlotTime;
    private mapSlotToItemType;
    private calculateTravelTimeBetweenPlaces;
    private calculateHaversineDistance;
    private toRadians;
    private getActivityDuration;
    private generateDefaultTripName;
    private getDestinationName;
}
