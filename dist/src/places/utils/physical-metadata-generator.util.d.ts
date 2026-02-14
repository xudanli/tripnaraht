import { PlaceCategory } from '@prisma/client';
import { PhysicalMetadata } from '../interfaces/physical-metadata.interface';
export declare class PhysicalMetadataGenerator {
    static generateByCategory(category: PlaceCategory, metadata?: any): PhysicalMetadata;
    private static getDefaultByCategory;
    private static enhanceFromMetadata;
    private static applyDifficultyModifier;
    private static patchFromAccessType;
    private static patchFromTypicalStay;
    private static getDurationFromDataSources;
    private static patchFromElevation;
    private static patchFromFacilities;
    private static patchFromSubCategory;
    private static mergePatches;
    private static normalize;
    private static clamp;
    private static isValidString;
    private static isValidNumber;
    private static parseDuration;
    static generateFromNaturePoi(poiMetadata: any): PhysicalMetadata;
}
