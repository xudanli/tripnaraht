"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FileExtractorMcpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileExtractorMcpService = void 0;
const common_1 = require("@nestjs/common");
const file_extractor_client_1 = require("./file-extractor-client");
const file_extractor_direct_service_1 = require("./file-extractor-direct.service");
let FileExtractorMcpService = FileExtractorMcpService_1 = class FileExtractorMcpService {
    constructor(directService) {
        this.directService = directService;
        this.logger = new common_1.Logger(FileExtractorMcpService_1.name);
        this.client = null;
        this.isAvailableFlag = false;
        this.useDirectService = false;
    }
    async onModuleInit() {
        var _a;
        try {
            this.client = new file_extractor_client_1.FileExtractorMcpClient();
            await this.client.connect();
            this.isAvailableFlag = true;
            this.useDirectService = false;
            this.logger.log('File Extractor MCP service initialized');
        }
        catch (error) {
            this.logger.warn('Failed to initialize File Extractor MCP service:', error.message);
            this.logger.log('Will use direct service as fallback if available');
            this.isAvailableFlag = false;
            this.useDirectService = ((_a = this.directService) === null || _a === void 0 ? void 0 : _a.isServiceAvailable()) || false;
        }
    }
    isAvailable() {
        return (this.isAvailableFlag && this.client !== null) || this.useDirectService;
    }
    async extractMetadata(url) {
        var _a, _b;
        if (this.isAvailableFlag && this.client) {
            try {
                return await this.client.extractMetadata(url);
            }
            catch (error) {
                this.logger.warn('MCP service failed, falling back to direct service:', error.message);
                if ((_a = this.directService) === null || _a === void 0 ? void 0 : _a.isServiceAvailable()) {
                    return await this.directService.extractMetadata(url);
                }
                throw error;
            }
        }
        if ((_b = this.directService) === null || _b === void 0 ? void 0 : _b.isServiceAvailable()) {
            return await this.directService.extractMetadata(url);
        }
        throw new Error('File Extractor service is not available (neither MCP nor direct service)');
    }
    async extractFileContent(url, options) {
        var _a, _b;
        if (this.isAvailableFlag && this.client) {
            try {
                return await this.client.extractFileContent(url, options);
            }
            catch (error) {
                this.logger.warn('MCP service failed, falling back to direct service:', error.message);
                if ((_a = this.directService) === null || _a === void 0 ? void 0 : _a.isServiceAvailable()) {
                    return await this.directService.extractFileContent(url, options);
                }
                throw error;
            }
        }
        if ((_b = this.directService) === null || _b === void 0 ? void 0 : _b.isServiceAvailable()) {
            return await this.directService.extractFileContent(url, options);
        }
        throw new Error('File Extractor service is not available (neither MCP nor direct service)');
    }
    async listTools() {
        if (!this.isAvailable()) {
            throw new Error('File Extractor MCP service is not available');
        }
        try {
            return await this.client.listTools();
        }
        catch (error) {
            this.logger.error('Failed to list tools:', error);
            throw error;
        }
    }
};
exports.FileExtractorMcpService = FileExtractorMcpService;
exports.FileExtractorMcpService = FileExtractorMcpService = FileExtractorMcpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(file_extractor_direct_service_1.FileExtractorDirectService)),
    __metadata("design:paramtypes", [file_extractor_direct_service_1.FileExtractorDirectService])
], FileExtractorMcpService);
//# sourceMappingURL=file-extractor-mcp.service.js.map