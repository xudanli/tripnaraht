"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGeoJSON = validateGeoJSON;
exports.validateNaturePoiProperties = validateNaturePoiProperties;
function validateGeoJSON(geojson) {
    const errors = [];
    const warnings = [];
    if (!geojson || typeof geojson !== 'object') {
        errors.push('GeoJSON 必须是对象');
        return { valid: false, errors, warnings };
    }
    if (geojson.type !== 'FeatureCollection') {
        errors.push('GeoJSON type 必须是 "FeatureCollection"');
    }
    if (!Array.isArray(geojson.features)) {
        errors.push('GeoJSON 必须包含 features 数组');
        return { valid: false, errors, warnings };
    }
    if (geojson.features.length === 0) {
        warnings.push('GeoJSON features 数组为空');
    }
    geojson.features.forEach((feature, index) => {
        const featureErrors = validateFeature(feature, index);
        errors.push(...featureErrors.errors);
        warnings.push(...featureErrors.warnings);
    });
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
function validateFeature(feature, index) {
    const errors = [];
    const warnings = [];
    if (!feature || typeof feature !== 'object') {
        errors.push(`Feature ${index}: 必须是对象`);
        return { errors, warnings };
    }
    if (feature.type !== 'Feature') {
        errors.push(`Feature ${index}: type 必须是 "Feature"`);
    }
    if (!feature.geometry) {
        errors.push(`Feature ${index}: 缺少 geometry`);
    }
    else {
        const geometryErrors = validateGeometry(feature.geometry, index);
        errors.push(...geometryErrors);
    }
    if (!feature.properties) {
        warnings.push(`Feature ${index}: 缺少 properties`);
    }
    else {
        const propertyWarnings = validateProperties(feature.properties, index);
        warnings.push(...propertyWarnings);
    }
    return { errors, warnings };
}
function validateGeometry(geometry, featureIndex) {
    const errors = [];
    if (!geometry || typeof geometry !== 'object') {
        errors.push(`Feature ${featureIndex}: geometry 必须是对象`);
        return errors;
    }
    const validTypes = ['Point', 'Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'];
    if (!validTypes.includes(geometry.type)) {
        errors.push(`Feature ${featureIndex}: geometry.type 必须是 ${validTypes.join(', ')} 之一`);
    }
    if (!Array.isArray(geometry.coordinates)) {
        errors.push(`Feature ${featureIndex}: geometry.coordinates 必须是数组`);
        return errors;
    }
    if (geometry.type === 'Point') {
        if (geometry.coordinates.length !== 2) {
            errors.push(`Feature ${featureIndex}: Point coordinates 必须包含 [lng, lat]`);
        }
        else {
            const [lng, lat] = geometry.coordinates;
            if (typeof lng !== 'number' || typeof lat !== 'number') {
                errors.push(`Feature ${featureIndex}: Point coordinates 必须是数字`);
            }
            if (lng < -180 || lng > 180) {
                errors.push(`Feature ${featureIndex}: 经度必须在 -180 到 180 之间`);
            }
            if (lat < -90 || lat > 90) {
                errors.push(`Feature ${featureIndex}: 纬度必须在 -90 到 90 之间`);
            }
        }
    }
    return errors;
}
function validateProperties(properties, featureIndex) {
    const warnings = [];
    if (!properties.name && !properties.NAME && !properties.name_en && !properties.name_zh) {
        warnings.push(`Feature ${featureIndex}: 建议包含 name 字段`);
    }
    if (!properties.subCategory && !properties.SUB_CATEGORY && !properties.type && !properties.TYPE) {
        warnings.push(`Feature ${featureIndex}: 建议包含 subCategory 或 type 字段`);
    }
    return warnings;
}
function validateNaturePoiProperties(properties) {
    const errors = [];
    const warnings = [];
    if (!properties.name && !properties.NAME && !properties.name_en && !properties.name_zh) {
        errors.push('缺少名称字段 (name, NAME, name_en, 或 name_zh)');
    }
    if (!properties.subCategory && !properties.SUB_CATEGORY) {
        warnings.push('建议包含 subCategory 字段');
    }
    if (properties.subCategory || properties.SUB_CATEGORY) {
        const validCategories = [
            'volcano',
            'lava_field',
            'geothermal_area',
            'hot_spring',
            'glacier',
            'glacier_lagoon',
            'waterfall',
            'canyon',
            'crater_lake',
            'black_sand_beach',
            'sea_cliff',
            'national_park',
            'nature_reserve',
            'viewpoint',
            'cave',
            'coastline',
            'other',
        ];
        const category = (properties.subCategory || properties.SUB_CATEGORY || '').toLowerCase();
        if (!validCategories.includes(category) && category !== 'other') {
            warnings.push(`子类别 "${category}" 不在标准列表中，将映射为 "other"`);
        }
    }
    if (properties.accessType || properties.ACCESS_TYPE) {
        const validAccessTypes = ['drive', 'hike', '4x4', 'guided_only', 'boat', 'unknown'];
        const accessType = (properties.accessType || properties.ACCESS_TYPE || '').toLowerCase();
        if (!validAccessTypes.includes(accessType)) {
            warnings.push(`访问方式 "${accessType}" 不在标准列表中`);
        }
    }
    if (properties.trailDifficulty || properties.TRAIL_DIFFICULTY) {
        const validDifficulties = ['easy', 'moderate', 'hard', 'expert', 'unknown'];
        const difficulty = (properties.trailDifficulty || properties.TRAIL_DIFFICULTY || '').toLowerCase();
        if (!validDifficulties.includes(difficulty)) {
            warnings.push(`徒步难度 "${difficulty}" 不在标准列表中`);
        }
    }
    if (properties.hazardLevel || properties.HAZARD_LEVEL) {
        const validLevels = ['low', 'medium', 'high', 'extreme', 'unknown'];
        const level = (properties.hazardLevel || properties.HAZARD_LEVEL || '').toLowerCase();
        if (!validLevels.includes(level)) {
            warnings.push(`危险等级 "${level}" 不在标准列表中`);
        }
    }
    if (properties.bestSeasons || properties.BEST_SEASONS) {
        const seasons = properties.bestSeasons || properties.BEST_SEASONS;
        if (Array.isArray(seasons)) {
            const validSeasons = ['spring', 'summer', 'autumn', 'winter'];
            seasons.forEach((season) => {
                if (!validSeasons.includes(season.toLowerCase())) {
                    warnings.push(`季节 "${season}" 不在标准列表中`);
                }
            });
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
//# sourceMappingURL=geojson-validator.util.js.map