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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var FileExtractorDirectService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileExtractorDirectService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const pdf_parse_1 = require("pdf-parse");
const mammoth = __importStar(require("mammoth"));
const XLSX = __importStar(require("xlsx"));
const https_proxy_agent_1 = require("https-proxy-agent");
let FileExtractorDirectService = FileExtractorDirectService_1 = class FileExtractorDirectService {
    constructor() {
        this.logger = new common_1.Logger(FileExtractorDirectService_1.name);
        this.isAvailable = true;
    }
    async onModuleInit() {
        const proxyUrl = process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.ALL_PROXY ||
            process.env.all_proxy;
        const httpsAgent = proxyUrl
            ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
            : new https.Agent({
                keepAlive: true,
                family: 4,
                rejectUnauthorized: true,
            });
        this.axiosInstance = axios_1.default.create({
            timeout: 60000,
            httpsAgent,
            proxy: false,
            maxContentLength: 100 * 1024 * 1024,
            maxBodyLength: 100 * 1024 * 1024,
            headers: {
                'User-Agent': 'TripNARA/1.0',
            },
        });
        this.isAvailable = true;
        this.logger.log('File Extractor Direct Service initialized');
    }
    isServiceAvailable() {
        return this.isAvailable;
    }
    async downloadFile(url) {
        try {
            const response = await this.axiosInstance.get(url, {
                responseType: 'arraybuffer',
                validateStatus: (status) => status >= 200 && status < 400,
            });
            if (!response.data || response.data.length === 0) {
                throw new Error('Downloaded file is empty');
            }
            return Buffer.from(response.data);
        }
        catch (error) {
            const errorMessage = error.response
                ? `HTTP ${error.response.status}: ${error.response.statusText}`
                : error.message;
            this.logger.error(`Failed to download file from ${url}:`, errorMessage);
            throw new Error(`Failed to download file from ${url}: ${errorMessage}`);
        }
    }
    getFileExtension(url) {
        const urlPath = url.split('?')[0];
        const parts = urlPath.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }
    async extractMetadata(url) {
        var _a, _b, _c;
        try {
            const buffer = await this.downloadFile(url);
            const ext = this.getFileExtension(url);
            const filename = ((_a = url.split('/').pop()) === null || _a === void 0 ? void 0 : _a.split('?')[0]) || 'unknown';
            const metadata = {
                source: url,
                filename,
                format: ext.toUpperCase(),
                size: buffer.length,
            };
            switch (ext) {
                case 'pdf':
                    try {
                        const parser = new pdf_parse_1.PDFParse({ data: buffer });
                        const infoResult = await parser.getInfo({ parsePageInfo: false });
                        metadata.pages = infoResult.total || 0;
                        metadata.mimeType = 'application/pdf';
                        metadata.title = (_b = infoResult.info) === null || _b === void 0 ? void 0 : _b.Title;
                        metadata.author = (_c = infoResult.info) === null || _c === void 0 ? void 0 : _c.Author;
                        await parser.destroy();
                    }
                    catch (error) {
                        this.logger.warn('Failed to parse PDF metadata:', error.message);
                        metadata.mimeType = 'application/pdf';
                    }
                    break;
                case 'xlsx':
                case 'xls':
                    try {
                        const workbook = XLSX.read(buffer, { type: 'buffer' });
                        metadata.sheets = workbook.SheetNames;
                        metadata.mimeType = ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel';
                    }
                    catch (error) {
                        this.logger.warn('Failed to parse Excel metadata:', error.message);
                    }
                    break;
                case 'csv':
                    metadata.mimeType = 'text/csv';
                    break;
                case 'docx':
                    metadata.mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                    break;
                case 'doc':
                    metadata.mimeType = 'application/msword';
                    break;
                case 'pptx':
                    metadata.mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                    break;
            }
            return metadata;
        }
        catch (error) {
            this.logger.error('Failed to extract metadata:', error);
            throw error;
        }
    }
    async extractFileContent(url, options) {
        try {
            const buffer = await this.downloadFile(url);
            const ext = this.getFileExtension(url);
            switch (ext) {
                case 'pdf':
                    return await this.extractPdfContent(buffer, options);
                case 'docx':
                    return await this.extractDocxContent(buffer, options);
                case 'xlsx':
                case 'xls':
                    return await this.extractExcelContent(buffer, options);
                case 'csv':
                    return await this.extractCsvContent(buffer, options);
                case 'pptx':
                    throw new Error('PPTX extraction not yet implemented. Please use PDF conversion.');
                default:
                    throw new Error(`Unsupported file format: ${ext}`);
            }
        }
        catch (error) {
            this.logger.error('Failed to extract file content:', error);
            throw error;
        }
    }
    async extractPdfContent(buffer, options) {
        try {
            const parser = new pdf_parse_1.PDFParse({ data: buffer });
            const infoResult = await parser.getInfo({ parsePageInfo: false });
            const totalPages = infoResult.total || 0;
            let textResult;
            if ((options === null || options === void 0 ? void 0 : options.page) !== undefined) {
                if (options.page < 1 || options.page > totalPages) {
                    await parser.destroy();
                    throw new Error(`Page ${options.page} is out of range (1-${totalPages})`);
                }
                textResult = await parser.getText({ partial: [options.page] });
            }
            else {
                textResult = await parser.getText();
            }
            let content = textResult.text || '';
            if ((options === null || options === void 0 ? void 0 : options.limit) && content.length > options.limit) {
                content = content.substring(0, options.limit) + '...';
            }
            await parser.destroy();
            return {
                content,
                page: (options === null || options === void 0 ? void 0 : options.page) || 1,
                totalPages,
            };
        }
        catch (error) {
            throw new Error(`Failed to extract PDF content: ${error.message}`);
        }
    }
    async extractDocxContent(buffer, options) {
        try {
            const result = await mammoth.extractRawText({ buffer });
            let content = result.value;
            if ((options === null || options === void 0 ? void 0 : options.limit) && content.length > options.limit) {
                content = content.substring(0, options.limit) + '...';
            }
            return {
                content,
            };
        }
        catch (error) {
            throw new Error(`Failed to extract DOCX content: ${error.message}`);
        }
    }
    async extractExcelContent(buffer, options) {
        try {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = (options === null || options === void 0 ? void 0 : options.sheet) || workbook.SheetNames[0];
            if (!workbook.Sheets[sheetName]) {
                throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
            }
            const worksheet = workbook.Sheets[sheetName];
            let data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            if (options === null || options === void 0 ? void 0 : options.search) {
                const searchTerm = options.caseSensitive
                    ? options.search
                    : options.search.toLowerCase();
                data = data.filter((row) => {
                    const rowText = JSON.stringify(row);
                    const searchText = options.caseSensitive ? rowText : rowText.toLowerCase();
                    return searchText.includes(searchTerm);
                });
            }
            return {
                content: data,
                sheet: sheetName,
            };
        }
        catch (error) {
            throw new Error(`Failed to extract Excel content: ${error.message}`);
        }
    }
    async extractCsvContent(buffer, options) {
        try {
            const csvText = buffer.toString('utf-8');
            const workbook = XLSX.read(csvText, { type: 'string' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            let data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            if (options === null || options === void 0 ? void 0 : options.search) {
                const searchTerm = options.caseSensitive
                    ? options.search
                    : options.search.toLowerCase();
                data = data.filter((row) => {
                    const rowText = JSON.stringify(row);
                    const searchText = options.caseSensitive ? rowText : rowText.toLowerCase();
                    return searchText.includes(searchTerm);
                });
            }
            return {
                content: data,
            };
        }
        catch (error) {
            throw new Error(`Failed to extract CSV content: ${error.message}`);
        }
    }
};
exports.FileExtractorDirectService = FileExtractorDirectService;
exports.FileExtractorDirectService = FileExtractorDirectService = FileExtractorDirectService_1 = __decorate([
    (0, common_1.Injectable)()
], FileExtractorDirectService);
//# sourceMappingURL=file-extractor-direct.service.js.map