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
function getCountryBounds(countryCode) {
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
async function checkTableExists(tableName) {
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
async function assessFeatureCoverage(tableName, countryCode, countryBounds) {
    var _a, _b;
    try {
        const tableExists = await checkTableExists(tableName);
        if (!tableExists) {
            return {
                coverageRate: 0,
                featureCount: 0,
                missingRegions: [countryCode],
            };
        }
        const countResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM ${tableName}
      WHERE ST_Intersects(
        geom,
        ST_MakeEnvelope(
          ${countryBounds.minLng}, ${countryBounds.minLat},
          ${countryBounds.maxLng}, ${countryBounds.maxLat},
          4326
        )
      );
    `);
        const featureCount = parseInt(((_a = countResult === null || countResult === void 0 ? void 0 : countResult[0]) === null || _a === void 0 ? void 0 : _a.count) || '0');
        const coverageRate = featureCount > 0 ? 1.0 : 0;
        return {
            coverageRate,
            featureCount,
            missingRegions: coverageRate < 0.9 ? [countryCode] : [],
        };
    }
    catch (error) {
        if ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('does not exist')) {
            return {
                coverageRate: 0,
                featureCount: 0,
                missingRegions: [countryCode],
            };
        }
        console.warn(`评估表 ${tableName} 失败:`, error.message);
        return {
            coverageRate: 0,
            featureCount: 0,
            missingRegions: [countryCode],
        };
    }
}
async function assessGeographicFeaturesCoverage(countryCode) {
    console.log(`\n🔍 评估 ${countryCode} 的地理特征数据覆盖情况...\n`);
    const countryBounds = getCountryBounds(countryCode);
    if (!countryBounds) {
        throw new Error(`未知国家代码: ${countryCode}`);
    }
    console.log('评估各类型地理特征数据...');
    const rivers = await assessFeatureCoverage('geo_rivers_line', countryCode, countryBounds);
    console.log(`  河流: ${rivers.featureCount} 条, 覆盖率: ${(rivers.coverageRate * 100).toFixed(1)}%`);
    const mountains = await assessFeatureCoverage('geo_mountains_standard', countryCode, countryBounds);
    console.log(`  山脉: ${mountains.featureCount} 个, 覆盖率: ${(mountains.coverageRate * 100).toFixed(1)}%`);
    const roads = await assessFeatureCoverage('geo_roads', countryCode, countryBounds);
    console.log(`  道路: ${roads.featureCount} 条, 覆盖率: ${(roads.coverageRate * 100).toFixed(1)}%`);
    const coastlines = await assessFeatureCoverage('geo_coastlines', countryCode, countryBounds);
    console.log(`  海岸线: ${coastlines.featureCount} 条, 覆盖率: ${(coastlines.coverageRate * 100).toFixed(1)}%`);
    const ports = await assessFeatureCoverage('geo_ports', countryCode, countryBounds);
    console.log(`  港口: ${ports.featureCount} 个, 覆盖率: ${(ports.coverageRate * 100).toFixed(1)}%`);
    const railways = await assessFeatureCoverage('geo_railways', countryCode, countryBounds);
    console.log(`  铁路: ${railways.featureCount} 条, 覆盖率: ${(railways.coverageRate * 100).toFixed(1)}%`);
    const recommendations = [];
    if (rivers.coverageRate < 0.9) {
        recommendations.push({
            issue: '河流数据覆盖率不足',
            impact: 'MEDIUM',
            recommendation: `需要补充 ${countryCode} 的河流数据，当前覆盖率: ${(rivers.coverageRate * 100).toFixed(1)}%`,
            priority: 'P1',
        });
    }
    if (mountains.coverageRate < 0.9) {
        recommendations.push({
            issue: '山脉数据覆盖率不足',
            impact: 'MEDIUM',
            recommendation: `需要补充 ${countryCode} 的山脉数据，当前覆盖率: ${(mountains.coverageRate * 100).toFixed(1)}%`,
            priority: 'P1',
        });
    }
    if (roads.coverageRate < 0.9) {
        recommendations.push({
            issue: '道路数据覆盖率不足',
            impact: 'HIGH',
            recommendation: `需要补充 ${countryCode} 的道路数据，当前覆盖率: ${(roads.coverageRate * 100).toFixed(1)}%`,
            priority: 'P0',
        });
    }
    if (coastlines.coverageRate < 0.9 && ['NO', 'PE', 'IS', 'GL', 'FO', 'NZ'].includes(countryCode)) {
        recommendations.push({
            issue: '海岸线数据覆盖率不足',
            impact: 'MEDIUM',
            recommendation: `需要补充 ${countryCode} 的海岸线数据，当前覆盖率: ${(coastlines.coverageRate * 100).toFixed(1)}%`,
            priority: 'P1',
        });
    }
    if (ports.coverageRate < 0.9 && ['NO', 'PE', 'IS', 'GL', 'FO', 'NZ'].includes(countryCode)) {
        recommendations.push({
            issue: '港口数据覆盖率不足',
            impact: 'MEDIUM',
            recommendation: `需要补充 ${countryCode} 的港口数据，当前覆盖率: ${(ports.coverageRate * 100).toFixed(1)}%`,
            priority: 'P1',
        });
    }
    if (railways.coverageRate < 0.9) {
        recommendations.push({
            issue: '铁路数据覆盖率不足',
            impact: 'LOW',
            recommendation: `需要补充 ${countryCode} 的铁路数据，当前覆盖率: ${(railways.coverageRate * 100).toFixed(1)}%`,
            priority: 'P2',
        });
    }
    return {
        countryCode,
        rivers,
        mountains,
        roads,
        coastlines,
        ports,
        railways,
        recommendations,
    };
}
async function main() {
    const args = process.argv.slice(2);
    const countries = args.length > 0 ? args : ['CH', 'NO', 'PE'];
    console.log('🚀 地理特征数据覆盖评估开始\n');
    console.log(`评估国家: ${countries.join(', ')}\n`);
    const assessments = [];
    for (const countryCode of countries) {
        try {
            const assessment = await assessGeographicFeaturesCoverage(countryCode);
            assessments.push(assessment);
            console.log(`\n📊 ${countryCode} 地理特征数据评估结果:`);
            console.log(`  河流: ${(assessment.rivers.coverageRate * 100).toFixed(1)}% (${assessment.rivers.featureCount} 条)`);
            console.log(`  山脉: ${(assessment.mountains.coverageRate * 100).toFixed(1)}% (${assessment.mountains.featureCount} 个)`);
            console.log(`  道路: ${(assessment.roads.coverageRate * 100).toFixed(1)}% (${assessment.roads.featureCount} 条)`);
            console.log(`  海岸线: ${(assessment.coastlines.coverageRate * 100).toFixed(1)}% (${assessment.coastlines.featureCount} 条)`);
            console.log(`  港口: ${(assessment.ports.coverageRate * 100).toFixed(1)}% (${assessment.ports.featureCount} 个)`);
            console.log(`  铁路: ${(assessment.railways.coverageRate * 100).toFixed(1)}% (${assessment.railways.featureCount} 条)`);
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
    const outputPath = path.join(process.cwd(), 'scripts', 'geographic-features-coverage-assessment.json');
    await fs.writeFile(outputPath, JSON.stringify(assessments, null, 2), 'utf-8');
    console.log(`\n✅ 评估完成，结果已保存到: ${outputPath}`);
    await prisma.$disconnect();
}
main().catch((error) => {
    console.error('❌ 评估失败:', error);
    process.exit(1);
});
//# sourceMappingURL=assess-geographic-features-coverage.js.map