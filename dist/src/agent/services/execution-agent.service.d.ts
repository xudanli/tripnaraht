import { ExecRemindSkill } from '../../skills/exec/exec-remind.skill';
import { ExecHandleChangeSkill } from '../../skills/exec/exec-handle-change.skill';
import { ExecFallbackSkill } from '../../skills/exec/exec-fallback.skill';
import { ExecutionState, Reminder, ChangeHandlingResult, FallbackPlan } from '../../skills/exec/shared/execution-state.types';
import { PersonaShellService, PersonaShellOutput } from './persona-shell.service';
import { TripsService } from '../../trips/trips.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReorderRequestDto } from '../dto/reorder.dto';
import { ApplyFallbackRequestDto } from '../dto/apply-fallback.dto';
export interface ExecutionAgentRequest {
    tripId: string;
    action: 'remind' | 'handle_change' | 'fallback' | 'get_status';
    remindParams?: {
        reminderTypes?: string[];
        advanceHours?: number;
    };
    changeParams?: {
        changeType: string;
        changeDetails: any;
    };
    fallbackParams?: {
        triggerReason: string;
        originalPlan: any;
    };
}
export interface ExecutionAgentResponse {
    executionState: ExecutionState;
    personas?: PersonaShellOutput;
    uiOutput: {
        reminders?: Reminder[];
        changeResult?: ChangeHandlingResult;
        fallbackPlan?: FallbackPlan;
        status?: {
            currentDay: number;
            currentDate: string;
            phase: 'ON_TRIP' | 'CHANGE_HANDLING' | 'FALLBACK';
            activeIssues: number;
        };
    };
}
export declare class ExecutionAgentService {
    private readonly execRemind?;
    private readonly execHandleChange?;
    private readonly execFallback?;
    private readonly personaShell?;
    private readonly tripsService?;
    private readonly itineraryItemsService?;
    private readonly prisma?;
    private readonly logger;
    private readonly fallbackPlanCache;
    constructor(execRemind?: ExecRemindSkill, execHandleChange?: ExecHandleChangeSkill, execFallback?: ExecFallbackSkill, personaShell?: PersonaShellService, tripsService?: TripsService, itineraryItemsService?: ItineraryItemsService, prisma?: PrismaService);
    execute(request: ExecutionAgentRequest): Promise<ExecutionAgentResponse>;
    reorder(request: ReorderRequestDto): Promise<{
        success: boolean;
        message: string;
        updatedSchedule: any;
        impact: {
            timeAdjustments: {
                itemId: string;
                originalTime: string;
                newTime: string;
            }[];
            conflicts: {
                type: string;
                message: string;
            }[];
        };
    }>;
    applyFallback(request: ApplyFallbackRequestDto): Promise<{
        success: boolean;
        message: string;
        appliedChanges: {
            itemId: string;
            action: string;
            details: any;
        }[];
        updatedSchedule: any;
        impact: {
            arrivalTime: string;
            missingPlaces: number;
            riskChange: "low" | "medium" | "high";
        };
    }>;
    previewFallback(solutionId: string): Promise<{
        solutionId: string;
        type: "safety" | "experience" | "minimal";
        title: string;
        description: string;
        changes: {
            itemId: string;
            action: "remove" | "add" | "modify";
            original: {
                placeName: string;
                startTime: string;
                endTime: string;
            };
            modified: {
                placeName: any;
                startTime: string;
                endTime: string;
            };
            reason: string;
        }[];
        impact: {
            arrivalTime: string;
            missingPlaces: number;
            riskChange: "low" | "medium" | "high";
        };
        timeline: {
            date: string;
            schedule: {
                items: any[];
            };
        };
    }>;
    private minutesToTimeString;
    private addHours;
}
