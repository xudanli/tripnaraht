import { Skill, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { PlacesService } from '../../places/places.service';
import { PrismaService } from '../../prisma/prisma.service';
export interface GeoFindNearbyPOIInput extends BaseSkillInput {
    location: {
        lat: number;
        lng: number;
    };
    radius: number;
    category?: ('RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL' | 'NATURE' | 'VIEWPOINT' | 'HISTORIC_SITE')[];
    filters?: {
        minRating?: number;
        hasOpeningHours?: boolean;
        paymentMethods?: string[];
    };
    limit?: number;
}
export interface GeoFindNearbyPOIOutput extends SkillOutput {
    pois: Array<{
        id: number;
        name: string;
        nameCN: string;
        nameEN?: string | null;
        category: string;
        location: {
            lat: number;
            lng: number;
        };
        distance: number;
        rating?: number | null;
        address?: string | null;
        isOpen?: boolean;
        metadata?: Record<string, any>;
    }>;
    summary: {
        totalFound: number;
        radius: number;
        queryTime: number;
    };
}
export declare class GeoFindNearbyPOISkill implements Skill<GeoFindNearbyPOIInput, GeoFindNearbyPOIOutput> {
    private readonly placesService?;
    private readonly prisma?;
    private readonly logger;
    private readonly MAX_RADIUS;
    private readonly MAX_LIMIT;
    metadata: SkillMetadata;
    constructor(placesService?: PlacesService, prisma?: PrismaService);
    execute(input: GeoFindNearbyPOIInput): Promise<GeoFindNearbyPOIOutput>;
}
