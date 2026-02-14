import { PersonaContext } from './multi-persona.interface';
export type PersonaState = 'INACTIVE' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type PersonaSwitchStrategy = 'MANUAL' | 'AUTO_CONTEXT' | 'AUTO_TIME' | 'AUTO_ACTIVITY';
export interface PersonaStateInfo {
    personaName: string;
    state: PersonaState;
    activatedAt?: Date;
    lastUsedAt?: Date;
    switchCount: number;
    totalUsageTime: number;
    contextHistory: Array<{
        timestamp: Date;
        context: PersonaContext;
        state: PersonaState;
    }>;
}
export interface PersonaSwitchRequest {
    userId: string;
    fromPersona?: string;
    toPersona: string;
    strategy: PersonaSwitchStrategy;
    context?: PersonaContext;
    reason?: string;
    force?: boolean;
}
export interface PersonaSwitchResult {
    success: boolean;
    fromPersona?: string;
    toPersona: string;
    switchTime: Date;
    strategy: PersonaSwitchStrategy;
    reason?: string;
    conflicts?: Array<{
        type: 'STATE_CONFLICT' | 'CONTEXT_MISMATCH' | 'PRECONDITION_FAILED';
        message: string;
    }>;
    transition?: {
        duration: number;
        steps: string[];
    };
}
export interface PersonaStateMachineConfig {
    enableAutoSwitch?: boolean;
    autoSwitchThreshold?: number;
    stateTransitionRules?: Array<{
        from: PersonaState;
        to: PersonaState;
        conditions?: Array<{
            type: 'CONTEXT_MATCH' | 'TIME_MATCH' | 'ACTIVITY_MATCH';
            value: any;
        }>;
    }>;
    statePersistence?: {
        enabled: boolean;
        persistenceInterval?: number;
    };
}
export interface PersonaStateSnapshot {
    userId: string;
    timestamp: Date;
    activePersona?: string;
    personaStates: Map<string, PersonaStateInfo>;
    context: PersonaContext;
    metadata: {
        totalPersonas: number;
        activePersonas: number;
        lastSwitchTime?: Date;
    };
}
