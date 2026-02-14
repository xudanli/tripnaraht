import { ModuleRef } from '@nestjs/core';
import { ReadinessService } from './services/readiness.service';
import { CapabilityPackEvaluatorService } from './services/capability-pack-evaluator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { ChecklistStatusService } from './services/checklist-status.service';
import { FindingMarksService } from './services/finding-marks.service';
import { PackingListService } from './services/packing-list.service';
import { PackingTemplateService } from './services/packing-template.service';
import { SolutionService } from './services/solution.service';
import { ReadinessAIService } from './services/readiness-ai.service';
import { ReadinessFeatureFlagsService } from './services/readiness-feature-flags.service';
import { CapabilityPackChecklistService, AddFromCapabilityPackRequest } from './services/capability-pack-checklist.service';
import { RiskTypeMapperService } from './services/risk-type-mapper.service';
import { CoverageMapService } from './services/coverage-map.service';
import { UpdateChecklistStatusDto } from './dto/checklist-status.dto';
import { MarkNotApplicableDto, AddToLaterDto } from './dto/finding-mark.dto';
import { GeneratePackingListDto, UpdatePackingListItemDto } from './dto/packing-list.dto';
import { PackStorageService } from './storage/pack-storage.service';
import { GetReadinessPacksQueryDto, CreateReadinessPackDto, UpdateReadinessPackDto } from './dto/admin-pack.dto';
import { UserDecisionService } from './services/user-decision.service';
import { ReadinessToConstraintsCompiler } from './compilers/readiness-to-constraints.compiler';
declare class TravelerDto {
    nationality?: string;
    residencyCountry?: string;
    tags?: string[];
    budgetLevel?: 'low' | 'medium' | 'high';
    riskTolerance?: 'low' | 'medium' | 'high';
}
declare class TripDto {
    startDate?: string;
    endDate?: string;
}
declare class ItineraryDto {
    countries?: string[];
    activities?: string[];
    season?: string;
    region?: string;
    hasSeaCrossing?: boolean;
    hasAuroraActivity?: boolean;
    vehicleType?: string;
    routeLength?: number;
}
declare class MountainsDto {
    inMountain?: boolean;
    mountainElevationAvg?: number;
    terrainComplexity?: number;
    hasMountainPass?: boolean;
}
declare class RoadsDto {
    nearRoad?: boolean;
    roadDensityScore?: number;
    hasMountainPass?: boolean;
}
declare class SafetyDto {
    hasHospital?: boolean;
    hasPolice?: boolean;
}
declare class SupplyDto {
    hasFuel?: boolean;
    hasSupermarket?: boolean;
}
declare class PoisDto {
    supplyDensity?: number;
    hasCheckpoint?: boolean;
    safety?: SafetyDto;
    supply?: SupplyDto;
}
declare class GeoDto {
    lat?: number;
    lng?: number;
    enhanceWithGeo?: boolean;
    mountains?: MountainsDto;
    roads?: RoadsDto;
    pois?: PoisDto;
}
export declare class CheckReadinessDto {
    destinationId: string;
    traveler?: TravelerDto;
    trip?: TripDto;
    itinerary?: ItineraryDto;
    geo?: GeoDto;
}
export declare class ReadinessController {
    private readonly readinessService;
    private readonly capabilityPackEvaluator;
    private readonly prisma;
    private readonly usersService;
    private readonly checklistStatusService;
    private readonly findingMarksService;
    private readonly packingListService;
    private readonly packingTemplateService;
    private readonly solutionService;
    private readonly packStorageService;
    private readonly readinessAIService;
    private readonly featureFlagsService;
    private readonly capabilityPackChecklistService;
    private readonly userDecisionService;
    private readonly constraintsCompiler;
    private readonly coverageMapService;
    private readonly riskTypeMapperService;
    private readonly moduleRef;
    private readonly logger;
    private tripConflictsService?;
    constructor(readinessService: ReadinessService, capabilityPackEvaluator: CapabilityPackEvaluatorService, prisma: PrismaService, usersService: UsersService, checklistStatusService: ChecklistStatusService, findingMarksService: FindingMarksService, packingListService: PackingListService, packingTemplateService: PackingTemplateService, solutionService: SolutionService, packStorageService: PackStorageService, readinessAIService: ReadinessAIService, featureFlagsService: ReadinessFeatureFlagsService, capabilityPackChecklistService: CapabilityPackChecklistService, userDecisionService: UserDecisionService, constraintsCompiler: ReadinessToConstraintsCompiler, coverageMapService: CoverageMapService, riskTypeMapperService: RiskTypeMapperService, moduleRef: ModuleRef);
    private getTripConflictsService;
    checkReadiness(dto: CheckReadinessDto): Promise<any>;
    getTripReadiness(tripId: string, lang?: 'en' | 'zh', user?: CurrentUserPayload): Promise<any>;
    getCapabilityPacks(): Promise<any>;
    evaluateCapabilityPacks(dto: CheckReadinessDto, autoEnhanceGeo?: string): Promise<any>;
    private generateTriggerReason;
    addFromCapabilityPack(tripId: string, dto: AddFromCapabilityPackRequest): Promise<any>;
    getCapabilityPackItems(tripId: string, packType?: string): Promise<any>;
    updateCapabilityPackItemStatus(tripId: string, itemId: string, dto: {
        checked: boolean;
    }): Promise<any>;
    removeCapabilityPackItem(tripId: string, itemId: string): Promise<any>;
    getPersonalizedChecklist(tripId: string, lang?: 'en' | 'zh', userId?: string, currentUser?: CurrentUserPayload): Promise<any>;
    private extractUserProfile;
    private buildChecklistWithEnhancements;
    getRiskWarnings(tripId: string, lang?: 'en' | 'zh', userId?: string, includeCapabilityPackHazards?: string, currentUser?: CurrentUserPayload): Promise<any>;
    getCoverageMap(tripId: string): Promise<any>;
    getReadinessScore(tripId: string): Promise<any>;
    getRepairOptions(body: {
        tripId: string;
        blockerId: string;
    }): Promise<any>;
    updateChecklistStatus(tripId: string, dto: UpdateChecklistStatusDto): Promise<any>;
    getChecklistStatus(tripId: string): Promise<any>;
    getSolutions(tripId: string, blockerId: string): Promise<any>;
    markNotApplicable(tripId: string, findingId: string, dto: MarkNotApplicableDto): Promise<any>;
    unmarkNotApplicable(tripId: string, findingId: string): Promise<any>;
    getNotApplicableItems(tripId: string): Promise<any>;
    addToLater(tripId: string, findingId: string, dto: AddToLaterDto): Promise<any>;
    removeFromLater(tripId: string, findingId: string): Promise<any>;
    getLaterItems(tripId: string): Promise<any>;
    generatePackingList(tripId: string, dto: GeneratePackingListDto, userId?: string, currentUser?: CurrentUserPayload): Promise<any>;
    getPackingList(tripId: string): Promise<any>;
    updatePackingListItem(tripId: string, itemId: string, dto: UpdatePackingListItemDto): Promise<any>;
    getPackingOrderSteps(): Promise<any>;
    getPreDepartureChecklist(): Promise<any>;
    private extractPlaceCoordinates;
    private inferHasRemoteAreas;
    private inferRequires4x4;
    getReadinessPacks(query: GetReadinessPacksQueryDto): Promise<any>;
    getReadinessPackById(packId: string, includePacking?: string): Promise<any>;
    createReadinessPack(dto: CreateReadinessPackDto): Promise<any>;
    updateReadinessPack(packId: string, dto: UpdateReadinessPackDto): Promise<any>;
    deleteReadinessPack(packId: string): Promise<any>;
    getUserDecisionQuestions(tripId: string, ruleId: string, answeredQuestionIds?: string): Promise<any>;
    answerUserDecision(tripId: string, ruleId: string, body: {
        answers: Record<string, any>;
    }): Promise<any>;
}
export {};
