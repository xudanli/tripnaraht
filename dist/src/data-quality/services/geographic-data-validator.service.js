"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GeographicDataValidatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeographicDataValidatorService = void 0;
const common_1 = require("@nestjs/common");
let GeographicDataValidatorService = GeographicDataValidatorService_1 = class GeographicDataValidatorService {
    constructor() {
        this.logger = new common_1.Logger(GeographicDataValidatorService_1.name);
    }
    validateCoordinates(lat, lng) {
        const errors = [];
        const warnings = [];
        if (typeof lat !== 'number' || isNaN(lat)) {
            errors.push({
                field: 'lat',
                message: `纬度必须是数字，当前值: ${lat}`,
            });
            return { valid: false, errors, warnings };
        }
        if (typeof lng !== 'number' || isNaN(lng)) {
            errors.push({
                field: 'lng',
                message: `经度必须是数字，当前值: ${lng}`,
            });
            return { valid: false, errors, warnings };
        }
        if (lat < -90 || lat > 90) {
            errors.push({
                field: 'lat',
                message: `纬度超出范围: ${lat}，有效范围: -90 到 90`,
            });
        }
        if (lng < -180 || lng > 180) {
            errors.push({
                field: 'lng',
                message: `经度超出范围: ${lng}，有效范围: -180 到 180`,
            });
        }
        const latPrecision = this.getDecimalPlaces(lat);
        const lngPrecision = this.getDecimalPlaces(lng);
        if (latPrecision < 4) {
            warnings.push({
                field: 'lat',
                message: `纬度精度不足: ${latPrecision} 位小数，建议至少4位（约11米精度）`,
            });
        }
        if (lngPrecision < 4) {
            warnings.push({
                field: 'lng',
                message: `经度精度不足: ${lngPrecision} 位小数，建议至少4位（约11米精度）`,
            });
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    validateSpatialRange(coordinates, targetCountryCode) {
        const errors = [];
        const warnings = [];
        if (coordinates.length === 0) {
            errors.push({
                field: 'coordinates',
                message: '坐标列表为空',
            });
            return { valid: false, errors, warnings };
        }
        const countryBounds = this.getCountryBounds(targetCountryCode);
        if (!countryBounds) {
            warnings.push({
                field: 'targetCountryCode',
                message: `未知国家代码: ${targetCountryCode}，无法验证空间范围`,
            });
            return { valid: true, errors, warnings };
        }
        const outOfBounds = [];
        for (let i = 0; i < coordinates.length; i++) {
            const coord = coordinates[i];
            const coordValidation = this.validateCoordinates(coord.lat, coord.lng);
            if (!coordValidation.valid) {
                errors.push({
                    field: `coordinates[${i}]`,
                    message: `坐标格式无效: ${coordValidation.errors.map(e => e.message).join(', ')}`,
                });
                continue;
            }
            if (coord.lat < countryBounds.minLat ||
                coord.lat > countryBounds.maxLat ||
                coord.lng < countryBounds.minLng ||
                coord.lng > countryBounds.maxLng) {
                outOfBounds.push({ ...coord, index: i });
            }
        }
        if (outOfBounds.length > 0) {
            warnings.push({
                field: 'coordinates',
                message: `${outOfBounds.length} 个坐标超出 ${targetCountryCode} 边界范围。示例: (${outOfBounds[0].lat}, ${outOfBounds[0].lng})`,
            });
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    validateCoordinateSystemConsistency(data) {
        const errors = [];
        const warnings = [];
        if (data.length === 0) {
            warnings.push({
                field: 'data',
                message: '数据为空，无法验证坐标系统一致性',
            });
            return { valid: true, errors, warnings };
        }
        let invalidCount = 0;
        for (let i = 0; i < data.length; i++) {
            const coord = data[i];
            const coordValidation = this.validateCoordinates(coord.lat, coord.lng);
            if (!coordValidation.valid) {
                invalidCount++;
                if (invalidCount <= 5) {
                    errors.push({
                        field: `data[${i}]`,
                        message: `坐标不符合WGS84格式: ${coordValidation.errors.map(e => e.message).join(', ')}`,
                    });
                }
            }
        }
        if (invalidCount > 5) {
            errors.push({
                field: 'data',
                message: `还有 ${invalidCount - 5} 个坐标不符合WGS84格式`,
            });
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    validateSpatialTopology(features) {
        const errors = [];
        const warnings = [];
        if (features.length === 0) {
            warnings.push({
                field: 'features',
                message: '地理特征列表为空',
            });
            return { valid: true, errors, warnings };
        }
        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            if (!feature.geometry) {
                errors.push({
                    field: `features[${i}].geometry`,
                    message: '几何数据缺失',
                });
                continue;
            }
            const validTypes = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'];
            if (!validTypes.includes(feature.geometry.type)) {
                warnings.push({
                    field: `features[${i}].geometry.type`,
                    message: `未知几何类型: ${feature.geometry.type}，支持的类型: ${validTypes.join(', ')}`,
                });
            }
            if (feature.geometry.coordinates && Array.isArray(feature.geometry.coordinates)) {
                const coords = feature.geometry.coordinates;
                if (coords.length > 0 && typeof coords[0] === 'number') {
                    const coordValidation = this.validateCoordinates(coords[1], coords[0]);
                    if (!coordValidation.valid) {
                        errors.push({
                            field: `features[${i}].geometry.coordinates`,
                            message: `坐标无效: ${coordValidation.errors.map(e => e.message).join(', ')}`,
                        });
                    }
                }
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    validateCoordinatesBatch(coordinates) {
        const errors = [];
        const warnings = [];
        for (let i = 0; i < coordinates.length; i++) {
            const coord = coordinates[i];
            const result = this.validateCoordinates(coord.lat, coord.lng);
            if (!result.valid) {
                result.errors.forEach(err => {
                    errors.push({
                        field: `coordinates[${i}].${err.field}`,
                        message: err.message,
                    });
                });
            }
            result.warnings.forEach(warn => {
                warnings.push({
                    field: `coordinates[${i}].${warn.field}`,
                    message: warn.message,
                });
            });
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    extractCoordinatesFromPhysicalRealityData(data) {
        const coordinates = [];
        if (data.segments && Array.isArray(data.segments)) {
            data.segments.forEach((segment) => {
                if (segment.start) {
                    coordinates.push({ lat: segment.start.lat, lng: segment.start.lng });
                }
                if (segment.end) {
                    coordinates.push({ lat: segment.end.lat, lng: segment.end.lng });
                }
            });
        }
        if (data.routes && Array.isArray(data.routes)) {
            data.routes.forEach((route) => {
                if (route.origin) {
                    coordinates.push({ lat: route.origin.lat, lng: route.origin.lng });
                }
                if (route.destination) {
                    coordinates.push({ lat: route.destination.lat, lng: route.destination.lng });
                }
            });
        }
        if (data.regions && Array.isArray(data.regions)) {
            data.regions.forEach((region) => {
                if (region.center) {
                    coordinates.push({ lat: region.center.lat, lng: region.center.lng });
                }
            });
        }
        return coordinates;
    }
    getDecimalPlaces(num) {
        if (Math.floor(num) === num)
            return 0;
        const str = num.toString();
        if (str.indexOf('.') !== -1 && str.indexOf('e-') === -1) {
            return str.split('.')[1].length;
        }
        else if (str.indexOf('e-') !== -1) {
            const parts = str.split('e-');
            return parseInt(parts[1], 10) + (parts[0].split('.')[1] || '').length;
        }
        return 0;
    }
    getCountryBounds(countryCode) {
        const bounds = {
            CH: { minLat: 45.8, maxLat: 47.8, minLng: 5.9, maxLng: 10.5 },
            NO: { minLat: 57.9, maxLat: 71.2, minLng: 4.5, maxLng: 31.3 },
            PE: { minLat: -18.3, maxLat: -0.0, minLng: -81.3, maxLng: -68.7 },
            IS: { minLat: 63.3, maxLat: 66.6, minLng: -24.5, maxLng: -13.5 },
            GL: { minLat: 59.8, maxLat: 83.6, minLng: -73.0, maxLng: -12.2 },
            FO: { minLat: 61.4, maxLat: 62.4, minLng: -7.7, maxLng: -6.3 },
            NZ: { minLat: -47.3, maxLat: -34.4, minLng: 166.4, maxLng: 178.6 },
            SJ: { minLat: 74.0, maxLat: 81.0, minLng: 10.0, maxLng: 35.0 },
            AR: { minLat: -55.1, maxLat: -21.8, minLng: -73.6, maxLng: -53.6 },
        };
        return bounds[countryCode] || null;
    }
};
exports.GeographicDataValidatorService = GeographicDataValidatorService;
exports.GeographicDataValidatorService = GeographicDataValidatorService = GeographicDataValidatorService_1 = __decorate([
    (0, common_1.Injectable)()
], GeographicDataValidatorService);
//# sourceMappingURL=geographic-data-validator.service.js.map