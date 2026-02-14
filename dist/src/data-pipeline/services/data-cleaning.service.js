"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DataCleaningService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataCleaningService = void 0;
const common_1 = require("@nestjs/common");
let DataCleaningService = DataCleaningService_1 = class DataCleaningService {
    constructor() {
        this.logger = new common_1.Logger(DataCleaningService_1.name);
    }
    async cleanData(rawData) {
        this.logger.log('Starting data cleaning process');
        const missingValuesHandled = await this.handleMissingValues(rawData);
        const outliersHandled = await this.handleOutliers(missingValuesHandled);
        const formatStandardized = await this.standardizeFormat(outliersHandled);
        const cleaningReport = this.generateCleaningReport(rawData, missingValuesHandled, outliersHandled, formatStandardized);
        return {
            missingValuesHandled,
            outliersHandled,
            formatStandardized,
            cleaningReport,
        };
    }
    async handleMissingValues(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        const cleaned = Array.isArray(data) ? [] : {};
        for (const [key, value] of Object.entries(data)) {
            if (value === null || value === undefined || value === '') {
                if (this.isCriticalField(key)) {
                    cleaned[key] = this.getDefaultValue(key);
                }
                else {
                    cleaned[key] = null;
                }
            }
            else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                cleaned[key] = await this.handleMissingValues(value);
            }
            else {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }
    async handleOutliers(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        const cleaned = Array.isArray(data) ? [] : {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'number') {
                if (this.isOutlier(key, value)) {
                    this.logger.warn(`Outlier detected: ${key} = ${value}`);
                    cleaned[key] = {
                        value,
                        flagged: true,
                        reason: 'outlier',
                    };
                }
                else {
                    cleaned[key] = value;
                }
            }
            else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                cleaned[key] = await this.handleOutliers(value);
            }
            else {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }
    async standardizeFormat(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        const standardized = Array.isArray(data) ? [] : {};
        for (const [key, value] of Object.entries(data)) {
            if (value instanceof Date) {
                standardized[key] = value.toISOString();
            }
            else if (typeof value === 'string' && this.isDateString(value)) {
                try {
                    standardized[key] = new Date(value).toISOString();
                }
                catch {
                    standardized[key] = value;
                }
            }
            else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                standardized[key] = await this.standardizeFormat(value);
            }
            else {
                standardized[key] = value;
            }
        }
        return standardized;
    }
    generateCleaningReport(rawData, missingValuesHandled, outliersHandled, formatStandardized) {
        const missingValuesCount = this.countMissingValues(rawData, missingValuesHandled);
        const outliersCount = this.countOutliers(outliersHandled);
        const formatIssuesCount = this.countFormatIssues(rawData, formatStandardized);
        return {
            missingValuesCount,
            outliersCount,
            formatIssuesCount,
        };
    }
    isCriticalField(field) {
        const criticalFields = ['id', 'userId', 'tripId', 'destination', 'startDate', 'endDate'];
        return criticalFields.includes(field);
    }
    getDefaultValue(field) {
        var _a;
        const defaults = {
            id: null,
            userId: null,
            tripId: null,
            destination: '',
            startDate: null,
            endDate: null,
        };
        return (_a = defaults[field]) !== null && _a !== void 0 ? _a : null;
    }
    isOutlier(field, value) {
        const ranges = {
            latitude: { min: -90, max: 90 },
            longitude: { min: -180, max: 180 },
            temperature: { min: -50, max: 50 },
            duration: { min: 0, max: 86400 },
            distance: { min: 0, max: 100000 },
        };
        const range = ranges[field];
        if (!range) {
            return false;
        }
        return value < range.min || value > range.max;
    }
    isDateString(value) {
        return /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{4}\/\d{2}\/\d{2}/.test(value);
    }
    countMissingValues(rawData, cleanedData) {
        let count = 0;
        const traverse = (raw, cleaned) => {
            if (typeof raw === 'object' && raw !== null) {
                for (const key in raw) {
                    if (raw[key] === null || raw[key] === undefined || raw[key] === '') {
                        if (cleaned[key] === null || cleaned[key] === undefined) {
                            count++;
                        }
                    }
                    else if (typeof raw[key] === 'object') {
                        traverse(raw[key], cleaned[key]);
                    }
                }
            }
        };
        traverse(rawData, cleanedData);
        return count;
    }
    countOutliers(data) {
        let count = 0;
        const traverse = (obj) => {
            if (typeof obj === 'object' && obj !== null) {
                for (const value of Object.values(obj)) {
                    if (typeof value === 'object' && value !== null && 'flagged' in value && value.flagged) {
                        count++;
                    }
                    else if (typeof value === 'object') {
                        traverse(value);
                    }
                }
            }
        };
        traverse(data);
        return count;
    }
    countFormatIssues(rawData, standardizedData) {
        let count = 0;
        const traverse = (raw, std) => {
            if (typeof raw === 'object' && raw !== null) {
                for (const key in raw) {
                    if (raw[key] instanceof Date && typeof std[key] === 'string') {
                        count++;
                    }
                    else if (typeof raw[key] === 'object') {
                        traverse(raw[key], std[key]);
                    }
                }
            }
        };
        traverse(rawData, standardizedData);
        return count;
    }
};
exports.DataCleaningService = DataCleaningService;
exports.DataCleaningService = DataCleaningService = DataCleaningService_1 = __decorate([
    (0, common_1.Injectable)()
], DataCleaningService);
//# sourceMappingURL=data-cleaning.service.js.map