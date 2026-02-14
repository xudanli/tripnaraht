import { PrismaService } from '../../../prisma/prisma.service';
import { UserPersona, MultiPersonaUserTravelProfile, PersonaContext, PersonaChangeSignals, PersonaChangeResult } from '../interfaces/multi-persona.interface';
import { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import { PersonaIdentificationService } from './persona-identification.service';
export declare class MultiPersonaManagerService {
    private readonly prisma;
    private readonly personaIdentification;
    private readonly logger;
    constructor(prisma: PrismaService, personaIdentification: PersonaIdentificationService);
    getMultiPersonaProfile(userId: string): Promise<MultiPersonaUserTravelProfile | null>;
    saveMultiPersonaProfile(profile: MultiPersonaUserTravelProfile): Promise<void>;
    addOrUpdatePersona(userId: string, persona: UserPersona): Promise<void>;
    activatePersona(userId: string, personaName: string): Promise<void>;
    createMultiPersonaFromBaseProfile(baseProfile: UserTravelProfile, context: PersonaContext): Promise<MultiPersonaUserTravelProfile>;
    detectAndUpdatePersonaChange(userId: string, signals: PersonaChangeSignals): Promise<PersonaChangeResult>;
    private serializePersona;
    private deserializePersona;
}
