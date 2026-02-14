import { GatekeeperAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState, GateResult } from '../../interfaces/trip-plan.interface';
import { PlanGateRunThreeGuardiansSkill } from '../../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { PlanGatePrecheckSkill } from '../../../skills/plan/gate/plan-gate-precheck.skill';
import { FRoadCheckSkill } from '../../../skills/world/f-road-check.skill';
import { WeatherAlertSkill } from '../../../skills/world/weather-alert.skill';
import { AvalancheRiskAssessmentSkill } from '../../../skills/world/avalanche-risk-assessment.skill';
export declare class ClaudeGatekeeperAgentService implements GatekeeperAgent {
    private readonly gateRunThreeGuardians?;
    private readonly gatePrecheck?;
    private readonly fRoadCheck?;
    private readonly weatherAlert?;
    private readonly avalancheRisk?;
    private readonly logger;
    constructor(gateRunThreeGuardians?: PlanGateRunThreeGuardiansSkill, gatePrecheck?: PlanGatePrecheckSkill, fRoadCheck?: FRoadCheckSkill, weatherAlert?: WeatherAlertSkill, avalancheRisk?: AvalancheRiskAssessmentSkill);
    evaluateGate(request: TripPlanRequest, researchData: Record<string, any>, context: OrchestratorState): Promise<GateResult>;
    private checkHardGate;
    private performSoftChecks;
    private extractEvidenceRefs;
    private mapViolationType;
    private isIcelandTrip;
    private toLocationString;
}
