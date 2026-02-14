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
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
class SimpleEmbeddingService {
    constructor() {
        this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
        this.httpClient = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            proxy: false,
            httpsAgent: new https_1.default.Agent({
                keepAlive: true,
                family: 4,
            }),
        });
    }
    async generateEmbeddingsBatch(texts, batchSize = 10) {
        const results = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            try {
                const response = await this.httpClient.post('/api/v1/embeddings', {
                    texts: batch,
                    model: 'bge-m3',
                    return_sparse: false,
                });
                if (response.data && response.data.embeddings) {
                    const embeddings = response.data.embeddings.map((e) => e.dense || e);
                    results.push(...embeddings);
                }
                else {
                    throw new Error('批量embedding返回格式错误');
                }
            }
            catch (error) {
                console.error(`  ⚠️  批次 ${i}-${i + batch.length} 向量化失败:`, error.message);
                batch.forEach(() => {
                    const zeroVector = new Array(1024).fill(0);
                    results.push(zeroVector);
                });
            }
            if (i + batchSize < texts.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        return results;
    }
}
const embeddingService = new SimpleEmbeddingService();
function detectDataType(filepath) {
    const filename = path.basename(filepath);
    const dirname = path.dirname(filepath);
    let type = 'unknown';
    if (filepath.includes('road-status'))
        type = 'road_status';
    else if (filepath.includes('ferry-schedules'))
        type = 'ferry_schedules';
    else if (filepath.includes('weather-windows'))
        type = 'weather_windows';
    let region = 'unknown';
    const knownRegions = [
        'iceland', 'greenland', 'svalbard', 'faroe', 'faroe-islands',
        'alps', 'argentina', 'lofoten', 'lofoten-islands',
        'new-zealand', 'new-zealand-south-island'
    ];
    const sortedRegions = knownRegions.sort((a, b) => b.length - a.length);
    for (const reg of sortedRegions) {
        if (filename.toLowerCase().includes(reg.toLowerCase())) {
            region = reg.toLowerCase();
            if (region === 'faroe-islands')
                region = 'faroe';
            else if (region === 'lofoten-islands')
                region = 'lofoten';
            else if (region === 'new-zealand-south-island')
                region = 'new-zealand-south-island';
            break;
        }
    }
    if (region === 'unknown') {
        const pathParts = dirname.split(path.sep);
        for (const reg of sortedRegions) {
            const foundPart = pathParts.find(p => p.toLowerCase().includes(reg.toLowerCase()));
            if (foundPart) {
                region = reg.toLowerCase();
                if (region === 'faroe-islands')
                    region = 'faroe';
                else if (region === 'lofoten-islands')
                    region = 'lofoten';
                else if (region === 'new-zealand-south-island')
                    region = 'new-zealand-south-island';
                break;
            }
        }
    }
    if (region === 'unknown') {
        region = 'iceland';
    }
    return { type, region };
}
function extractKeywords(data, type) {
    var _a;
    const keywords = [];
    if (type === 'road_status') {
        if (data.roadId)
            keywords.push(data.roadId);
        if (data.roadName)
            keywords.push(data.roadName);
        if (data.roadNameEN)
            keywords.push(data.roadNameEN);
        keywords.push('道路状态', 'road status', 'F-road');
        if (data.requirements) {
            if (data.requirements.vehicleType) {
                keywords.push(data.requirements.vehicleType);
                if (data.requirements.vehicleType === '4x4_required') {
                    keywords.push('4x4', '四驱', '四轮驱动', '需要4x4', '必须4x4', '4x4车辆', '4x4 required');
                }
            }
            if (data.requirements.clearance)
                keywords.push(data.requirements.clearance);
            if (data.requirements.experience)
                keywords.push(data.requirements.experience);
            if (data.requirements.notes) {
                const notes = data.requirements.notes.toLowerCase();
                if (notes.includes('4x4'))
                    keywords.push('4x4', '四驱');
                if (notes.includes('车辆'))
                    keywords.push('车辆', 'vehicle');
            }
        }
        if (data.status)
            keywords.push(data.status, data.status === 'seasonal' ? '季节性' : '');
        if ((_a = data.season) === null || _a === void 0 ? void 0 : _a.openPeriod)
            keywords.push(data.season.openPeriod);
    }
    else if (type === 'ferry_schedules') {
        if (data.routeId)
            keywords.push(data.routeId);
        if (data.routeName)
            keywords.push(data.routeName);
        if (data.routeNameEN)
            keywords.push(data.routeNameEN);
        keywords.push('渡轮', 'ferry', '时刻表', 'schedule');
        if (data.booking) {
            if (data.booking.required)
                keywords.push('需要预订', 'booking required');
            if (data.booking.recommended)
                keywords.push('建议预订', 'booking recommended');
        }
    }
    else if (type === 'weather_windows') {
        if (data.regionId)
            keywords.push(data.regionId);
        if (data.regionName)
            keywords.push(data.regionName);
        if (data.regionNameEN)
            keywords.push(data.regionNameEN);
        keywords.push('天气', 'weather', '最佳旅行时间', 'best travel time', '天气窗口', 'weather window');
        if (data.bestWindows) {
            data.bestWindows.forEach((w) => {
                if (w.period)
                    keywords.push(w.period);
                if (w.description)
                    keywords.push(w.description);
            });
        }
    }
    return [...new Set(keywords)];
}
function createChunkContent(data, type) {
    var _a;
    let content = '';
    if (type === 'road_status') {
        content = `道路ID: ${data.roadId}\n`;
        content += `道路名称: ${data.roadName || data.roadNameEN || data.roadId}\n`;
        if (data.roadNameEN && data.roadName !== data.roadNameEN) {
            content += `道路名称（英文）: ${data.roadNameEN}\n`;
        }
        if (data.status)
            content += `状态: ${data.status}\n`;
        if (data.currentStatus)
            content += `当前状态: ${data.currentStatus}\n`;
        if (data.season) {
            content += `开放季节: ${data.season.openPeriod || ((_a = data.season.openMonths) === null || _a === void 0 ? void 0 : _a.join(','))}\n`;
            if (data.season.typicalOpenDate)
                content += `通常开放时间: ${data.season.typicalOpenDate}\n`;
            if (data.season.typicalCloseDate)
                content += `通常关闭时间: ${data.season.typicalCloseDate}\n`;
        }
        if (data.requirements) {
            content += `车辆要求:\n`;
            if (data.requirements.vehicleType) {
                content += `  车辆类型: ${data.requirements.vehicleType}\n`;
                if (data.requirements.vehicleType === '4x4_required') {
                    content += `  需要4x4车辆: 是\n`;
                    content += `  必须4x4: 是\n`;
                }
            }
            if (data.requirements.clearance)
                content += `  离地间隙: ${data.requirements.clearance}\n`;
            if (data.requirements.experience)
                content += `  驾驶经验: ${data.requirements.experience}\n`;
            if (data.requirements.notes)
                content += `  备注: ${data.requirements.notes}\n`;
        }
        if (data.hazards && data.hazards.length > 0) {
            content += `危险:\n`;
            data.hazards.forEach((h) => {
                content += `  ${h.type}: ${h.description || h.severity}\n`;
            });
        }
    }
    else if (type === 'ferry_schedules') {
        content = `路线ID: ${data.routeId}\n`;
        content += `路线名称: ${data.routeName || data.routeNameEN || data.routeId}\n`;
        if (data.routeNameEN && data.routeName !== data.routeNameEN) {
            content += `路线名称（英文）: ${data.routeNameEN}\n`;
        }
        if (data.from) {
            content += `出发港口: ${data.from.name}\n`;
            if (data.from.nameEN)
                content += `出发港口（英文）: ${data.from.nameEN}\n`;
        }
        if (data.to) {
            content += `到达港口: ${data.to.name}\n`;
            if (data.to.nameEN)
                content += `到达港口（英文）: ${data.to.nameEN}\n`;
        }
        if (data.schedule) {
            if (data.schedule.summer) {
                content += `夏季时刻表: ${data.schedule.summer.period}\n`;
                if (data.schedule.summer.frequency)
                    content += `班次频率: ${data.schedule.summer.frequency}\n`;
            }
            if (data.schedule.winter) {
                content += `冬季时刻表: ${data.schedule.winter.period}\n`;
                if (data.schedule.winter.frequency)
                    content += `班次频率: ${data.schedule.winter.frequency}\n`;
            }
        }
        if (data.booking) {
            content += `预订要求:\n`;
            if (data.booking.required)
                content += `  需要预订: 是\n`;
            if (data.booking.recommended)
                content += `  建议预订: 是\n`;
            if (data.booking.advanceBooking)
                content += `  提前预订: ${data.booking.advanceBooking}\n`;
        }
    }
    else if (type === 'weather_windows') {
        content = `区域ID: ${data.regionId}\n`;
        content += `区域名称: ${data.regionName || data.regionNameEN || data.regionId}\n`;
        if (data.regionNameEN && data.regionName !== data.regionNameEN) {
            content += `区域名称（英文）: ${data.regionNameEN}\n`;
        }
        if (data.bestWindows) {
            content += `最佳旅行窗口:\n`;
            data.bestWindows.forEach((w) => {
                var _a;
                content += `  ${w.period || ((_a = w.months) === null || _a === void 0 ? void 0 : _a.join(','))}: ${w.description}\n`;
                if (w.temperature)
                    content += `    温度: ${w.temperature.avg}°C\n`;
                if (w.precipitation)
                    content += `    降雨: ${w.precipitation.avg}mm/月\n`;
            });
        }
        if (data.weatherPatterns) {
            content += `天气模式:\n`;
            Object.keys(data.weatherPatterns).forEach(season => {
                const pattern = data.weatherPatterns[season];
                content += `  ${season}: ${pattern.description}\n`;
            });
        }
        if (data.riskLevels && data.riskLevels.length > 0) {
            content += `风险等级:\n`;
            data.riskLevels.forEach((r) => {
                content += `  ${r.month}月: ${r.riskLevel}\n`;
                if (r.risks)
                    content += `    风险: ${r.risks.join(', ')}\n`;
            });
        }
        if (data.extremeEvents && data.extremeEvents.length > 0) {
            content += `极端天气事件:\n`;
            data.extremeEvents.forEach((e) => {
                content += `  ${e.type}: ${e.description}\n`;
                if (e.typicalMonths)
                    content += `    常见月份: ${e.typicalMonths.join(', ')}\n`;
            });
        }
    }
    return content.trim();
}
function chunkPhysicalRealityData(data, type) {
    const chunks = [];
    const metadata = data.metadata || {};
    if (type === 'road_status' && data.roads) {
        data.roads.forEach((road) => {
            chunks.push({
                content: createChunkContent(road, type),
                keywords: extractKeywords(road, type),
                metadata: { ...metadata, roadId: road.roadId }
            });
        });
    }
    else if (type === 'ferry_schedules' && data.routes) {
        data.routes.forEach((route) => {
            chunks.push({
                content: createChunkContent(route, type),
                keywords: extractKeywords(route, type),
                metadata: { ...metadata, routeId: route.routeId }
            });
        });
    }
    else if (type === 'weather_windows' && data.regions) {
        data.regions.forEach((region) => {
            chunks.push({
                content: createChunkContent(region, type),
                keywords: extractKeywords(region, type),
                metadata: { ...metadata, regionId: region.regionId }
            });
        });
    }
    return chunks;
}
function loadPhysicalRealityFiles(dirPath) {
    const files = [];
    if (!fs.existsSync(dirPath)) {
        return files;
    }
    function scanDir(currentPath) {
        const items = fs.readdirSync(currentPath);
        items.forEach(item => {
            const itemPath = path.join(currentPath, item);
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory() && !item.includes('template')) {
                scanDir(itemPath);
            }
            else if (item.endsWith('.json') && !item.includes('template')) {
                files.push({ path: itemPath, filename: item });
            }
        });
    }
    scanDir(dirPath);
    return files;
}
async function indexPhysicalRealityData() {
    try {
        console.log('🚀 开始索引 Physical Reality 数据...\n');
        const dataDir = path.join(process.cwd(), 'data', 'physical-reality');
        const files = loadPhysicalRealityFiles(dataDir);
        if (files.length === 0) {
            console.log('⚠️  未找到任何数据文件');
            return;
        }
        console.log(`📁 找到 ${files.length} 个数据文件\n`);
        let totalChunks = 0;
        let successCount = 0;
        let failCount = 0;
        for (const file of files) {
            try {
                console.log(`\n📄 处理文件: ${file.filename}`);
                const fileContent = fs.readFileSync(file.path, 'utf-8');
                const data = JSON.parse(fileContent);
                const { type, region } = detectDataType(file.path);
                console.log(`   类型: ${type}, 区域: ${region}`);
                const chunks = chunkPhysicalRealityData(data, type);
                console.log(`   生成 ${chunks.length} 个chunks`);
                if (chunks.length === 0) {
                    failCount++;
                    continue;
                }
                const metadata = data.metadata || {};
                const filename = `${region}-${type}-${path.basename(file.filename, '.json')}`;
                const existingFile = await prisma.knowledgeFile.findUnique({
                    where: { filename },
                });
                if (existingFile) {
                    console.log(`   🔄 文件已存在，删除旧chunks...`);
                    await prisma.chunk.deleteMany({
                        where: { fileId: existingFile.id },
                    });
                }
                const knowledgeFile = await prisma.knowledgeFile.upsert({
                    where: { filename },
                    create: {
                        filename,
                        filepath: file.path,
                        category: type,
                        version: metadata.version || '1.0.0',
                        language: metadata.language || 'zh-CN',
                        credibilityScore: 0.95,
                        dataSources: metadata.dataSource ? [metadata.dataSource] : [],
                        lastUpdated: metadata.lastUpdated ? new Date(metadata.lastUpdated) : new Date(),
                    },
                    update: {
                        filepath: file.path,
                        version: metadata.version || '1.0.0',
                        lastUpdated: metadata.lastUpdated ? new Date(metadata.lastUpdated) : new Date(),
                    },
                });
                console.log(`   ✅ 文件记录: ${knowledgeFile.id}`);
                const contents = chunks.map(c => c.content);
                console.log(`   🔄 生成embeddings...`);
                const embeddings = await embeddingService.generateEmbeddingsBatch(contents);
                console.log(`   💾 插入chunks...`);
                const fileId = knowledgeFile.id;
                const values = chunks.map((chunk, idx) => {
                    const embedding = embeddings[idx];
                    const embeddingStr = `[${embedding.join(',')}]`;
                    const contentEscaped = chunk.content.replace(/'/g, "''").substring(0, 50000);
                    const keywordsStr = chunk.keywords.map(k => `'${k.replace(/'/g, "''")}'`).join(',');
                    const metadataStr = JSON.stringify(chunk.metadata || {}).replace(/'/g, "''");
                    const chunkId = `${filename}_${idx + 1}`;
                    return `(
            gen_random_uuid(),
            '${chunkId.replace(/'/g, "''")}',
            '${contentEscaped}',
            '${embeddingStr}'::vector(1024),
            '${type}',
            NULL,
            ${0.95},
            ARRAY[${keywordsStr}],
            '${fileId}'::uuid,
            '${metadataStr}'::jsonb,
            NOW(),
            NOW()
          )`;
                }).join(',');
                await prisma.$executeRawUnsafe(`
          INSERT INTO chunks (
            id, chunk_id, content, embedding, type, section, credibility_score, keywords, file_id, metadata, created_at, updated_at
          ) VALUES ${values}
          ON CONFLICT (chunk_id) DO UPDATE SET
            content = EXCLUDED.content,
            keywords = EXCLUDED.keywords,
            credibility_score = EXCLUDED.credibility_score,
            metadata = EXCLUDED.metadata,
            embedding = EXCLUDED.embedding,
            type = EXCLUDED.type
        `);
                totalChunks += chunks.length;
                successCount++;
                console.log(`   ✅ 完成: ${chunks.length} 个chunks已索引`);
            }
            catch (error) {
                console.error(`   ❌ 处理失败: ${error.message}`);
                failCount++;
            }
        }
        console.log(`\n\n📊 索引完成统计:`);
        console.log(`   总文件数: ${files.length}`);
        console.log(`   成功: ${successCount}`);
        console.log(`   失败: ${failCount}`);
        console.log(`   总chunks: ${totalChunks}`);
    }
    catch (error) {
        console.error('❌ 索引过程出错:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
indexPhysicalRealityData().catch(console.error);
//# sourceMappingURL=index-physical-reality-data.js.map