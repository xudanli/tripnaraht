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
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const prisma = new client_1.PrismaClient();
function getTestCoordinatesForCountry(countryCode) {
    const testPoints = {
        CH: [
            { lat: 46.5197, lng: 6.6323, name: '日内瓦' },
            { lat: 47.3769, lng: 8.5417, name: '苏黎世' },
            { lat: 46.2044, lng: 6.1432, name: '洛桑' },
            { lat: 46.9481, lng: 7.4474, name: '伯尔尼' },
            { lat: 46.2276, lng: 6.1058, name: '蒙特勒' },
        ],
        NO: [
            { lat: 59.9139, lng: 10.7522, name: '奥斯陆' },
            { lat: 60.3913, lng: 5.3221, name: '卑尔根' },
            { lat: 63.4305, lng: 10.3951, name: '特隆赫姆' },
            { lat: 69.6492, lng: 18.9553, name: '特罗姆瑟' },
            { lat: 58.1467, lng: 7.9956, name: '克里斯蒂安桑' },
        ],
        PE: [
            { lat: -12.0464, lng: -77.0428, name: '利马' },
            { lat: -13.1631, lng: -72.5450, name: '库斯科' },
            { lat: -16.4090, lng: -71.5375, name: '阿雷基帕' },
            { lat: -8.1116, lng: -79.0288, name: '特鲁希略' },
            { lat: -3.7491, lng: -73.2532, name: '伊基托斯' },
        ],
    };
    return testPoints[countryCode] || [];
}
async function queryDEMElevation(lat, lng) {
    var _a, _b, _c, _d, _e;
    const start = Date.now();
    let elevation = null;
    try {
        const result = await prisma.$queryRawUnsafe(`
      SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
      FROM geo_dem_cities_merged
      WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      LIMIT 1;
    `);
        if (((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.elevation) !== null && ((_b = result === null || result === void 0 ? void 0 : result[0]) === null || _b === void 0 ? void 0 : _b.elevation) !== undefined) {
            elevation = parseFloat(result[0].elevation);
        }
        else {
            const globalResult = await prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_global
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);
            if (((_c = globalResult === null || globalResult === void 0 ? void 0 : globalResult[0]) === null || _c === void 0 ? void 0 : _c.elevation) !== null && ((_d = globalResult === null || globalResult === void 0 ? void 0 : globalResult[0]) === null || _d === void 0 ? void 0 : _d.elevation) !== undefined) {
                elevation = parseFloat(globalResult[0].elevation);
            }
        }
    }
    catch (error) {
        if (!((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('does not exist'))) {
            console.warn(`查询DEM失败 (${lat}, ${lng}):`, error.message);
        }
    }
    const latency = Date.now() - start;
    return { elevation, latency };
}
function calculateResolutionFromScale(scaleX, scaleY, lat) {
    const metersPerDegreeLat = 111000;
    const metersPerDegreeLng = lat
        ? 111000 * Math.cos((lat * Math.PI) / 180)
        : 111000;
    const resolutionMeters = Math.sqrt((scaleX * metersPerDegreeLng) ** 2 + (scaleY * metersPerDegreeLat) ** 2);
    const commonResolutions = [10, 30, 90, 300, 1000];
    let closestResolution = commonResolutions[0];
    let minDiff = Math.abs(resolutionMeters - closestResolution);
    for (const res of commonResolutions) {
        const diff = Math.abs(resolutionMeters - res);
        if (diff < minDiff) {
            minDiff = diff;
            closestResolution = res;
        }
    }
    if (minDiff / resolutionMeters > 0.5) {
        return `${Math.round(resolutionMeters)}m`;
    }
    return `${closestResolution}m`;
}
async function getDEMResolution() {
    var _a, _b, _c;
    try {
        const result = await prisma.$queryRawUnsafe(`
      SELECT 
        ST_ScaleX(rast) as scalex,
        ST_ScaleY(rast) as scaley,
        ST_UpperLeftY(rast) as lat
      FROM geo_dem_cities_merged 
      LIMIT 1;
    `);
        if ((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.scalex) {
            const resolution = calculateResolutionFromScale(Math.abs(result[0].scalex), Math.abs(result[0].scaley), result[0].lat);
            if (resolution !== 'unknown') {
                return resolution;
            }
        }
    }
    catch (error) {
    }
    try {
        const result = await prisma.$queryRawUnsafe(`
      SELECT 
        ST_ScaleX(rast) as scalex,
        ST_ScaleY(rast) as scaley,
        ST_UpperLeftY(rast) as lat
      FROM geo_dem_global 
      LIMIT 1;
    `);
        if ((_b = result === null || result === void 0 ? void 0 : result[0]) === null || _b === void 0 ? void 0 : _b.scalex) {
            const resolution = calculateResolutionFromScale(Math.abs(result[0].scalex), Math.abs(result[0].scaley), result[0].lat);
            if (resolution !== 'unknown') {
                return resolution;
            }
        }
    }
    catch (error) {
    }
    try {
        const result = await prisma.$queryRawUnsafe(`
      SELECT filename FROM geo_dem_cities_merged LIMIT 1;
    `);
        if ((_c = result === null || result === void 0 ? void 0 : result[0]) === null || _c === void 0 ? void 0 : _c.filename) {
            const match = result[0].filename.match(/(\d+)m/i);
            if (match) {
                return `${match[1]}m`;
            }
        }
    }
    catch (error) {
    }
    return 'unknown';
}
async function checkDEMTableExists(tableName) {
    var _a;
    try {
        const result = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '${tableName}'
      ) as exists;
    `);
        return ((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.exists) === true;
    }
    catch (error) {
        return false;
    }
}
async function assessDEMCoverage(countryCode) {
    console.log(`\n🔍 评估 ${countryCode} 的DEM数据覆盖情况...\n`);
    const citiesMergedExists = await checkDEMTableExists('geo_dem_cities_merged');
    const globalExists = await checkDEMTableExists('geo_dem_global');
    const hasDEMData = citiesMergedExists || globalExists;
    if (!hasDEMData) {
        return {
            countryCode,
            coverageRate: 0,
            resolution: 'unknown',
            querySuccessRate: 0,
            queryLatency: { p50: 0, p95: 0, p99: 0 },
            missingRegions: [{
                    region: countryCode,
                    reason: 'DEM数据表不存在',
                }],
            recommendations: [{
                    issue: 'DEM数据缺失',
                    impact: 'HIGH',
                    recommendation: `需要补充 ${countryCode} 的DEM数据（建议使用SRTM或ASTER GDEM）`,
                    priority: 'P0',
                }],
        };
    }
    const resolution = await getDEMResolution();
    const testCoordinates = getTestCoordinatesForCountry(countryCode);
    let querySuccessCount = 0;
    const latencies = [];
    console.log(`测试 ${testCoordinates.length} 个坐标点的DEM查询...`);
    for (const coord of testCoordinates) {
        const { elevation, latency } = await queryDEMElevation(coord.lat, coord.lng);
        if (elevation !== null) {
            querySuccessCount++;
            latencies.push(latency);
            console.log(`  ✅ ${coord.name} (${coord.lat}, ${coord.lng}): ${elevation}m, ${latency}ms`);
        }
        else {
            console.log(`  ❌ ${coord.name} (${coord.lat}, ${coord.lng}): 查询失败`);
        }
    }
    const querySuccessRate = testCoordinates.length > 0
        ? querySuccessCount / testCoordinates.length
        : 0;
    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
    const coverageRate = querySuccessRate;
    const missingRegions = [];
    if (coverageRate < 0.9) {
        missingRegions.push({
            region: countryCode,
            reason: `DEM数据存在但覆盖率不足 (${(coverageRate * 100).toFixed(1)}%)`,
        });
    }
    const recommendations = [];
    if (coverageRate < 0.9) {
        recommendations.push({
            issue: 'DEM数据覆盖率不足',
            impact: 'HIGH',
            recommendation: `需要补充缺失区域的DEM数据，当前覆盖率: ${(coverageRate * 100).toFixed(1)}%`,
            priority: 'P0',
        });
    }
    if (p95 > 500) {
        recommendations.push({
            issue: 'DEM查询性能较差',
            impact: 'MEDIUM',
            recommendation: `P95查询延迟 ${p95}ms，超过目标500ms，建议优化PostGIS查询或增加缓存`,
            priority: 'P1',
        });
    }
    if (resolution === 'unknown') {
        recommendations.push({
            issue: 'DEM分辨率未知',
            impact: 'LOW',
            recommendation: '无法确定DEM数据分辨率，建议在数据导入时记录分辨率信息',
            priority: 'P2',
        });
    }
    return {
        countryCode,
        coverageRate,
        resolution,
        querySuccessRate,
        queryLatency: { p50, p95, p99 },
        missingRegions,
        recommendations,
    };
}
async function main() {
    const args = process.argv.slice(2);
    const countries = args.length > 0 ? args : ['CH', 'NO', 'PE'];
    console.log('🚀 DEM数据覆盖评估开始\n');
    console.log(`评估国家: ${countries.join(', ')}\n`);
    const assessments = [];
    for (const countryCode of countries) {
        try {
            const assessment = await assessDEMCoverage(countryCode);
            assessments.push(assessment);
            console.log(`\n📊 ${countryCode} DEM数据评估结果:`);
            console.log(`  覆盖率: ${(assessment.coverageRate * 100).toFixed(1)}%`);
            console.log(`  分辨率: ${assessment.resolution}`);
            console.log(`  查询成功率: ${(assessment.querySuccessRate * 100).toFixed(1)}%`);
            console.log(`  查询延迟: P50=${assessment.queryLatency.p50}ms, P95=${assessment.queryLatency.p95}ms, P99=${assessment.queryLatency.p99}ms`);
            console.log(`  缺失区域: ${assessment.missingRegions.length} 个`);
            console.log(`  建议数量: ${assessment.recommendations.length} 个`);
            if (assessment.recommendations.length > 0) {
                console.log(`\n  建议:`);
                assessment.recommendations.forEach((rec, idx) => {
                    console.log(`    ${idx + 1}. [${rec.priority}] ${rec.issue}: ${rec.recommendation}`);
                });
            }
        }
        catch (error) {
            console.error(`\n❌ 评估 ${countryCode} 失败:`, error.message);
            console.error(error.stack);
        }
    }
    const outputPath = path.join(process.cwd(), 'scripts', 'dem-coverage-assessment.json');
    await fs.writeFile(outputPath, JSON.stringify(assessments, null, 2), 'utf-8');
    console.log(`\n✅ 评估完成，结果已保存到: ${outputPath}`);
    await prisma.$disconnect();
}
main().catch((error) => {
    console.error('❌ 评估失败:', error);
    process.exit(1);
});
//# sourceMappingURL=assess-dem-coverage.js.map