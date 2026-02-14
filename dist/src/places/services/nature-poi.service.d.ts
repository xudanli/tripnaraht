import { PrismaService } from '../../prisma/prisma.service';
import { IcelandNaturePoi, DataSource, Coordinates } from '../interfaces/nature-poi.interface';
export declare class NaturePoiService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    importFromGeoJSON(geojson: {
        type: 'FeatureCollection';
        features: Array<{
            type: 'Feature';
            geometry: {
                type: 'Point' | 'Polygon' | 'MultiPolygon' | 'LineString';
                coordinates: number[] | number[][] | number[][][];
            };
            properties: Record<string, any>;
        }>;
    }, source: DataSource, countryCode: string, cityId?: number, validate?: boolean): Promise<{
        total: number;
        created: number;
        skipped: number;
        errors: number;
        results: Array<{
            name: string;
            status: 'created' | 'skipped' | 'error';
            error?: string;
        }>;
        validation?: {
            valid: boolean;
            errors: string[];
            warnings: string[];
        };
    }>;
    findNaturePoisByArea(center: Coordinates, radiusMeters?: number, subCategory?: string): Promise<IcelandNaturePoi[]>;
    findNaturePoisByCategory(subCategory: string, countryCode?: string, limit?: number): Promise<IcelandNaturePoi[]>;
    private extractCoordinates;
    private extractName;
    private mapGeometryType;
    private mapSubCategory;
    private extractTags;
    private extractBestSeasons;
    private extractAccessType;
    private extractTrailDifficulty;
    private extractHazardLevel;
    private extractSafetyNotes;
    private findExistingPoi;
    private saveNaturePoiAsPlace;
    private placeToNaturePoi;
}
