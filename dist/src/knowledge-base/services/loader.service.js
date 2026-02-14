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
var LoaderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoaderService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let LoaderService = LoaderService_1 = class LoaderService {
    constructor(configService, prisma) {
        var _a;
        this.configService = configService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(LoaderService_1.name);
        this.kbPath = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('KB_PATH')) || process.env.KB_PATH || './docs/iceland';
        this.logger.log(`📁 Knowledge Base Path: ${this.kbPath}`);
    }
    async loadAllFiles() {
        const files = [];
        const walkDir = (dirPath) => {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    walkDir(fullPath);
                }
                else if (entry.name.endsWith('.json')) {
                    try {
                        const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                        files.push({
                            filename: entry.name,
                            filepath: fullPath,
                            content,
                            metadata: content.metadata || {
                                version: '1.0.0',
                                credibility_score: 0.8,
                                language: 'zh-CN',
                                data_sources: [],
                                last_updated: new Date().toISOString(),
                            },
                        });
                        this.logger.log(`✅ 已加载: ${entry.name}`);
                    }
                    catch (error) {
                        this.logger.error(`❌ 加载失败 ${entry.name}:`, error);
                    }
                }
            }
        };
        walkDir(this.kbPath);
        this.logger.log(`\n📊 总共加载 ${files.length} 个文件`);
        return files;
    }
    async saveFile(fileData) {
        const category = this.detectCategory(fileData.filename);
        const file = await this.prisma.knowledgeFile.upsert({
            where: { filename: fileData.filename },
            update: {
                filepath: fileData.filepath,
                category,
                version: fileData.metadata.version,
                credibilityScore: fileData.metadata.credibility_score,
                dataSources: fileData.metadata.data_sources,
                lastUpdated: new Date(fileData.metadata.last_updated),
            },
            create: {
                filename: fileData.filename,
                filepath: fileData.filepath,
                category,
                version: fileData.metadata.version,
                language: fileData.metadata.language,
                credibilityScore: fileData.metadata.credibility_score,
                dataSources: fileData.metadata.data_sources,
                lastUpdated: new Date(fileData.metadata.last_updated),
            },
        });
        return file.id;
    }
    detectCategory(filename) {
        if (filename.includes('rhythm') || filename.includes('persona') || filename.includes('feasibility')) {
            return 'decision_support';
        }
        if (filename.includes('rental') || filename.includes('packing')) {
            return 'practical_guides';
        }
        if (filename.includes('rules') || filename.includes('laws') || filename.includes('compliance')) {
            return 'compliance_rules';
        }
        if (filename.includes('risk') || filename.includes('hazard') || filename.includes('safety')) {
            return 'safety';
        }
        if (filename.includes('weather') || filename.includes('seasonal') || filename.includes('climate') || filename.includes('terrain')) {
            return 'geography_seasonal';
        }
        if (filename.includes('route') || filename.includes('ring-road') || filename.includes('circle') ||
            filename.includes('highlands') || filename.includes('westfjords') || filename.includes('snaefellsnes')) {
            return 'routes';
        }
        if (filename.includes('poi') || filename.includes('accommodation') || filename.includes('attraction') || filename.includes('service') || filename.includes('supplies')) {
            return 'pois';
        }
        if (filename.includes('accessibility')) {
            return 'accessibility';
        }
        return 'general';
    }
};
exports.LoaderService = LoaderService;
exports.LoaderService = LoaderService = LoaderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], LoaderService);
//# sourceMappingURL=loader.service.js.map