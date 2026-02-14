import { UserPersona, PersonaContext, PersonaChangeSignals, PersonaChangeResult, MultiPersonaUserTravelProfile } from '../interfaces/multi-persona.interface';
import { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
export declare class PersonaIdentificationService {
    private readonly logger;
    identifyCurrentPersona(userProfile: UserTravelProfile | MultiPersonaUserTravelProfile, currentContext: PersonaContext): Promise<{
        persona: UserPersona;
        confidence: number;
    }>;
    detectPersonaChange(oldPersona: UserPersona, newSignals: PersonaChangeSignals): PersonaChangeResult;
    createOrUpdatePersona(userProfile: MultiPersonaUserTravelProfile, personaName: string, context: PersonaContext, signals?: PersonaChangeSignals): Promise<UserPersona>;
    getBestMatchingPersona(userProfile: MultiPersonaUserTravelProfile, context: PersonaContext): UserPersona | null;
    private selectBestMatchingPersona;
    private calculatePersonaMatchScore;
    private createPersonaFromProfile;
    private createNewPersona;
    private updatePersona;
    private createUpdatedPersona;
    private detectPhysicalChanges;
    private detectPsychologicalChanges;
    private detectTemporalChanges;
    private detectPreferenceChanges;
    private matchSocialPreference;
    private matchTimeConstraints;
    private generatePersonaName;
}
