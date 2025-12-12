// src/places/utils/geojson-validator.util.ts

/**
 * GeoJSON 验证工具
 * 
 * 用于验证 GeoJSON 格式和必需字段
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证 GeoJSON 格式
 */
export function validateGeoJSON(geojson: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查基本结构
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

  // 验证每个 Feature
  geojson.features.forEach((feature: any, index: number) => {
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

/**
 * 验证单个 Feature
 */
function validateFeature(feature: any, index: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!feature || typeof feature !== 'object') {
    errors.push(`Feature ${index}: 必须是对象`);
    return { errors, warnings };
  }

  // 检查 type
  if (feature.type !== 'Feature') {
    errors.push(`Feature ${index}: type 必须是 "Feature"`);
  }

  // 检查 geometry
  if (!feature.geometry) {
    errors.push(`Feature ${index}: 缺少 geometry`);
  } else {
    const geometryErrors = validateGeometry(feature.geometry, index);
    errors.push(...geometryErrors);
  }

  // 检查 properties
  if (!feature.properties) {
    warnings.push(`Feature ${index}: 缺少 properties`);
  } else {
    const propertyWarnings = validateProperties(feature.properties, index);
    warnings.push(...propertyWarnings);
  }

  return { errors, warnings };
}

/**
 * 验证 Geometry
 */
function validateGeometry(geometry: any, featureIndex: number): string[] {
  const errors: string[] = [];

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

  // 验证坐标
  if (geometry.type === 'Point') {
    if (geometry.coordinates.length !== 2) {
      errors.push(`Feature ${featureIndex}: Point coordinates 必须包含 [lng, lat]`);
    } else {
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

/**
 * 验证 Properties
 */
function validateProperties(properties: any, featureIndex: number): string[] {
  const warnings: string[] = [];

  // 检查必需字段
  if (!properties.name && !properties.NAME && !properties.name_en && !properties.name_zh) {
    warnings.push(`Feature ${featureIndex}: 建议包含 name 字段`);
  }

  if (!properties.subCategory && !properties.SUB_CATEGORY && !properties.type && !properties.TYPE) {
    warnings.push(`Feature ${featureIndex}: 建议包含 subCategory 或 type 字段`);
  }

  return warnings;
}

/**
 * 验证自然 POI 的 Properties
 */
export function validateNaturePoiProperties(properties: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 必需字段
  if (!properties.name && !properties.NAME && !properties.name_en && !properties.name_zh) {
    errors.push('缺少名称字段 (name, NAME, name_en, 或 name_zh)');
  }

  // 建议字段
  if (!properties.subCategory && !properties.SUB_CATEGORY) {
    warnings.push('建议包含 subCategory 字段');
  }

  // 验证子类别
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

  // 验证枚举字段
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
      seasons.forEach((season: string) => {
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
