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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RouteDifficultyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDifficultyService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
let RouteDifficultyService = RouteDifficultyService_1 = class RouteDifficultyService {
    constructor(prisma, configService) {
        this.prisma = prisma;
        this.configService = configService;
        this.logger = new common_1.Logger(RouteDifficultyService_1.name);
        this.cache = new Map();
        this.cacheTTL = 3600 * 1000;
        this.pythonScriptPath = path.join(process.cwd(), 'tools', 'end2end_difficulty_with_geojson.py');
    }
    parseDistanceString(distanceStr) {
        if (!distanceStr)
            return null;
        const cleaned = distanceStr.replace(/,/g, '').trim();
        const match = cleaned.match(/([\d.]+)\s*(km|m|mi|mile)/i);
        if (!match)
            return null;
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 'km')
            return value;
        if (unit === 'm')
            return value / 1000;
        if (unit === 'mi' || unit === 'mile')
            return value * 1.60934;
        return null;
    }
    parseElevationGainString(elevationStr) {
        if (!elevationStr)
            return null;
        const cleaned = elevationStr.replace(/,/g, '').trim();
        const match = cleaned.match(/([\d.]+)\s*(m|ft|feet)/i);
        if (!match)
            return null;
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 'm')
            return value;
        if (unit === 'ft' || unit === 'feet')
            return value * 0.3048;
        return null;
    }
    async calculateFromPlaceData(placeId, request) {
        try {
            const place = await this.prisma.place.findUnique({
                where: { id: placeId },
                select: {
                    id: true,
                    nameCN: true,
                    nameEN: true,
                    metadata: true,
                    physicalMetadata: true,
                },
            });
            if (!place) {
                this.logger.warn(`Place ID ${placeId} not found`);
                return null;
            }
            const metadata = place.metadata || {};
            const physicalMetadata = place.physicalMetadata || {};
            const hasLength = metadata.length || physicalMetadata.totalDistance;
            const hasElevationGain = metadata.elevationGain || physicalMetadata.elevationGain;
            const hasDifficultyMetadata = metadata.difficultyMetadata;
            if (!hasLength || !hasElevationGain) {
                this.logger.debug(`Place ID ${placeId} missing required data (length or elevationGain)`);
                return null;
            }
            let distance_km = null;
            if (metadata.length) {
                distance_km = this.parseDistanceString(metadata.length);
            }
            if (!distance_km && physicalMetadata.totalDistance) {
                distance_km = typeof physicalMetadata.totalDistance === 'number'
                    ? physicalMetadata.totalDistance
                    : null;
            }
            let elevation_gain_m = null;
            if (metadata.elevationGain) {
                elevation_gain_m = this.parseElevationGainString(metadata.elevationGain);
            }
            if (!elevation_gain_m && physicalMetadata.elevationGain) {
                elevation_gain_m = typeof physicalMetadata.elevationGain === 'number'
                    ? physicalMetadata.elevationGain
                    : null;
            }
            if (!distance_km || !elevation_gain_m) {
                this.logger.debug(`Place ID ${placeId} failed to parse distance or elevation gain`);
                return null;
            }
            const slope_avg = distance_km > 0
                ? elevation_gain_m / (distance_km * 1000)
                : 0;
            const inputData = {
                category: request.category || 'ATTRACTION',
                accessType: metadata.accessType || request.accessType || 'HIKING',
                visitDuration: metadata.visitDuration || request.visitDuration,
                typicalStay: metadata.typicalStay || request.typicalStay,
                elevationMeters: metadata.elevationMeters || request.elevationMeters,
                latitude: request.latitude,
                subCategory: metadata.subCategory || request.subCategory,
                trailDifficulty: (hasDifficultyMetadata === null || hasDifficultyMetadata === void 0 ? void 0 : hasDifficultyMetadata.level) || request.trailDifficulty,
                hasAcclimatization: request.hasAcclimatization,
                avgSleepElevation: request.avgSleepElevation,
                exposureHours: request.exposureHours,
                feelsLikeTemp: request.feelsLikeTemp,
                coldDurationHours: request.coldDurationHours,
                loadWeightKg: request.loadWeightKg,
            };
            const result = await this.estimateDifficultyFromData(inputData, distance_km, elevation_gain_m, metadata.elevationMeters || request.elevationMeters, slope_avg);
            this.logger.debug(`Calculated difficulty from Place ID ${placeId} data`);
            return result;
        }
        catch (error) {
            this.logger.warn(`Failed to calculate from Place data: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
            return null;
        }
    }
    async estimateDifficultyFromData(inputData, distance_km, elevation_gain_m, elevationMeters, slope_avg) {
        const inputDataJson = JSON.stringify(inputData).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const pythonCode = `
import sys
import json
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.trail_difficulty import DifficultyEstimator

input_data_str = '${inputDataJson}'
input_data = json.loads(input_data_str)
distance_km = ${distance_km}
gain_m = ${elevation_gain_m}
max_elev_m = ${elevationMeters !== undefined ? elevationMeters : 'None'}
slope_avg = ${slope_avg}

label, S_km, notes = DifficultyEstimator.estimate_difficulty(
    input_data,
    distance_km=distance_km,
    gain_m=gain_m,
    max_elev_m=max_elev_m,
    slope_avg=slope_avg,
)

result = {
    "distance_km": round(distance_km, 3),
    "elevation_gain_m": round(gain_m, 1),
    "slope_avg": round(slope_avg, 4),
    "label": label.value,
    "S_km": S_km,
    "notes": notes,
}

print(json.dumps(result, ensure_ascii=False))
`;
        try {
            const { stdout } = await execFileAsync('python3', ['-c', pythonCode], {
                cwd: process.cwd(),
                timeout: 10000,
                maxBuffer: 1024 * 1024,
            });
            const result = JSON.parse(stdout.trim());
            return this.mapToResponseDto(result, false, false);
        }
        catch (error) {
            this.logger.error(`Failed to estimate difficulty: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
            throw error;
        }
    }
    async calculateDifficulty(request) {
        if (request.placeId) {
            const placeResult = await this.calculateFromPlaceData(request.placeId, request);
            if (placeResult) {
                this.logger.debug(`Using Place ID ${request.placeId} data for difficulty calculation`);
                return placeResult;
            }
            this.logger.debug(`Place ID ${request.placeId} data incomplete, falling back to route calculation`);
        }
        const cacheKey = this.generateCacheKey(request);
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            this.logger.debug(`Cache hit for key: ${cacheKey}`);
            const result = { ...cached.result };
            if (!request.includeGeoJson) {
                delete result.geojson;
            }
            if (!request.includeGpx) {
                delete result.gpx;
            }
            return result;
        }
        this.validateApiKeys(request.provider);
        try {
            const result = await this.callPythonScript(request);
            const resultToCache = { ...result };
            if (!request.includeGeoJson) {
                delete resultToCache.geojson;
            }
            if (!request.includeGpx) {
                delete resultToCache.gpx;
            }
            this.cache.set(cacheKey, {
                result: resultToCache,
                timestamp: Date.now(),
            });
            this.cleanExpiredCache();
            return result;
        }
        catch (error) {
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || String(error);
            const errorStack = error === null || error === void 0 ? void 0 : error.stack;
            this.logger.error(`Failed to calculate difficulty: ${errorMessage}`, errorStack);
            throw new common_1.ServiceUnavailableException(`路线难度计算失败: ${errorMessage}`);
        }
    }
    async callPythonScript(request) {
        var _a, _b, _c, _d, _e, _f, _g;
        const args = this.buildPythonArgs(request);
        this.logger.debug(`Calling Python script: ${this.pythonScriptPath} ${args.join(' ')}`);
        try {
            const env = { ...process.env };
            if (request.provider === 'google') {
                const apiKey = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GOOGLE_MAPS_API_KEY')) ||
                    ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('GOOGLE_ROUTES_API_KEY')) ||
                    ((_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('GOOGLE_PLACES_API_KEY'));
                if (apiKey) {
                    env.GOOGLE_MAPS_API_KEY = apiKey;
                }
            }
            else {
                const accessToken = ((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('MAPBOX_ACCESS_TOKEN')) ||
                    ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('VITE_MAPBOX_ACCESS_TOKEN'));
                if (accessToken) {
                    env.MAPBOX_ACCESS_TOKEN = accessToken;
                }
            }
            const { stdout, stderr } = await execFileAsync('python3', [this.pythonScriptPath, ...args], {
                env,
                timeout: 60000,
                maxBuffer: 10 * 1024 * 1024,
            });
            if (stderr) {
                this.logger.warn(`Python script stderr: ${stderr}`);
                if (stderr.includes('ModuleNotFoundError') || stderr.includes('No module named')) {
                    const missingModule = ((_f = stderr.match(/No module named ['"]([^'"]+)['"]/)) === null || _f === void 0 ? void 0 : _f[1]) || 'unknown';
                    throw new common_1.ServiceUnavailableException(`Python依赖缺失: 缺少模块 '${missingModule}'。请运行: pip install requests pillow`);
                }
            }
            const lines = stdout.split('\n').filter(line => line.trim());
            let jsonLine = '';
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (line.startsWith('{')) {
                    try {
                        JSON.parse(line);
                        jsonLine = line;
                        break;
                    }
                    catch (e) {
                        continue;
                    }
                }
            }
            if (!jsonLine) {
                const cleaned = stdout.trim().split('\n').filter(l => l.trim()).join('\n');
                try {
                    jsonLine = cleaned;
                }
                catch (e) {
                    this.logger.error(`Failed to parse JSON from stdout: ${stdout}`);
                    throw new Error('无法从Python脚本输出中解析JSON');
                }
            }
            const result = JSON.parse(jsonLine);
            return this.mapToResponseDto(result, request.includeGeoJson, request.includeGpx);
        }
        catch (error) {
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || String(error);
            if (errorMessage.includes('ModuleNotFoundError') || errorMessage.includes('No module named')) {
                const missingModule = ((_g = errorMessage.match(/No module named ['"]([^'"]+)['"]/)) === null || _g === void 0 ? void 0 : _g[1]) || 'unknown';
                throw new common_1.ServiceUnavailableException(`Python依赖缺失: 缺少模块 '${missingModule}'。请运行: pip install requests pillow`);
            }
            if ((error === null || error === void 0 ? void 0 : error.code) === 'ETIMEDOUT') {
                throw new common_1.ServiceUnavailableException('Python脚本执行超时（60秒）');
            }
            throw error;
        }
    }
    buildPythonArgs(request) {
        const args = [
            '--provider',
            request.provider,
            '--origin',
            request.origin,
            '--destination',
            request.destination,
        ];
        if (request.profile) {
            args.push('--profile', request.profile);
        }
        if (request.sampleM) {
            args.push('--sample-m', request.sampleM.toString());
        }
        if (request.category) {
            args.push('--category', request.category);
        }
        if (request.accessType) {
            args.push('--accessType', request.accessType);
        }
        if (request.visitDuration) {
            args.push('--visitDuration', request.visitDuration);
        }
        if (request.typicalStay) {
            args.push('--typicalStay', request.typicalStay);
        }
        if (request.elevationMeters) {
            args.push('--elevationMeters', request.elevationMeters.toString());
        }
        if (request.latitude !== undefined) {
            args.push('--latitude', request.latitude.toString());
        }
        if (request.hasAcclimatization !== undefined) {
            args.push('--hasAcclimatization', request.hasAcclimatization.toString());
        }
        if (request.avgSleepElevation !== undefined) {
            args.push('--avgSleepElevation', request.avgSleepElevation.toString());
        }
        if (request.exposureHours !== undefined) {
            args.push('--exposureHours', request.exposureHours.toString());
        }
        if (request.feelsLikeTemp !== undefined) {
            args.push('--feelsLikeTemp', request.feelsLikeTemp.toString());
        }
        if (request.coldDurationHours !== undefined) {
            args.push('--coldDurationHours', request.coldDurationHours.toString());
        }
        if (request.loadWeightKg !== undefined) {
            args.push('--loadWeightKg', request.loadWeightKg.toString());
        }
        if (request.subCategory) {
            args.push('--subCategory', request.subCategory);
        }
        if (request.trailDifficulty) {
            args.push('--trailDifficulty', request.trailDifficulty);
        }
        if (request.provider === 'mapbox') {
            if (request.z) {
                args.push('--z', request.z.toString());
            }
            if (request.workers) {
                args.push('--workers', request.workers.toString());
            }
        }
        if (request.includeGeoJson) {
            const tmpFile = `/tmp/route_difficulty_${Date.now()}.geojson`;
            args.push('--out', tmpFile);
        }
        return args;
    }
    mapToResponseDto(pythonResult, includeGeoJson, includeGpx) {
        const dto = {
            distance_km: pythonResult.distance_km || 0,
            elevation_gain_m: pythonResult.elevation_gain_m || 0,
            slope_avg: pythonResult.slope_avg || 0,
            label: pythonResult.label || 'EASY',
            S_km: pythonResult.S_km || 0,
            notes: pythonResult.notes || [],
        };
        if (includeGeoJson && pythonResult.geojson) {
            dto.geojson = pythonResult.geojson;
        }
        if (includeGpx && pythonResult.gpx) {
            dto.gpx = pythonResult.gpx;
        }
        return dto;
    }
    generateCacheKey(request) {
        var _a, _b, _c;
        const keyParts = [
            request.provider,
            request.origin,
            request.destination,
            request.profile || 'walking',
            ((_a = request.sampleM) === null || _a === void 0 ? void 0 : _a.toString()) || '30',
            request.category || '',
            request.accessType || '',
            ((_b = request.elevationMeters) === null || _b === void 0 ? void 0 : _b.toString()) || '',
            ((_c = request.latitude) === null || _c === void 0 ? void 0 : _c.toString()) || '',
            request.trailDifficulty || '',
        ];
        const keyString = keyParts.join('|');
        return crypto.createHash('md5').update(keyString).digest('hex');
    }
    cleanExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp >= this.cacheTTL) {
                this.cache.delete(key);
            }
        }
    }
    validateApiKeys(provider) {
        var _a, _b, _c, _d, _e;
        if (provider === 'google') {
            const apiKey = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GOOGLE_MAPS_API_KEY')) ||
                ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('GOOGLE_ROUTES_API_KEY')) ||
                ((_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('GOOGLE_PLACES_API_KEY'));
            if (!apiKey) {
                throw new common_1.ServiceUnavailableException('GOOGLE_MAPS_API_KEY 或 GOOGLE_ROUTES_API_KEY 未配置');
            }
        }
        else if (provider === 'mapbox') {
            const accessToken = ((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('MAPBOX_ACCESS_TOKEN')) ||
                ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('VITE_MAPBOX_ACCESS_TOKEN'));
            if (!accessToken) {
                throw new common_1.ServiceUnavailableException('MAPBOX_ACCESS_TOKEN 或 VITE_MAPBOX_ACCESS_TOKEN 未配置');
            }
        }
    }
};
exports.RouteDifficultyService = RouteDifficultyService;
exports.RouteDifficultyService = RouteDifficultyService = RouteDifficultyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], RouteDifficultyService);
//# sourceMappingURL=route-difficulty.service.js.map