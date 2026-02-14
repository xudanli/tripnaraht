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
var E2ECaseStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.E2ECaseStorageService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let E2ECaseStorageService = E2ECaseStorageService_1 = class E2ECaseStorageService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(E2ECaseStorageService_1.name);
        this.casesDir = path.resolve(__dirname, '../../../e2e-cases');
    }
    async loadCaseFromFile(caseId) {
        try {
            const filePath = path.join(this.casesDir, `${caseId}.json`);
            const content = await fs.readFile(filePath, 'utf-8');
            const testCase = JSON.parse(content);
            this.logger.debug(`从文件加载 E2E Case: ${caseId}`);
            return testCase;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.debug(`E2E Case 文件不存在: ${caseId}`);
                return null;
            }
            this.logger.error(`加载 E2E Case 失败: ${caseId}, 错误: ${error.message}`);
            return null;
        }
    }
    async loadCaseFromDatabase(caseId) {
        try {
            return null;
        }
        catch (error) {
            this.logger.error(`从数据库加载 E2E Case 失败: ${caseId}, 错误: ${error.message}`);
            return null;
        }
    }
    async loadCase(caseId) {
        const fileCase = await this.loadCaseFromFile(caseId);
        if (fileCase) {
            return fileCase;
        }
        const dbCase = await this.loadCaseFromDatabase(caseId);
        if (dbCase) {
            return dbCase;
        }
        return this.loadCaseFromExamples(caseId);
    }
    async loadCaseFromExamples(caseId) {
        try {
            const examplePath = path.join(__dirname, 'e2e-cases', `${caseId}.ts`);
            this.logger.debug(`尝试从示例加载 E2E Case: ${caseId}`);
            return null;
        }
        catch (error) {
            return null;
        }
    }
    async saveCase(testCase) {
        try {
            await fs.mkdir(this.casesDir, { recursive: true });
            const filePath = path.join(this.casesDir, `${testCase.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(testCase, null, 2), 'utf-8');
            this.logger.debug(`保存 E2E Case 到文件: ${testCase.id}`);
        }
        catch (error) {
            this.logger.error(`保存 E2E Case 失败: ${testCase.id}, 错误: ${error.message}`);
            throw error;
        }
    }
    async listCases() {
        try {
            const files = await fs.readdir(this.casesDir);
            const cases = files
                .filter((file) => file.endsWith('.json'))
                .map((file) => file.replace('.json', ''));
            return cases;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            this.logger.error(`列出 E2E Cases 失败: ${error.message}`);
            return [];
        }
    }
};
exports.E2ECaseStorageService = E2ECaseStorageService;
exports.E2ECaseStorageService = E2ECaseStorageService = E2ECaseStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], E2ECaseStorageService);
//# sourceMappingURL=e2e-case-storage.service.js.map