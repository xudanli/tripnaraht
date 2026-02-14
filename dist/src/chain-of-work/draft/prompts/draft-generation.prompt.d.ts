import { TripPlanRequest } from '../../../agent/interfaces/trip-plan.interface';
import { Skill } from '../../../skills/interfaces/skill.interface';
export declare function buildDraftGenerationPrompt(request: TripPlanRequest, skills: Skill[]): string;
