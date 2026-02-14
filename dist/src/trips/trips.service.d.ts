import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto, MobilityTag } from './dto/create-trip.dto';
import { FlightPriceService } from './services/flight-price.service';
import { ScheduleConverterService } from './services/schedule-converter.service';
import { ActionHistoryService } from './services/action-history.service';
import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { PersonaAlertDto } from './dto/persona-alerts.dto';
import { DecisionLogResponseDto } from './dto/decision-log.dto';
import { TaskDto } from './dto/tasks.dto';
import { PipelineStatusResponseDto } from './dto/pipeline-status.dto';
import { DecisionLogStorageService } from './decision/services/decision-log-storage.service';
import { TripDraftService } from './services/trip-draft.service';
import { SaveTripDraftDto } from './dto/trip-draft.dto';
import { EvidenceListResponseDto, GetEvidenceQueryDto, UpdateEvidenceRequestDto, UpdateEvidenceResponseDto, BatchUpdateEvidenceRequestDto, BatchUpdateEvidenceResponseDto } from './dto/evidence.dto';
import { AttentionQueueResponseDto, GetAttentionQueueQueryDto } from './dto/attention-queue.dto';
import { EvidenceManagementService } from './services/evidence-management.service';
import { EvidenceFilteringService } from './services/evidence-filtering.service';
import { EvidenceCompletenessChecker, EvidenceCompletenessResult } from './services/evidence-completeness-checker.service';
import { EvidenceTriggerService, EvidenceTriggerResult } from './services/evidence-trigger.service';
import { BookingComIntegrationService } from '../mcp/booking-com-integration.service';
export declare class TripsService {
    private prisma;
    private flightPriceService;
    private scheduleConverter;
    private actionHistory;
    private decisionLogStorage;
    private tripDraftService;
    private evidenceManagement;
    private evidenceFiltering;
    private evidenceCompletenessChecker;
    private evidenceTrigger;
    private bookingComIntegration?;
    private readonly logger;
    private isValidUUID;
    checkCarRentalNeeds(dto?: CreateTripDto, countryCode?: string, tripId?: string): Promise<boolean>;
    estimateCarRentalCost(tripId: string): Promise<number>;
    constructor(prisma: PrismaService, flightPriceService: FlightPriceService, scheduleConverter: ScheduleConverterService, actionHistory: ActionHistoryService, decisionLogStorage: DecisionLogStorageService, tripDraftService: TripDraftService, evidenceManagement: EvidenceManagementService, evidenceFiltering: EvidenceFilteringService, evidenceCompletenessChecker: EvidenceCompletenessChecker, evidenceTrigger: EvidenceTriggerService, bookingComIntegration?: BookingComIntegrationService);
    create(dto: CreateTripDto, userId: string): Promise<{
        days: any[];
        processedConfig: {
            pacingConfig: import("./interfaces/pacing-config.interface").PacingConfig;
            budgetConfig: {
                totalBudget: number;
                currency: string;
                estimated_flight_visa: number;
                remaining_for_ground: number;
                daily_budget: number;
                hotel_tier_recommendation: string;
                travelers: {
                    type: "ADULT" | "ELDERLY" | "CHILD";
                    mobilityTag: MobilityTag;
                }[];
            };
            metadata: Record<string, any>;
        };
        status: string | null;
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        destination: string;
        startDate: Date;
        endDate: Date;
        budgetConfig: import("@prisma/client/runtime/library").JsonValue | null;
        pacingConfig: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    createFromDraft(dto: SaveTripDraftDto, userId: string): Promise<{
        itemsCount: number;
        days: any[];
        processedConfig: {
            pacingConfig: import("./interfaces/pacing-config.interface").PacingConfig;
            budgetConfig: {
                totalBudget: number;
                currency: string;
                estimated_flight_visa: number;
                remaining_for_ground: number;
                daily_budget: number;
                hotel_tier_recommendation: string;
                travelers: {
                    type: "ADULT" | "ELDERLY" | "CHILD";
                    mobilityTag: MobilityTag;
                }[];
            };
            metadata: Record<string, any>;
        };
        status: string | null;
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        destination: string;
        startDate: Date;
        endDate: Date;
        budgetConfig: import("@prisma/client/runtime/library").JsonValue | null;
        pacingConfig: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    findAll(userId?: string): Promise<any[]>;
    findOne(id: string, userId?: string): Promise<any>;
    private validateStatusTransition;
    update(id: string, dto: Partial<CreateTripDto>): Promise<any>;
    private enrichTripData;
    private calculateCrossDayInfo;
    private getTimeLabelsForType;
    getTripState(tripId: string, nowISO?: string): Promise<{
        currentDayId: string;
        currentItemId: string;
        nextStop: any;
        timezone: string;
        now: string;
    }>;
    private buildNextStopInfo;
    getSchedule(tripId: string, dateISO: string): Promise<{
        date: string;
        schedule: DayScheduleResult;
        persisted: boolean;
    }>;
    saveSchedule(tripId: string, dateISO: string, schedule: DayScheduleResult): Promise<{
        date: string;
        schedule: DayScheduleResult;
        persisted: boolean;
    }>;
    getActionHistory(tripId: string, dateISO?: string): Promise<import("./services/action-history.service").ActionHistory[]>;
    undoAction(tripId: string, dateISO: string): Promise<DayScheduleResult>;
    redoAction(tripId: string, dateISO: string): Promise<DayScheduleResult>;
    remove(id: string, confirmText: string): Promise<{
        message: string;
    }>;
    getPersonaAlerts(tripId: string): Promise<PersonaAlertDto[]>;
    getEvidence(tripId: string, query: GetEvidenceQueryDto): Promise<EvidenceListResponseDto>;
    checkEvidenceCompleteness(tripId: string): Promise<EvidenceCompletenessResult>;
    getEvidenceFetchSuggestions(tripId: string): Promise<EvidenceTriggerResult>;
    shouldAutoTriggerEvidenceFetch(tripId: string, threshold?: number): Promise<boolean>;
    private validateEvidenceAccess;
    private validateEvidenceStatusTransition;
    private getEvidenceStatus;
    private updateEvidenceStatus;
    updateEvidence(tripId: string, evidenceId: string, dto: UpdateEvidenceRequestDto, userId?: string): Promise<UpdateEvidenceResponseDto>;
    batchUpdateEvidence(tripId: string, dto: BatchUpdateEvidenceRequestDto, userId?: string): Promise<BatchUpdateEvidenceResponseDto>;
    getAttentionQueue(query: GetAttentionQueueQueryDto): Promise<AttentionQueueResponseDto>;
    getDecisionLog(tripId: string, limit?: number, offset?: number): Promise<DecisionLogResponseDto>;
    private isNoRiskEntry;
    getTasks(tripId: string): Promise<TaskDto[]>;
    updateTaskStatus(tripId: string, taskId: string, completed: boolean): Promise<TaskDto>;
    getPipelineStatus(tripId: string): Promise<PipelineStatusResponseDto>;
    findAllAdmin(query: any): Promise<{
        items: {
            id: any;
            destination: any;
            startDate: any;
            endDate: any;
            status: any;
            durationDays: number;
            budgetConfig: any;
            pacingConfig: any;
            createdAt: any;
            updatedAt: any;
            owner: {
                userId: any;
                role: any;
            };
            stats: {
                daysCount: any;
                itemsCount: any;
                collaboratorsCount: any;
                likesCount: any;
                collectionsCount: any;
                sharesCount: any;
            };
        }[];
        pagination: {
            page: any;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getAdminStats(query: any): Promise<{
        summary: {
            totalTrips: number;
            activeTrips: number;
            completedTrips: number;
            cancelledTrips: number;
            planningTrips: number;
        };
        byStatus: {
            PLANNING: {
                count: number;
                percentage: number;
            };
            IN_PROGRESS: {
                count: number;
                percentage: number;
            };
            COMPLETED: {
                count: number;
                percentage: number;
            };
            CANCELLED: {
                count: number;
                percentage: number;
            };
        };
        byDestination: Record<string, {
            count: number;
            percentage: number;
        }>;
        byTimeRange: {
            last7Days: {
                count: number;
                newTrips: number;
            };
            last30Days: {
                count: number;
                newTrips: number;
            };
            last90Days: {
                count: number;
                newTrips: number;
            };
            lastYear: {
                count: number;
                newTrips: number;
            };
        };
        engagement: {
            avgDaysPerTrip: number;
            avgItemsPerTrip: number;
            avgCollaboratorsPerTrip: number;
            totalLikes: number;
            totalCollections: number;
            totalShares: number;
        };
        budget: {
            avgBudget: number;
            medianBudget: number;
            totalBudget: number;
            budgetDistribution: Record<string, number>;
        };
        trends: {
            newTripsByMonth: any[];
            completionRateByMonth: any[];
        };
    }>;
    findOneAdmin(id: string): Promise<{
        id: string;
        destination: string;
        startDate: Date;
        endDate: Date;
        status: string;
        durationDays: number;
        budgetConfig: import("@prisma/client/runtime/library").JsonValue;
        pacingConfig: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        owner: {
            userId: any;
            email: any;
            displayName: any;
            avatarUrl: any;
            role?: undefined;
        } | {
            userId: string;
            role: string;
            email?: undefined;
            displayName?: undefined;
            avatarUrl?: undefined;
        };
        collaborators: {
            userId: any;
            email: string;
            displayName: string;
            role: any;
            createdAt: any;
        }[];
        days: {
            id: any;
            date: any;
            itemsCount: any;
            items: any;
        }[];
        stats: {
            daysCount: number;
            itemsCount: number;
            collaboratorsCount: number;
            likesCount: number;
            collectionsCount: number;
            sharesCount: number;
        };
        social: {
            likes: {
                userId: any;
                email: string;
                displayName: string;
                createdAt: any;
            }[];
            collections: {
                userId: any;
                email: string;
                displayName: string;
                createdAt: any;
            }[];
            shares: {
                id: any;
                shareToken: any;
                permission: any;
                expiresAt: any;
                createdAt: any;
            }[];
        };
        decisionLogs: {
            total: number;
            recent: any[];
        };
    }>;
    batchOperation(body: any): Promise<{
        action: any;
        total: any;
        success: number;
        failed: number;
        errors: {
            tripId: string;
            error: string;
        }[];
    }>;
    exportTrip(id: string, format?: string): Promise<{
        id: string;
        destination: string;
        startDate: Date;
        endDate: Date;
        status: string;
        durationDays: number;
        budgetConfig: import("@prisma/client/runtime/library").JsonValue;
        pacingConfig: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        owner: {
            userId: any;
            email: any;
            displayName: any;
            avatarUrl: any;
            role?: undefined;
        } | {
            userId: string;
            role: string;
            email?: undefined;
            displayName?: undefined;
            avatarUrl?: undefined;
        };
        collaborators: {
            userId: any;
            email: string;
            displayName: string;
            role: any;
            createdAt: any;
        }[];
        days: {
            id: any;
            date: any;
            itemsCount: any;
            items: any;
        }[];
        stats: {
            daysCount: number;
            itemsCount: number;
            collaboratorsCount: number;
            likesCount: number;
            collectionsCount: number;
            sharesCount: number;
        };
        social: {
            likes: {
                userId: any;
                email: string;
                displayName: string;
                createdAt: any;
            }[];
            collections: {
                userId: any;
                email: string;
                displayName: string;
                createdAt: any;
            }[];
            shares: {
                id: any;
                shareToken: any;
                permission: any;
                expiresAt: any;
                createdAt: any;
            }[];
        };
        decisionLogs: {
            total: number;
            recent: any[];
        };
    }>;
    private generateDefaultTripName;
    private getDestinationName;
}
