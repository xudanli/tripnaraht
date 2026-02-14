import { CleanedData } from '../interfaces/data-pipeline.interface';
export declare class DataCleaningService {
    private readonly logger;
    cleanData(rawData: any): Promise<CleanedData>;
    private handleMissingValues;
    private handleOutliers;
    private standardizeFormat;
    private generateCleaningReport;
    private isCriticalField;
    private getDefaultValue;
    private isOutlier;
    private isDateString;
    private countMissingValues;
    private countOutliers;
    private countFormatIssues;
}
