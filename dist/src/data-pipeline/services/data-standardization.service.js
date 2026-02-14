"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DataStandardizationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataStandardizationService = void 0;
const common_1 = require("@nestjs/common");
let DataStandardizationService = DataStandardizationService_1 = class DataStandardizationService {
    constructor() {
        this.logger = new common_1.Logger(DataStandardizationService_1.name);
    }
    async standardizeData(cleanedData) {
        this.logger.log('Starting data standardization process');
        const data = cleanedData.formatStandardized;
        const timeFormat = await this.unifyTimeFormat(data);
        const coordinateSystem = await this.unifyCoordinateSystem(timeFormat);
        const units = await this.unifyUnits(coordinateSystem);
        const standardizationReport = this.generateStandardizationReport(cleanedData, timeFormat, coordinateSystem, units);
        return {
            timeFormat,
            coordinateSystem,
            units,
            standardizationReport,
        };
    }
    async unifyTimeFormat(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        const standardized = Array.isArray(data) ? [] : {};
        for (const [key, value] of Object.entries(data)) {
            if (this.isTimeField(key)) {
                if (typeof value === 'string') {
                    try {
                        standardized[key] = new Date(value).toISOString();
                    }
                    catch {
                        standardized[key] = value;
                    }
                }
                else if (value instanceof Date) {
                    standardized[key] = value.toISOString();
                }
                else {
                    standardized[key] = value;
                }
            }
            else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                standardized[key] = await this.unifyTimeFormat(value);
            }
            else {
                standardized[key] = value;
            }
        }
        return standardized;
    }
    async unifyCoordinateSystem(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        const standardized = Array.isArray(data) ? [] : {};
        for (const [key, value] of Object.entries(data)) {
            if (this.isCoordinateField(key)) {
                if (typeof value === 'number') {
                    if (key === 'latitude' || key === 'lat') {
                        standardized[key] = Math.max(-90, Math.min(90, value));
                    }
                    else if (key === 'longitude' || key === 'lng' || key === 'lon') {
                        standardized[key] = Math.max(-180, Math.min(180, value));
                    }
                    else {
                        standardized[key] = value;
                    }
                }
                else if (typeof value === 'object' && value !== null) {
                    standardized[key] = await this.unifyCoordinateSystem(value);
                }
                else {
                    standardized[key] = value;
                }
            }
            else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                standardized[key] = await this.unifyCoordinateSystem(value);
            }
            else {
                standardized[key] = value;
            }
        }
        return standardized;
    }
    async unifyUnits(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        const standardized = Array.isArray(data) ? [] : {};
        for (const [key, value] of Object.entries(data)) {
            if (this.isUnitField(key)) {
                if (typeof value === 'number') {
                    standardized[key] = this.convertToStandardUnit(key, value);
                }
                else if (typeof value === 'object' && value !== null && 'value' in value && 'unit' in value) {
                    const valueObj = value;
                    if (typeof valueObj.value === 'number') {
                        standardized[key] = this.convertToStandardUnit(key, valueObj.value, valueObj.unit);
                    }
                    else {
                        standardized[key] = value;
                    }
                }
                else {
                    standardized[key] = value;
                }
            }
            else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                standardized[key] = await this.unifyUnits(value);
            }
            else {
                standardized[key] = value;
            }
        }
        return standardized;
    }
    generateStandardizationReport(cleanedData, timeFormat, coordinateSystem, units) {
        const timeFormatIssues = this.countTimeFormatIssues(cleanedData.formatStandardized, timeFormat);
        const coordinateSystemIssues = this.countCoordinateSystemIssues(timeFormat, coordinateSystem);
        const unitIssues = this.countUnitIssues(coordinateSystem, units);
        return {
            timeFormatIssues,
            coordinateSystemIssues,
            unitIssues,
        };
    }
    isTimeField(field) {
        const timeFields = [
            'timestamp',
            'createdAt',
            'updatedAt',
            'startDate',
            'endDate',
            'date',
            'time',
            'datetime',
            'collectedAt',
            'processedAt',
        ];
        return timeFields.some(f => field.toLowerCase().includes(f.toLowerCase()));
    }
    isCoordinateField(field) {
        const coordinateFields = ['latitude', 'lat', 'longitude', 'lng', 'lon', 'coordinates', 'location'];
        return coordinateFields.some(f => field.toLowerCase().includes(f.toLowerCase()));
    }
    isUnitField(field) {
        const unitFields = ['distance', 'duration', 'speed', 'temperature', 'weight', 'height', 'width'];
        return unitFields.some(f => field.toLowerCase().includes(f.toLowerCase()));
    }
    convertToStandardUnit(field, value, sourceUnit) {
        if (field.toLowerCase().includes('distance')) {
            if (sourceUnit === 'km' || sourceUnit === 'kilometer') {
                return value * 1000;
            }
            else if (sourceUnit === 'mile' || sourceUnit === 'mi') {
                return value * 1609.34;
            }
            return value;
        }
        if (field.toLowerCase().includes('duration')) {
            if (sourceUnit === 'minute' || sourceUnit === 'min') {
                return value * 60;
            }
            else if (sourceUnit === 'hour' || sourceUnit === 'hr') {
                return value * 3600;
            }
            else if (sourceUnit === 'day') {
                return value * 86400;
            }
            return value;
        }
        if (field.toLowerCase().includes('temperature')) {
            if (sourceUnit === 'fahrenheit' || sourceUnit === 'f') {
                return (value - 32) * (5 / 9);
            }
            else if (sourceUnit === 'kelvin' || sourceUnit === 'k') {
                return value - 273.15;
            }
            return value;
        }
        return value;
    }
    countTimeFormatIssues(before, after) {
        let count = 0;
        const traverse = (b, a) => {
            if (typeof b === 'object' && b !== null) {
                for (const key in b) {
                    if (this.isTimeField(key) && b[key] !== a[key]) {
                        count++;
                    }
                    else if (typeof b[key] === 'object') {
                        traverse(b[key], a[key]);
                    }
                }
            }
        };
        traverse(before, after);
        return count;
    }
    countCoordinateSystemIssues(before, after) {
        let count = 0;
        const traverse = (b, a) => {
            if (typeof b === 'object' && b !== null) {
                for (const key in b) {
                    if (this.isCoordinateField(key) && typeof b[key] === 'number' && b[key] !== a[key]) {
                        count++;
                    }
                    else if (typeof b[key] === 'object') {
                        traverse(b[key], a[key]);
                    }
                }
            }
        };
        traverse(before, after);
        return count;
    }
    countUnitIssues(before, after) {
        let count = 0;
        const traverse = (b, a) => {
            if (typeof b === 'object' && b !== null) {
                for (const key in b) {
                    if (this.isUnitField(key) && typeof b[key] === 'number' && b[key] !== a[key]) {
                        count++;
                    }
                    else if (typeof b[key] === 'object') {
                        traverse(b[key], a[key]);
                    }
                }
            }
        };
        traverse(before, after);
        return count;
    }
};
exports.DataStandardizationService = DataStandardizationService;
exports.DataStandardizationService = DataStandardizationService = DataStandardizationService_1 = __decorate([
    (0, common_1.Injectable)()
], DataStandardizationService);
//# sourceMappingURL=data-standardization.service.js.map