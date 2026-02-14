import { RailSegment, ReservationTask, ReservationTaskStatus, ReservationPlanResult, FallbackOption } from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from './reservation-decision-engine.service';
interface PlanReservationsInput {
    segments: RailSegment[];
    userPreferences?: {
        maxReservationFee?: number;
        preferNoReservation?: boolean;
    };
}
export declare class ReservationOrchestrationService {
    private readonly reservationEngine;
    private readonly logger;
    constructor(reservationEngine: ReservationDecisionEngineService);
    planReservations(input: PlanReservationsInput): ReservationPlanResult;
    updateTaskStatus(taskId: string, status: ReservationTaskStatus, updates?: {
        bookingRef?: string;
        cost?: number;
        failReason?: string;
        fallbackPlanId?: string;
    }): ReservationTask;
    getTasksByStatus(tasks: ReservationTask[], status?: ReservationTaskStatus): ReservationTask[];
    getPendingTasks(tasks: ReservationTask[]): ReservationTask[];
    applyFallback(taskId: string, fallbackOption: FallbackOption): {
        success: boolean;
        newTask?: ReservationTask;
        message: string;
    };
}
export {};
