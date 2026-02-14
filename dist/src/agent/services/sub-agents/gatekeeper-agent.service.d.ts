import { GatekeeperAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState, GateResult } from '../../interfaces/trip-plan.interface';
import { PlanGateRunThreeGuardiansSkill } from '../../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { PlanGatePrecheckSkill } from '../../../skills/plan/gate/plan-gate-precheck.skill';
export declare class ClaudeGatekeeperAgentService implements GatekeeperAgent {
    private readonly gateRunThreeGuardians?;
    private readonly gatePrecheck?;
    private readonly logger;
    constructor(gateRunThreeGuardians?: PlanGateRunThreeGuardiansSkill, gatePrecheck?: PlanGatePrecheckSkill);
    evaluateGate(request: TripPlanRequest, researchData: Record<string, any>, context: OrchestratorState): Promise<GateResult>;
    private checkHardGate;
    private performSoftChecks;
    private extractEvidenceRefs;
    private mapViolationType;
}
