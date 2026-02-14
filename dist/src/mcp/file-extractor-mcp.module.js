"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileExtractorMcpModule = void 0;
const common_1 = require("@nestjs/common");
const file_extractor_mcp_service_1 = require("./file-extractor-mcp.service");
const file_extractor_mcp_controller_1 = require("./file-extractor-mcp.controller");
const file_extractor_direct_module_1 = require("./file-extractor-direct.module");
let FileExtractorMcpModule = class FileExtractorMcpModule {
};
exports.FileExtractorMcpModule = FileExtractorMcpModule;
exports.FileExtractorMcpModule = FileExtractorMcpModule = __decorate([
    (0, common_1.Module)({
        imports: [file_extractor_direct_module_1.FileExtractorDirectModule],
        controllers: [file_extractor_mcp_controller_1.FileExtractorMcpController],
        providers: [file_extractor_mcp_service_1.FileExtractorMcpService],
        exports: [file_extractor_mcp_service_1.FileExtractorMcpService],
    })
], FileExtractorMcpModule);
//# sourceMappingURL=file-extractor-mcp.module.js.map