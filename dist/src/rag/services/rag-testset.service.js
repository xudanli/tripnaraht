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
var RagTestsetService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagTestsetService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let RagTestsetService = RagTestsetService_1 = class RagTestsetService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(RagTestsetService_1.name);
    }
    getTestsetPath() {
        const configured = process.env.RAG_EVAL_TESTSET_PATH;
        if (configured && configured.trim())
            return configured.trim();
        return path.resolve(process.cwd(), 'e2e-cases', 'rag-eval-testset.json');
    }
    async load() {
        const p = this.getTestsetPath();
        try {
            const raw = await fs.readFile(p, 'utf-8');
            const parsed = JSON.parse(raw);
            this.validate(parsed);
            return parsed;
        }
        catch (e) {
            if ((e === null || e === void 0 ? void 0 : e.code) === 'ENOENT') {
                const now = new Date().toISOString();
                const empty = {
                    version: 1,
                    name: 'default',
                    description: 'Auto-created empty testset. Populate testCases for evaluation.',
                    createdAt: now,
                    updatedAt: now,
                    testCases: [],
                };
                return empty;
            }
            throw e;
        }
    }
    async save(testset) {
        var _a;
        const p = this.getTestsetPath();
        const dir = path.dirname(p);
        await fs.mkdir(dir, { recursive: true });
        const now = new Date().toISOString();
        const toSave = {
            ...testset,
            version: (_a = testset.version) !== null && _a !== void 0 ? _a : 1,
            updatedAt: now,
            createdAt: testset.createdAt || now,
            testCases: Array.isArray(testset.testCases) ? testset.testCases : [],
        };
        this.validate(toSave);
        await fs.writeFile(p, JSON.stringify(toSave, null, 2), 'utf-8');
        this.logger.log(`✅ RAG testset saved: ${p} (cases=${toSave.testCases.length})`);
    }
    validate(testset) {
        if (!testset || typeof testset !== 'object')
            throw new Error('Invalid testset');
        if (!Array.isArray(testset.testCases))
            throw new Error('testCases must be an array');
        for (const tc of testset.testCases) {
            if (!tc.id || typeof tc.id !== 'string')
                throw new Error('testCase.id required');
            if (!tc.query || typeof tc.query !== 'string')
                throw new Error(`testCase.query required: ${tc.id}`);
            if (!Array.isArray(tc.groundTruthChunkIds)) {
                throw new Error(`testCase.groundTruthChunkIds must be array: ${tc.id}`);
            }
        }
    }
    async findRelevantChunks(query, limit = 10) {
        const keywords = this.extractKeywords(query);
        if (keywords.length === 0) {
            return [];
        }
        const keywordConditions = keywords.map((kw) => `(c.content ILIKE '%${kw}%' OR EXISTS(SELECT 1 FROM unnest(c.keywords) AS k WHERE LOWER(k) LIKE LOWER('%${kw}%')))`).join(' OR ');
        const querySql = `
      SELECT
        c.id,
        c.chunk_id,
        c.content,
        c.type,
        c.keywords,
        kf.filename,
        kf.category
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE ${keywordConditions}
      LIMIT ${limit * 2}
    `;
        const results = await this.prisma.$queryRawUnsafe(querySql);
        const scored = results.map((r) => {
            const contentLower = r.content.toLowerCase();
            const keywordsLower = r.keywords.map((k) => k.toLowerCase());
            let score = 0;
            keywords.forEach((kw) => {
                if (contentLower.includes(kw.toLowerCase()))
                    score += 2;
                if (keywordsLower.some((k) => k.includes(kw.toLowerCase())))
                    score += 3;
            });
            return { ...r, similarity: score };
        });
        scored.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
        return scored.slice(0, limit).map((r) => ({
            id: r.id,
            chunkId: r.chunk_id,
            content: r.content,
            type: r.type,
            keywords: r.keywords,
            filename: r.filename,
            category: r.category,
            similarity: r.similarity,
        }));
    }
    async listAllChunks(limit = 100) {
        const chunks = await this.prisma.chunk.findMany({
            select: {
                id: true,
                chunkId: true,
                content: true,
                type: true,
                keywords: true,
                file: {
                    select: {
                        filename: true,
                        category: true,
                    },
                },
            },
            take: limit,
            orderBy: {
                createdAt: 'desc',
            },
        });
        return chunks.map((c) => ({
            id: c.id,
            chunkId: c.chunkId,
            content: c.content,
            type: c.type,
            keywords: c.keywords,
            filename: c.file.filename,
            category: c.file.category,
        }));
    }
    extractKeywords(query) {
        const cleaned = query
            .toLowerCase()
            .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
            .trim();
        const words = cleaned
            .split(/\s+/)
            .filter((w) => w.length >= 2)
            .filter((w) => !this.isStopWord(w));
        return words;
    }
    isStopWord(word) {
        const stopWords = new Set([
            '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
            '怎么', '哪些', '什么', '时候', '需要',
        ]);
        return stopWords.has(word.toLowerCase());
    }
};
exports.RagTestsetService = RagTestsetService;
exports.RagTestsetService = RagTestsetService = RagTestsetService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RagTestsetService);
//# sourceMappingURL=rag-testset.service.js.map