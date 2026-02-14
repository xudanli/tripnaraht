"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeBaseModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../prisma/prisma.module");
const places_module_1 = require("../places/places.module");
const loader_service_1 = require("./services/loader.service");
const chunking_service_1 = require("./services/chunking.service");
const indexing_service_1 = require("./services/indexing.service");
let KnowledgeBaseModule = class KnowledgeBaseModule {
};
exports.KnowledgeBaseModule = KnowledgeBaseModule;
exports.KnowledgeBaseModule = KnowledgeBaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => places_module_1.PlacesModule),
            config_1.ConfigModule,
        ],
        providers: [loader_service_1.LoaderService, chunking_service_1.ChunkingService, indexing_service_1.IndexingService],
        exports: [loader_service_1.LoaderService, chunking_service_1.ChunkingService, indexing_service_1.IndexingService],
    })
], KnowledgeBaseModule);
//# sourceMappingURL=knowledge-base.module.js.map