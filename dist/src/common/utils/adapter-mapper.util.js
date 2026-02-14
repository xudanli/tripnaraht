"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdapterMapper = void 0;
class AdapterMapper {
    static mapSeverity(severity, customMap) {
        const defaultMap = {
            'yellow': 'warning',
            'orange': 'warning',
            'red': 'critical',
            'info': 'info',
            'warning': 'warning',
            'critical': 'critical',
            'danger': 'critical',
        };
        const map = customMap ? { ...defaultMap, ...customMap } : defaultMap;
        return map[(severity === null || severity === void 0 ? void 0 : severity.toLowerCase()) || ''] || 'info';
    }
    static mapWeatherCondition(condition, customMap) {
        const defaultMap = {
            'Clear': 'sunny',
            'Sunny': 'sunny',
            'Clouds': 'cloudy',
            'Cloudy': 'cloudy',
            'Overcast': 'cloudy',
            'Rain': 'rainy',
            'Rainy': 'rainy',
            'Drizzle': 'rainy',
            'Thunderstorm': 'stormy',
            'Storm': 'stormy',
            'Snow': 'snowy',
            'Snowy': 'snowy',
            'Mist': 'foggy',
            'Fog': 'foggy',
            'Haze': 'hazy',
            'Windy': 'windy',
        };
        const map = customMap ? { ...defaultMap, ...customMap } : defaultMap;
        return map[condition || ''] || (condition === null || condition === void 0 ? void 0 : condition.toLowerCase()) || 'unknown';
    }
    static extractErrorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        return String(error);
    }
    static createDefaultErrorResponse(source, error, defaultData) {
        return {
            ...defaultData,
            lastUpdated: new Date(),
            source,
            metadata: {
                ...defaultData.metadata,
                error: this.extractErrorMessage(error),
            },
        };
    }
}
exports.AdapterMapper = AdapterMapper;
//# sourceMappingURL=adapter-mapper.util.js.map