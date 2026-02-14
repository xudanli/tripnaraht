import { PersonaCharacteristics, PersonaCommunication, UserProfile, Culture, CulturalAdaptation } from '../interfaces/persona-communication.interface';
import { CommunicationContext } from '../interfaces/brand-expression.interface';
export declare class PersonaBasedCommunicationService {
    private readonly logger;
    identifyUserPersona(userProfile: UserProfile): PersonaCharacteristics;
    generatePersonaBasedCommunication(persona: PersonaCharacteristics, context: CommunicationContext): PersonaCommunication;
    adaptForCulture(text: string, culture: Culture): CulturalAdaptation;
    adaptForCity(text: string, city: string, culture: Culture): string;
    private generateRationalExplorerCommunication;
    private generateExperienceSeekerCommunication;
    private generateConservativeSafetyCommunication;
    private generateDefaultCommunication;
    private getCommunicationPreferences;
    private adaptTextForCulture;
    private extractCulturalElements;
    generatePersonaCopy(baseText: string, persona: PersonaCharacteristics, context: CommunicationContext): string;
}
