import { PersonaState, PersonaSwitchStrategy, PersonaStateInfo, PersonaSwitchRequest, PersonaSwitchResult, PersonaStateSnapshot } from '../interfaces/persona-state-management.interface';
import { PersonaContext, MultiPersonaUserTravelProfile } from '../interfaces/multi-persona.interface';
import { MultiPersonaManagerService } from './multi-persona-manager.service';
import { PersonaIdentificationService } from './persona-identification.service';
export declare class PersonaStateManagerService {
    private readonly multiPersonaManager;
    private readonly personaIdentification;
    private readonly logger;
    private readonly personaStates;
    private readonly defaultConfig;
    constructor(multiPersonaManager: MultiPersonaManagerService, personaIdentification: PersonaIdentificationService);
    initializePersonaStates(userId: string, profile: MultiPersonaUserTravelProfile): Promise<void>;
    switchPersona(request: PersonaSwitchRequest): Promise<PersonaSwitchResult>;
    autoSwitchPersona(userId: string, context: PersonaContext, strategy?: PersonaSwitchStrategy): Promise<PersonaSwitchResult | null>;
    getPersonaState(userId: string, personaName: string): PersonaStateInfo | null;
    getAllPersonaStates(userId: string): Map<string, PersonaStateInfo>;
    createStateSnapshot(userId: string, context?: PersonaContext): Promise<PersonaStateSnapshot>;
    private checkSwitchConflicts;
    private evaluateContextMatch;
    private calculateContextSimilarity;
    private persistStates;
    updatePersonaState(userId: string, personaName: string, newState: PersonaState): Promise<void>;
}
