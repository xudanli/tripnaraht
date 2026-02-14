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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var UploadService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const https_proxy_agent_1 = require("https-proxy-agent");
const https = __importStar(require("https"));
const OSS = require('ali-oss');
let UploadService = UploadService_1 = class UploadService {
    constructor() {
        this.logger = new common_1.Logger(UploadService_1.name);
        this.ossClient = null;
        this.httpClient = null;
        this.initOssClient();
        this.initHttpClient();
    }
    initHttpClient() {
        const proxyUrl = process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.ALL_PROXY ||
            process.env.all_proxy;
        let httpsAgent;
        if (proxyUrl) {
            try {
                httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
                this.logger.debug(`HTTP 客户端已初始化（使用代理: ${proxyUrl})`);
            }
            catch (error) {
                this.logger.warn(`代理配置失败，使用直接连接: ${error.message}`);
                httpsAgent = new https.Agent({
                    keepAlive: true,
                    family: 4,
                    rejectUnauthorized: true,
                });
            }
        }
        else {
            httpsAgent = new https.Agent({
                keepAlive: true,
                family: 4,
                rejectUnauthorized: true,
            });
            this.logger.debug('HTTP 客户端已初始化（直接连接）');
        }
        this.httpClient = axios_1.default.create({
            timeout: 30000,
            httpsAgent,
            proxy: false,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TripNara/1.0)',
            },
        });
    }
    initOssClient() {
        const region = process.env.ALIYUN_OSS_REGION;
        const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID;
        const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
        const bucket = process.env.ALIYUN_OSS_BUCKET;
        if (region && accessKeyId && accessKeySecret && bucket) {
            this.ossClient = new OSS({
                region,
                accessKeyId,
                accessKeySecret,
                bucket,
            });
            this.logger.log(`✅ 阿里云 OSS 已初始化 (bucket: ${bucket})`);
        }
        else {
            this.logger.warn('⚠️ 阿里云 OSS 未配置，图片上传功能不可用');
        }
    }
    async uploadImage(file, folder = 'places') {
        if (!this.ossClient) {
            throw new Error('OSS 未配置，请检查环境变量');
        }
        const ext = path.extname(file.originalname) || '.jpg';
        const filename = `${(0, uuid_1.v4)()}${ext}`;
        const key = `${folder}/${filename}`;
        try {
            const result = await this.ossClient.put(key, file.buffer, {
                headers: {
                    'Content-Type': file.mimetype,
                    'Cache-Control': 'max-age=31536000',
                },
            });
            const cdnDomain = process.env.ALIYUN_OSS_CDN_DOMAIN;
            const url = cdnDomain
                ? `https://${cdnDomain}/${key}`
                : result.url;
            this.logger.log(`✅ 图片上传成功: ${key}`);
            return {
                url,
                key,
                size: file.size,
                mimeType: file.mimetype,
            };
        }
        catch (error) {
            this.logger.error(`❌ 图片上传失败: ${error.message}`);
            throw new Error(`图片上传失败: ${error.message}`);
        }
    }
    async uploadImages(files, folder = 'places') {
        const results = [];
        for (const file of files) {
            const result = await this.uploadImage(file, folder);
            results.push(result);
        }
        return results;
    }
    async deleteImage(key) {
        if (!this.ossClient) {
            throw new Error('OSS 未配置');
        }
        try {
            await this.ossClient.delete(key);
            this.logger.log(`✅ 图片删除成功: ${key}`);
        }
        catch (error) {
            this.logger.error(`❌ 图片删除失败: ${error.message}`);
            throw new Error(`图片删除失败: ${error.message}`);
        }
    }
    async uploadImageFromUrl(imageUrl, folder = 'places', filename) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!this.ossClient) {
            throw new Error('OSS 未配置，请检查环境变量');
        }
        const maxRetries = 3;
        const timeoutMs = 30000;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.logger.debug(`正在下载图片 (尝试 ${attempt}/${maxRetries}): ${imageUrl}`);
                const response = await this.httpClient.get(imageUrl, {
                    responseType: 'arraybuffer',
                    timeout: timeoutMs,
                });
                if (response.status !== 200) {
                    throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
                }
                const buffer = Buffer.from(response.data);
                const contentType = response.headers['content-type'] || 'image/jpeg';
                let ext = '.jpg';
                if (contentType.includes('png')) {
                    ext = '.png';
                }
                else if (contentType.includes('webp')) {
                    ext = '.webp';
                }
                else if (contentType.includes('gif')) {
                    ext = '.gif';
                }
                const finalFilename = filename || `${(0, uuid_1.v4)()}${ext}`;
                const key = `${folder}/${finalFilename}`;
                const result = await this.ossClient.put(key, buffer, {
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': 'max-age=31536000',
                    },
                });
                const cdnDomain = process.env.ALIYUN_OSS_CDN_DOMAIN;
                const url = cdnDomain
                    ? `https://${cdnDomain}/${key}`
                    : result.url;
                this.logger.log(`✅ 图片上传成功: ${key} (从 ${imageUrl})`);
                return {
                    url,
                    key,
                    size: buffer.length,
                    mimeType: contentType,
                };
            }
            catch (error) {
                lastError = error;
                if ((error.code === 'ECONNREFUSED' || ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('ECONNREFUSED'))) && attempt === 1) {
                    this.logger.warn('代理连接失败，切换到直接连接');
                    const originalProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy;
                    if (originalProxy) {
                        delete process.env.HTTPS_PROXY;
                        delete process.env.https_proxy;
                        delete process.env.ALL_PROXY;
                        delete process.env.all_proxy;
                        this.initHttpClient();
                        if (originalProxy) {
                            process.env.HTTPS_PROXY = originalProxy;
                        }
                    }
                }
                const isRetryable = ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('fetch failed')) ||
                    ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('timeout')) ||
                    ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('超时')) ||
                    ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('ECONNABORTED')) ||
                    ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes('ECONNRESET')) ||
                    ((_g = error.message) === null || _g === void 0 ? void 0 : _g.includes('ENOTFOUND')) ||
                    ((_h = error.message) === null || _h === void 0 ? void 0 : _h.includes('ETIMEDOUT')) ||
                    ((_j = error.message) === null || _j === void 0 ? void 0 : _j.includes('ECONNREFUSED')) ||
                    error.code === 'ECONNABORTED' ||
                    error.code === 'ECONNRESET' ||
                    error.code === 'ENOTFOUND' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ECONNREFUSED';
                if (!isRetryable || attempt === maxRetries) {
                    this.logger.error(`❌ 从 URL 上传图片失败: ${error.message}`);
                    throw new Error(`从 URL 上传图片失败: ${error.message}`);
                }
                const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                this.logger.warn(`[OSS] 下载失败 (尝试 ${attempt}/${maxRetries}): ${error.message}，${backoffMs}ms 后重试`);
                await this.delay(backoffMs);
            }
        }
        throw lastError || new Error('未知错误');
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    isAvailable() {
        return this.ossClient !== null;
    }
};
exports.UploadService = UploadService;
exports.UploadService = UploadService = UploadService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], UploadService);
//# sourceMappingURL=upload.service.js.map