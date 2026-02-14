import { PrismaService } from '../../prisma/prisma.service';
import { Poi } from '../interfaces/poi.interface';
import { PlaceToPoiService } from './place-to-poi.service';
export declare class PlaceToPoiHelperService {
    private readonly prisma;
    private readonly placeToPoiService;
    constructor(prisma: PrismaService, placeToPoiService: PlaceToPoiService);
    getPoiById(placeId: number): Promise<Poi | null>;
    getPoisByIds(placeIds: number[]): Promise<Poi[]>;
    getPoisByCondition(where: any, limit?: number): Promise<Poi[]>;
    createPoiLookup(placeIds: number[]): Promise<{
        getPoiById: (id: string) => Poi | undefined;
    }>;
}
