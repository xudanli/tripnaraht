import { Place } from '@prisma/client';
import { PlaceNodeProperties } from '../../trips/decision/graph-db/graph-db.interface';
export interface PlaceWithGraph extends Place {
    graphNodeId?: string;
    graphProperties?: PlaceNodeProperties;
    graphRelations?: {
        connectsTo?: Array<{
            placeId: string;
            distance?: number;
            relationType?: 'CONNECTS_TO' | 'NEARBY' | 'ALONG_ROUTE';
        }>;
        belongsTo?: Array<{
            routeDirectionId: string;
            relationType?: 'BELONGS_TO';
        }>;
        inCountry?: {
            countryCode: string;
            relationType?: 'IN_COUNTRY';
        };
        inRegion?: {
            regionId: string;
            relationType?: 'IN_REGION';
        };
    };
}
export interface PlaceToGraphNodeOptions {
    includeDemEvidence?: boolean;
    includeRelations?: boolean;
    routeDirectionId?: string;
    countryCode?: string;
    regionId?: string;
}
