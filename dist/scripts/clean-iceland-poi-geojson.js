#!/usr/bin/env tsx
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ICELAND_BOUNDS = {
    minLng: -25.0,
    maxLng: -13.0,
    minLat: 63.0,
    maxLat: 67.0,
};
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        input: 'data/iceland_poi.json.geojson',
        output: 'data/iceland_poi_cleaned.json.geojson',
        dryRun: false,
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--input' && args[i + 1]) {
            options.input = args[i + 1];
            i++;
        }
        else if (arg === '--output' && args[i + 1]) {
            options.output = args[i + 1];
            i++;
        }
        else if (arg === '--dry-run') {
            options.dryRun = true;
        }
    }
    return options;
}
function isValidIcelandCoordinate(lng, lat) {
    return (lng >= ICELAND_BOUNDS.minLng &&
        lng <= ICELAND_BOUNDS.maxLng &&
        lat >= ICELAND_BOUNDS.minLat &&
        lat <= ICELAND_BOUNDS.maxLat);
}
function isValidFeature(feature) {
    return (feature &&
        feature.type === 'Feature' &&
        feature.geometry &&
        feature.geometry.type === 'Point' &&
        Array.isArray(feature.geometry.coordinates) &&
        feature.geometry.coordinates.length === 2 &&
        typeof feature.geometry.coordinates[0] === 'number' &&
        typeof feature.geometry.coordinates[1] === 'number' &&
        !isNaN(feature.geometry.coordinates[0]) &&
        !isNaN(feature.geometry.coordinates[1]));
}
function getCoordinateKey(lng, lat, precision = 6) {
    return `${lng.toFixed(precision)},${lat.toFixed(precision)}`;
}
function cleanGeoJSON(geojson) {
    const stats = {
        total: geojson.features.length,
        valid: 0,
        removed: {
            duplicateCoordinates: 0,
            invalidCoordinates: 0,
            invalidFormat: 0,
        },
        fixed: {
            nullNames: 0,
        },
    };
    const cleanedFeatures = [];
    const seenCoordinates = new Set();
    const coordinateMap = new Map();
    for (const feature of geojson.features) {
        if (!isValidFeature(feature)) {
            stats.removed.invalidFormat++;
            continue;
        }
        const [lng, lat] = feature.geometry.coordinates;
        if (!isValidIcelandCoordinate(lng, lat)) {
            stats.removed.invalidCoordinates++;
            continue;
        }
        const coordKey = getCoordinateKey(lng, lat, 10);
        if (seenCoordinates.has(coordKey)) {
            stats.removed.duplicateCoordinates++;
            continue;
        }
        seenCoordinates.add(coordKey);
        let cleanedFeature = { ...feature };
        if (!cleanedFeature.properties.nafnFitju || cleanedFeature.properties.nafnFitju.trim() === '') {
            const type = cleanedFeature.properties.gerdGosgig || 'unknown';
            const fid = cleanedFeature.properties.fid || cleanedFeatures.length + 1;
            cleanedFeature.properties.nafnFitju = `未命名地点-${type}-${fid}`;
            stats.fixed.nullNames++;
        }
        cleanedFeatures.push(cleanedFeature);
        stats.valid++;
    }
    const cleaned = {
        type: 'FeatureCollection',
        name: geojson.name,
        crs: geojson.crs,
        features: cleanedFeatures,
    };
    return { cleaned, stats };
}
async function main() {
    const options = parseArgs();
    console.log('='.repeat(60));
    console.log('冰岛 POI GeoJSON 数据清洗脚本');
    console.log('='.repeat(60));
    console.log(`输入文件: ${options.input}`);
    console.log(`输出文件: ${options.output}`);
    console.log(`模式: ${options.dryRun ? '🔍 预览模式（不会保存）' : '✅ 清洗模式'}`);
    console.log('');
    try {
        const inputPath = path.resolve(process.cwd(), options.input);
        if (!fs.existsSync(inputPath)) {
            console.error(`❌ 文件不存在: ${inputPath}`);
            process.exit(1);
        }
        console.log('📖 读取 GeoJSON 文件...');
        const fileContent = fs.readFileSync(inputPath, 'utf-8');
        const geojson = JSON.parse(fileContent);
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
            console.error('❌ 无效的 GeoJSON 格式：必须是 FeatureCollection');
            process.exit(1);
        }
        console.log(`✓ 读取成功，共 ${geojson.features.length} 个 features\n`);
        console.log('🧹 开始清洗数据...');
        const { cleaned, stats } = cleanGeoJSON(geojson);
        console.log('\n' + '='.repeat(60));
        console.log('清洗结果统计');
        console.log('='.repeat(60));
        console.log(`总计: ${stats.total}`);
        console.log(`✅ 有效: ${stats.valid}`);
        console.log(`\n删除统计:`);
        console.log(`  - 格式无效: ${stats.removed.invalidFormat}`);
        console.log(`  - 坐标超出范围: ${stats.removed.invalidCoordinates}`);
        console.log(`  - 重复坐标: ${stats.removed.duplicateCoordinates}`);
        console.log(`\n修复统计:`);
        console.log(`  - 空名称修复: ${stats.fixed.nullNames}`);
        console.log(`\n保留率: ${((stats.valid / stats.total) * 100).toFixed(2)}%`);
        if (!options.dryRun) {
            const outputPath = path.resolve(process.cwd(), options.output);
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            console.log(`\n💾 保存清洗后的数据到: ${outputPath}`);
            fs.writeFileSync(outputPath, JSON.stringify(cleaned, null, 2), 'utf-8');
            console.log('✅ 保存成功！');
        }
        else {
            console.log('\n🔍 预览模式：未保存文件');
        }
        if (cleaned.features.length > 0) {
            console.log('\n📋 清洗后的数据示例（前5条）:');
            cleaned.features.slice(0, 5).forEach((f, i) => {
                const [lng, lat] = f.geometry.coordinates;
                const name = f.properties.nafnFitju || 'N/A';
                console.log(`  ${i + 1}. ${name} (${lng.toFixed(6)}, ${lat.toFixed(6)})`);
            });
        }
        console.log('\n✅ 清洗完成！');
    }
    catch (error) {
        console.error('\n❌ 清洗失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=clean-iceland-poi-geojson.js.map