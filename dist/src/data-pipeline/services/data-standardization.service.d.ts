import { CleanedData, StandardizedData } from '../interfaces/data-pipeline.interface';
export declare class DataStandardizationService {
    private readonly logger;
    standardizeData(cleanedData: CleanedData): Promise<StandardizedData>;
    private unifyTimeFormat;
    private unifyCoordinateSystem;
    private unifyUnits;
    private generateStandardizationReport;
    private isTimeField;
    private isCoordinateField;
    private isUnitField;
    private convertToStandardUnit;
    private countTimeFormatIssues;
    private countCoordinateSystemIssues;
    private countUnitIssues;
}
