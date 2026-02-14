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
var FileStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileStorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const OSS = require('ali-oss');
let FileStorageService = FileStorageService_1 = class FileStorageService {
    constructor(configService) {
        var _a;
        this.configService = configService;
        this.logger = new common_1.Logger(FileStorageService_1.name);
        this.ossClient = null;
        this.ossFolder = 'contact';
        this.uploadDir = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('CONTACT_UPLOAD_DIR')) ||
            (0, path_1.join)(process.cwd(), 'uploads', 'contact');
        this.initOssClient();
        if (!this.ossClient) {
            this.ensureUploadDir().catch(error => {
                this.logger.error(`创建上传目录失败: ${error.message}`);
            });
        }
    }
    initOssClient() {
        var _a, _b, _c, _d, _e, _f, _g;
        const region = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('CONTACT_OSS_REGION')) ||
            ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('ALIYUN_OSS_REGION'));
        const accessKeyId = ((_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('CONTACT_OSS_ACCESS_KEY_ID')) ||
            ((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('ALIYUN_OSS_ACCESS_KEY_ID'));
        const accessKeySecret = ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('CONTACT_OSS_ACCESS_KEY_SECRET')) ||
            ((_f = this.configService) === null || _f === void 0 ? void 0 : _f.get('ALIYUN_OSS_ACCESS_KEY_SECRET'));
        const bucket = ((_g = this.configService) === null || _g === void 0 ? void 0 : _g.get('CONTACT_OSS_BUCKET')) || 'tripnara-contact';
        if (region && accessKeyId && accessKeySecret && bucket) {
            try {
                this.ossClient = new OSS({
                    region,
                    accessKeyId,
                    accessKeySecret,
                    bucket,
                });
                this.ossBucket = bucket;
                this.logger.log(`✅ Contact OSS 已初始化 (bucket: ${bucket}, folder: ${this.ossFolder})`);
            }
            catch (error) {
                this.logger.error(`❌ OSS 初始化失败: ${error.message}`);
                this.ossClient = null;
            }
        }
        else {
            this.logger.warn('⚠️ Contact OSS 未配置，将使用本地存储（生产环境请配置 OSS）');
        }
    }
    async ensureUploadDir() {
        if (!(0, fs_1.existsSync)(this.uploadDir)) {
            await (0, promises_1.mkdir)(this.uploadDir, { recursive: true });
            this.logger.log(`创建本地上传目录: ${this.uploadDir}`);
        }
    }
    async saveFile(buffer, originalName, mimeType) {
        const ext = originalName.split('.').pop() || '';
        const fileName = `${(0, crypto_1.randomUUID)()}${ext ? '.' + ext : ''}`;
        if (this.ossClient) {
            return this.saveToOss(buffer, fileName, originalName, mimeType);
        }
        return this.saveToLocal(buffer, fileName, originalName, mimeType);
    }
    async saveToOss(buffer, fileName, originalName, mimeType) {
        var _a, _b;
        const key = `${this.ossFolder}/${fileName}`;
        try {
            const result = await this.ossClient.put(key, buffer, {
                headers: {
                    'Content-Type': mimeType,
                    'Cache-Control': 'max-age=31536000',
                },
            });
            const cdnDomain = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('CONTACT_OSS_CDN_DOMAIN')) ||
                ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('ALIYUN_OSS_CDN_DOMAIN'));
            const url = cdnDomain
                ? `https://${cdnDomain}/${key}`
                : result.url;
            this.logger.log(`✅ 文件上传到 OSS 成功: ${key}`);
            return {
                filePath: key,
                fileName: originalName,
                fileSize: buffer.length,
                mimeType,
                url,
            };
        }
        catch (error) {
            this.logger.error(`❌ OSS 上传失败: ${error.message}`);
            this.logger.warn('OSS 上传失败，降级到本地存储');
            return this.saveToLocal(buffer, fileName, originalName, mimeType);
        }
    }
    async saveToLocal(buffer, fileName, originalName, mimeType) {
        await this.ensureUploadDir();
        const filePath = (0, path_1.join)(this.uploadDir, fileName);
        await (0, promises_1.writeFile)(filePath, buffer);
        this.logger.debug(`文件已保存到本地: ${filePath}`);
        return {
            filePath,
            fileName: originalName,
            fileSize: buffer.length,
            mimeType,
        };
    }
    getFileUrl(filePath) {
        var _a, _b, _c, _d, _e, _f;
        if (!filePath.includes(process.cwd()) && !filePath.startsWith('/')) {
            const cdnDomain = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('CONTACT_OSS_CDN_DOMAIN')) ||
                ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('ALIYUN_OSS_CDN_DOMAIN'));
            const bucket = ((_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('CONTACT_OSS_BUCKET')) || 'tripnara-contact';
            const region = ((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('CONTACT_OSS_REGION')) ||
                ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('ALIYUN_OSS_REGION'));
            if (cdnDomain) {
                return `https://${cdnDomain}/${filePath}`;
            }
            if (region && bucket) {
                return `https://${bucket}.${region}.aliyuncs.com/${filePath}`;
            }
        }
        const baseUrl = (_f = this.configService) === null || _f === void 0 ? void 0 : _f.get('FILE_STORAGE_BASE_URL');
        if (baseUrl) {
            const relativePath = filePath.replace(this.uploadDir, '').replace(/\\/g, '/');
            return `${baseUrl}${relativePath}`;
        }
        const relativePath = filePath.replace(process.cwd(), '').replace(/\\/g, '/');
        return relativePath;
    }
    async deleteFile(filePath) {
        if (this.ossClient && !filePath.includes(process.cwd()) && !filePath.startsWith('/')) {
            try {
                await this.ossClient.delete(filePath);
                this.logger.log(`✅ OSS 文件删除成功: ${filePath}`);
                return true;
            }
            catch (error) {
                this.logger.error(`❌ OSS 文件删除失败: ${error.message}`);
                return false;
            }
        }
        try {
            const { unlink } = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            await unlink(filePath);
            this.logger.log(`✅ 本地文件删除成功: ${filePath}`);
            return true;
        }
        catch (error) {
            this.logger.error(`❌ 本地文件删除失败: ${error.message}`);
            return false;
        }
    }
    isOssAvailable() {
        return this.ossClient !== null;
    }
};
exports.FileStorageService = FileStorageService;
exports.FileStorageService = FileStorageService = FileStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FileStorageService);
//# sourceMappingURL=file-storage.service.js.map