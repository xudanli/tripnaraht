import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionResult, DecisionPersona } from '../shared/decision-result.types';
export interface DecisionPersonaStrategy {
    readonly personaName: DecisionPersona;
    evaluate(world: WorldModelContext, plan: RoutePlanDraft): Promise<DecisionResult>;
}
