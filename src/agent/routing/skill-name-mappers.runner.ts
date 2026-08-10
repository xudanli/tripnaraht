/**
 * skillName → OrchestrationStep / SubAgentType（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { OrchestrationStep, SubAgentType } from '../interfaces/trip-plan.interface';

export function mapSkillNameToStep(skillName?: string): OrchestrationStep {
  if (!skillName) return 'INTAKE';
  if (
    skillName === 'policy.resolve' ||
    skillName === 'worldState.summarize' ||
    skillName === 'readiness.assess'
  ) {
    return 'GATE_EVAL';
  }
  if (
    skillName.includes('gate') ||
    skillName.includes('runThreeGuardians') ||
    skillName.includes('precheck')
  ) {
    return 'GATE_EVAL';
  }
  if (
    skillName.includes('itinerary.generate') ||
    skillName.includes('plan.') ||
    skillName.includes('architect') ||
    skillName.includes('transit') ||
    skillName.includes('budget') ||
    skillName.includes('pace') ||
    skillName.includes('constraints')
  ) {
    return 'PLAN_GEN';
  }
  if (skillName === 'itinerary.smart_update') return 'REPAIR';
  if (skillName.includes('verify')) return 'VERIFY';
  if (skillName.includes('repair') || skillName.includes('alternatives')) return 'REPAIR';
  if (skillName.includes('narrate') || skillName.includes('explain')) return 'NARRATE';
  return 'RESEARCH';
}

export function mapSkillNameToSubAgent(skillName?: string): SubAgentType {
  if (!skillName) return 'Planner';
  if (skillName.includes('gate')) return 'Gatekeeper';
  if (skillName === 'itinerary.smart_update') return 'LocalInsight';
  if (skillName.includes('narrate') || skillName.includes('explain')) return 'Narrator';
  return 'Planner';
}
