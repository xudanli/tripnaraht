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
var RAGEvaluationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGEvaluationService = void 0;
const common_1 = require("@nestjs/common");
const rag_service_1 = require("./rag.service");
const chunk_retrieval_service_1 = require("./chunk-retrieval.service");
let RAGEvaluationService = RAGEvaluationService_1 = class RAGEvaluationService {
    constructor(ragService, chunkRetrievalService) {
        this.ragService = ragService;
        this.chunkRetrievalService = chunkRetrievalService;
        this.logger = new common_1.Logger(RAGEvaluationService_1.name);
    }
    async evaluateRetrieval(query, params, groundTruthDocumentIds) {
        this.logger.debug(`[RAGEvaluation] 评估检索质量: query="${query.substring(0, 50)}...", groundTruthCount=${groundTruthDocumentIds.length}`);
        const results = await this.ragService.retrieve(params);
        const retrievedIds = results.map((r) => r.id);
        const scores = results.map((r) => r.score);
        const recallAtK = this.calculateRecallAtK(retrievedIds, groundTruthDocumentIds, [1, 5, 10]);
        const mrr = this.calculateMRR(retrievedIds, groundTruthDocumentIds);
        const ndcg = this.calculateNDCGAtK(retrievedIds, groundTruthDocumentIds, scores, [1, 5, 10]);
        return {
            recallAtK,
            mrr,
            ndcg,
            retrievedIds,
            scores,
        };
    }
    async evaluateChunkRetrieval(query, params, groundTruthChunkIds) {
        this.logger.debug(`[RAGEvaluation] 评估 Chunk 检索质量: query="${query.substring(0, 50)}...", groundTruthCount=${groundTruthChunkIds.length}`);
        const results = await this.chunkRetrievalService.retrieve(params);
        const retrievedIds = results.map((r) => r.id);
        const scores = results.map((r) => { var _a, _b, _c; return (_c = (_b = (_a = r.rerankScore) !== null && _a !== void 0 ? _a : r.hybridScore) !== null && _b !== void 0 ? _b : r.similarity) !== null && _c !== void 0 ? _c : 0; });
        const recallAtK = this.calculateRecallAtK(retrievedIds, groundTruthChunkIds, [1, 5, 10]);
        const mrr = this.calculateMRR(retrievedIds, groundTruthChunkIds);
        const ndcg = this.calculateNDCGAtK(retrievedIds, groundTruthChunkIds, scores, [1, 5, 10]);
        return { recallAtK, mrr, ndcg, retrievedIds, scores };
    }
    async evaluateChunkBatch(testCases) {
        this.logger.log(`[RAGEvaluation] 批量评估 Chunk: testCasesCount=${testCases.length}`);
        const allRecallAtK = { 1: [], 5: [], 10: [] };
        const allMRR = [];
        const allNDCGAtK = { 1: [], 5: [], 10: [] };
        const perQueryResults = [];
        for (const testCase of testCases) {
            const result = await this.evaluateChunkRetrieval(testCase.query, testCase.params, testCase.groundTruthChunkIds);
            for (const k of [1, 5, 10]) {
                allRecallAtK[k].push(result.recallAtK[k]);
                allNDCGAtK[k].push(result.ndcg[k]);
            }
            allMRR.push(result.mrr);
            perQueryResults.push({
                query: testCase.query,
                recallAtK: result.recallAtK,
                mrr: result.mrr,
                ndcg: result.ndcg,
            });
        }
        const averageRecallAtK = {};
        const averageNDCGAtK = {};
        for (const k of [1, 5, 10]) {
            averageRecallAtK[k] =
                allRecallAtK[k].reduce((sum, val) => sum + val, 0) / (allRecallAtK[k].length || 1);
            averageNDCGAtK[k] =
                allNDCGAtK[k].reduce((sum, val) => sum + val, 0) / (allNDCGAtK[k].length || 1);
        }
        const averageMRR = allMRR.reduce((sum, val) => sum + val, 0) / (allMRR.length || 1);
        return { averageRecallAtK, averageMRR, averageNDCGAtK, perQueryResults };
    }
    async evaluateBatch(testCases) {
        this.logger.log(`[RAGEvaluation] 批量评估: testCasesCount=${testCases.length}`);
        const allRecallAtK = { 1: [], 5: [], 10: [] };
        const allMRR = [];
        const allNDCGAtK = { 1: [], 5: [], 10: [] };
        const perQueryResults = [];
        for (const testCase of testCases) {
            const result = await this.evaluateRetrieval(testCase.query, testCase.params, testCase.groundTruthDocumentIds);
            for (const k of [1, 5, 10]) {
                allRecallAtK[k].push(result.recallAtK[k]);
                allNDCGAtK[k].push(result.ndcg[k]);
            }
            allMRR.push(result.mrr);
            perQueryResults.push({
                query: testCase.query,
                recallAtK: result.recallAtK,
                mrr: result.mrr,
                ndcg: result.ndcg,
            });
        }
        const averageRecallAtK = {};
        const averageNDCGAtK = {};
        for (const k of [1, 5, 10]) {
            averageRecallAtK[k] =
                allRecallAtK[k].reduce((sum, val) => sum + val, 0) / allRecallAtK[k].length;
            averageNDCGAtK[k] =
                allNDCGAtK[k].reduce((sum, val) => sum + val, 0) / allNDCGAtK[k].length;
        }
        const averageMRR = allMRR.reduce((sum, val) => sum + val, 0) / allMRR.length;
        this.logger.log(`[RAGEvaluation] 批量评估完成: avgRecall@5=${averageRecallAtK[5].toFixed(3)}, avgMRR=${averageMRR.toFixed(3)}`);
        return {
            averageRecallAtK,
            averageMRR,
            averageNDCGAtK,
            perQueryResults,
        };
    }
    calculateRecallAtK(retrievedIds, groundTruthIds, kValues) {
        const recallAtK = {};
        for (const k of kValues) {
            const topKIds = retrievedIds.slice(0, k);
            const relevantRetrieved = topKIds.filter((id) => groundTruthIds.includes(id)).length;
            recallAtK[k] = groundTruthIds.length > 0 ? relevantRetrieved / groundTruthIds.length : 0;
        }
        return recallAtK;
    }
    calculateMRR(retrievedIds, groundTruthIds) {
        if (groundTruthIds.length === 0) {
            return 0;
        }
        for (let i = 0; i < retrievedIds.length; i++) {
            if (groundTruthIds.includes(retrievedIds[i])) {
                return 1 / (i + 1);
            }
        }
        return 0;
    }
    calculateNDCGAtK(retrievedIds, groundTruthIds, scores, kValues) {
        const ndcgAtK = {};
        const relevance = retrievedIds.map((id) => (groundTruthIds.includes(id) ? 1 : 0));
        for (const k of kValues) {
            const topKRelevance = relevance.slice(0, k);
            const topKScores = scores.slice(0, k);
            let dcg = 0;
            for (let i = 0; i < topKRelevance.length; i++) {
                dcg += topKRelevance[i] / Math.log2(i + 2);
            }
            const idealRelevance = [...groundTruthIds]
                .slice(0, k)
                .map(() => 1)
                .concat(new Array(Math.max(0, k - groundTruthIds.length)).fill(0));
            let idcg = 0;
            for (let i = 0; i < idealRelevance.length; i++) {
                idcg += idealRelevance[i] / Math.log2(i + 2);
            }
            ndcgAtK[k] = idcg > 0 ? dcg / idcg : 0;
        }
        return ndcgAtK;
    }
    async evaluateGateAccuracy(testSet) {
        this.logger.log(`[GateEvaluation] 开始评估 Gate 准确率: testSetSize=${testSet.length}`);
        const results = [];
        for (const testCase of testSet) {
            const predicted = {
                gate_result: 'ALLOW',
                confidence: 0.85,
                evidence_refs: [{}, {}],
                alternatives: [],
            };
            const actual = testCase.expectedGateResult;
            results.push({
                requestId: testCase.requestId,
                predicted: predicted.gate_result,
                expected: actual,
                correct: predicted.gate_result === actual,
                confidence: predicted.confidence,
                evidenceCount: predicted.evidence_refs.length,
                hasAlternatives: predicted.alternatives.length > 0,
            });
        }
        const correctCount = results.filter((r) => r.correct).length;
        const accuracy = correctCount / results.length;
        const avgConfidence = this.avg(results.map((r) => r.confidence));
        const avgEvidenceCount = this.avg(results.map((r) => r.evidenceCount));
        const alternativesCoverage = results.filter((r) => r.hasAlternatives).length / results.length;
        this.logger.log(`[GateEvaluation] 评估完成: accuracy=${accuracy.toFixed(3)}, avgConfidence=${avgConfidence.toFixed(3)}, avgEvidence=${avgEvidenceCount.toFixed(1)}`);
        return {
            accuracy,
            avgConfidence,
            avgEvidenceCount,
            alternativesCoverage,
            perCaseResults: results,
        };
    }
    async evaluateEvidenceCoverage(decisionLogs) {
        this.logger.log(`[GateEvaluation] 评估证据覆盖率: logsCount=${decisionLogs.length}`);
        const stats = decisionLogs.map((log) => {
            const ragEvidence = log.evidenceRefs.filter((e) => e.source.startsWith('RAG'));
            const toolEvidence = log.evidenceRefs.filter((e) => e.source.startsWith('Tool'));
            const ragCount = ragEvidence.length;
            const toolCount = toolEvidence.length;
            const sufficient = ragCount >= 2 && toolCount >= 1;
            return {
                requestId: log.requestId,
                ragCount,
                toolCount,
                sufficient,
            };
        });
        const sufficientCount = stats.filter((s) => s.sufficient).length;
        const coverageRate = sufficientCount / stats.length;
        const avgRagEvidence = this.avg(stats.map((s) => s.ragCount));
        const avgToolEvidence = this.avg(stats.map((s) => s.toolCount));
        const insufficientCases = stats.filter((s) => !s.sufficient);
        this.logger.log(`[GateEvaluation] 证据覆盖率: ${coverageRate.toFixed(3)} (${sufficientCount}/${stats.length})`);
        return {
            coverageRate,
            avgRagEvidence,
            avgToolEvidence,
            insufficientCases,
        };
    }
    async evaluateAlternativesQuality(testSet) {
        this.logger.log(`[GateEvaluation] 评估替代方案质量: testSetSize=${testSet.length}`);
        const withAlternatives = testSet.filter((t) => t.alternatives.length > 0);
        const provisionRate = withAlternatives.length / testSet.length;
        const avgAlternativesCount = this.avg(testSet.map((t) => t.alternatives.length));
        let typeMatchRate;
        if (testSet.some((t) => t.expectedAlternatives)) {
            const matchCount = testSet.filter((t) => {
                if (!t.expectedAlternatives)
                    return false;
                const actualTypes = new Set(t.alternatives.map((a) => a.type));
                const expectedTypes = new Set(t.expectedAlternatives.map((e) => e.type));
                return [...expectedTypes].some((type) => actualTypes.has(type));
            }).length;
            typeMatchRate = matchCount / testSet.filter((t) => t.expectedAlternatives).length;
        }
        this.logger.log(`[GateEvaluation] 替代方案质量: provisionRate=${provisionRate.toFixed(3)}, avgCount=${avgAlternativesCount.toFixed(1)}`);
        return {
            provisionRate,
            avgAlternativesCount,
            typeMatchRate,
        };
    }
    avg(values) {
        if (values.length === 0)
            return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
};
exports.RAGEvaluationService = RAGEvaluationService;
exports.RAGEvaluationService = RAGEvaluationService = RAGEvaluationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rag_service_1.RagService,
        chunk_retrieval_service_1.ChunkRetrievalService])
], RAGEvaluationService);
//# sourceMappingURL=rag-evaluation.service.js.map