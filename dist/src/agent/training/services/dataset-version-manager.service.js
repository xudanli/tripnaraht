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
var DatasetVersionManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatasetVersionManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let DatasetVersionManagerService = DatasetVersionManagerService_1 = class DatasetVersionManagerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DatasetVersionManagerService_1.name);
        this.versionsDir = './data/training/versions';
        this.metadataFile = './data/training/versions/metadata.json';
        this.ensureVersionsDir();
    }
    async createDatasetVersion(exportResult, qualityResult, dataSource, anonymization) {
        this.logger.log(`[DatasetVersionManager] 创建数据集版本`);
        const version = await this.getNextVersion();
        const codeVersion = this.getCodeVersion();
        const configHash = this.calculateConfigHash(dataSource.filter_criteria);
        const metadata = {
            version,
            created_at: new Date().toISOString(),
            data_source: {
                date_range: dataSource.date_range,
                filter_criteria: dataSource.filter_criteria,
                total_trajectories: dataSource.total_trajectories,
            },
            quality_report: {
                score: qualityResult.score,
                stats: qualityResult.stats,
                issues_count: qualityResult.issues.length,
            },
            code_version: {
                git_commit_hash: codeVersion.commitHash,
                git_branch: codeVersion.branch,
                etl_service_version: '1.0.0',
            },
            config_hash: configHash,
            file_info: {
                format: exportResult.format,
                file_path: exportResult.file_path,
                file_size_bytes: exportResult.file_size_bytes,
                record_count: exportResult.record_count,
            },
            anonymization,
        };
        const versionDir = path.join(this.versionsDir, version);
        await fs.mkdir(versionDir, { recursive: true });
        const versionFilePath = path.join(versionDir, `dataset.${exportResult.format}`);
        await fs.copyFile(exportResult.file_path, versionFilePath);
        metadata.file_info.file_path = versionFilePath;
        const metadataPath = path.join(versionDir, 'metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
        await this.updateVersionIndex(version, metadata);
        const datasetVersion = {
            version,
            metadata,
            created_at: metadata.created_at,
            updated_at: metadata.created_at,
        };
        this.logger.log(`[DatasetVersionManager] 数据集版本创建成功: version=${version}, filePath=${versionFilePath}`);
        return datasetVersion;
    }
    async getDatasetVersion(version) {
        const metadataPath = path.join(this.versionsDir, version, 'metadata.json');
        try {
            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);
            return {
                version,
                metadata,
                created_at: metadata.created_at,
                updated_at: metadata.created_at,
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`[DatasetVersionManager] 版本不存在: version=${version}`);
                return null;
            }
            throw error;
        }
    }
    async listDatasetVersions() {
        try {
            const indexContent = await fs.readFile(this.metadataFile, 'utf-8');
            const index = JSON.parse(indexContent);
            const versions = [];
            for (const [version, metadata] of Object.entries(index)) {
                versions.push({
                    version,
                    metadata,
                    created_at: metadata.created_at,
                    updated_at: metadata.created_at,
                });
            }
            versions.sort((a, b) => this.compareVersionNumbers(b.version, a.version));
            return versions;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    async compareVersions(version1, version2) {
        const v1 = await this.getDatasetVersion(version1);
        const v2 = await this.getDatasetVersion(version2);
        if (!v1 || !v2) {
            throw new Error(`版本不存在: ${!v1 ? version1 : version2}`);
        }
        const differences = {
            data_source: {
                total_trajectories_diff: v2.metadata.data_source.total_trajectories -
                    v1.metadata.data_source.total_trajectories,
                filter_criteria_diff: this.diffObjects(v1.metadata.data_source.filter_criteria, v2.metadata.data_source.filter_criteria),
            },
            quality: {
                score_diff: v2.metadata.quality_report.score - v1.metadata.quality_report.score,
                stats_diff: this.diffObjects(v1.metadata.quality_report.stats, v2.metadata.quality_report.stats),
            },
            code_version: {
                commit_hash_diff: v1.metadata.code_version.git_commit_hash !==
                    v2.metadata.code_version.git_commit_hash,
            },
            config_hash_diff: v1.metadata.config_hash !== v2.metadata.config_hash,
        };
        return {
            version1: v1,
            version2: v2,
            differences,
        };
    }
    async getNextVersion() {
        const versions = await this.listDatasetVersions();
        if (versions.length === 0) {
            return 'v1.0.0';
        }
        const latestVersion = versions[0];
        const versionNumbers = latestVersion.version.replace('v', '').split('.').map(Number);
        versionNumbers[2] += 1;
        return `v${versionNumbers.join('.')}`;
    }
    getCodeVersion() {
        try {
            const commitHash = (0, child_process_1.execSync)('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
            let branch;
            try {
                branch = (0, child_process_1.execSync)('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
            }
            catch (error) {
            }
            return { commitHash, branch };
        }
        catch (error) {
            this.logger.warn(`[DatasetVersionManager] 无法获取git信息: ${error === null || error === void 0 ? void 0 : error.message}`);
            return { commitHash: 'unknown', branch: undefined };
        }
    }
    calculateConfigHash(config) {
        const configStr = JSON.stringify(config, Object.keys(config).sort());
        return (0, crypto_1.createHash)('sha256').update(configStr).digest('hex').substring(0, 16);
    }
    async updateVersionIndex(version, metadata) {
        let index = {};
        try {
            const indexContent = await fs.readFile(this.metadataFile, 'utf-8');
            index = JSON.parse(indexContent);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        index[version] = metadata;
        await fs.writeFile(this.metadataFile, JSON.stringify(index, null, 2), 'utf-8');
    }
    compareVersionNumbers(v1, v2) {
        const v1Numbers = v1.replace('v', '').split('.').map(Number);
        const v2Numbers = v2.replace('v', '').split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (v1Numbers[i] > v2Numbers[i])
                return 1;
            if (v1Numbers[i] < v2Numbers[i])
                return -1;
        }
        return 0;
    }
    diffObjects(obj1, obj2) {
        const diff = {};
        const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
        for (const key of allKeys) {
            const val1 = obj1[key];
            const val2 = obj2[key];
            if (val1 !== val2) {
                diff[key] = {
                    old: val1,
                    new: val2,
                };
            }
        }
        return diff;
    }
    async ensureVersionsDir() {
        try {
            await fs.mkdir(this.versionsDir, { recursive: true });
        }
        catch (error) {
            this.logger.error(`[DatasetVersionManager] 无法创建版本目录: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
};
exports.DatasetVersionManagerService = DatasetVersionManagerService;
exports.DatasetVersionManagerService = DatasetVersionManagerService = DatasetVersionManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DatasetVersionManagerService);
//# sourceMappingURL=dataset-version-manager.service.js.map