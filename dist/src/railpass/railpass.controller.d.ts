import { RailPassService } from './railpass.service';
import { CheckEligibilityDto, RecommendPassDto, CheckReservationDto, PlanReservationsDto, SimulateTravelDaysDto, ValidateComplianceDto, UpdateReservationTaskDto } from './dto/railpass.dto';
import { PassProfileWizardDto } from './dto/pass-profile-wizard.dto';
import { CheckExecutabilityDto, RegeneratePlanDto } from './dto/executability-check.dto';
import { CoverageCheckRequestDto } from './dto/coverage-check.dto';
import { ReservationChannelsRequestDto } from './dto/reservation-channels.dto';
import { RulesEvaluateRequestDto } from './dto/rules-evaluate.dto';
export declare class RailPassController {
    private readonly railPassService;
    private readonly logger;
    constructor(railPassService: RailPassService);
    checkEligibility(dto: CheckEligibilityDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    recommendPass(dto: RecommendPassDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkReservation(dto: CheckReservationDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    planReservations(dto: PlanReservationsDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    simulateTravelDays(dto: SimulateTravelDaysDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    validateCompliance(dto: ValidateComplianceDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateReservationTask(taskId: string, dto: UpdateReservationTaskDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    generateCheckout(body: {
        taskIds: string[];
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkExecutability(dto: CheckExecutabilityDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    generateHighRiskAlerts(dto: CheckExecutabilityDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    completePassProfile(dto: PassProfileWizardDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    regeneratePlan(body: RegeneratePlanDto & {
        passProfile: any;
        segments: any[];
        reservationTasks: any[];
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkCoverage(body: CoverageCheckRequestDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getReservationChannels(body: ReservationChannelsRequestDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    evaluateRules(body: RulesEvaluateRequestDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
