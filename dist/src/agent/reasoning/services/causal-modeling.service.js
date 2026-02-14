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
var CausalModelingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CausalModelingService = void 0;
const common_1 = require("@nestjs/common");
const graph_reasoning_service_1 = require("./graph-reasoning.service");
let CausalModelingService = CausalModelingService_1 = class CausalModelingService {
    constructor(graphReasoningService) {
        this.graphReasoningService = graphReasoningService;
        this.logger = new common_1.Logger(CausalModelingService_1.name);
    }
    async identifyCausalRelations(graph, options) {
        var _a;
        this.logger.debug(`Identifying causal relations in graph with ${graph.nodes.size} nodes`);
        const relations = [];
        const derivationEdges = Array.from(graph.edges.values())
            .filter(edge => edge.type === 'DERIVATION');
        for (const edge of derivationEdges) {
            const causeNode = graph.nodes.get(edge.from);
            const effectNode = graph.nodes.get(edge.to);
            if (!causeNode || !effectNode) {
                continue;
            }
            const relationType = this.determineCausalRelationType(causeNode, effectNode, edge);
            const strength = this.determineCausalStrength(edge, causeNode, effectNode);
            const confidence = this.calculateCausalConfidence(edge, causeNode, effectNode);
            if ((options === null || options === void 0 ? void 0 : options.minConfidence) && confidence < options.minConfidence) {
                continue;
            }
            if ((options === null || options === void 0 ? void 0 : options.minStrength) &&
                this.compareStrength(strength, options.minStrength) < 0) {
                continue;
            }
            const evidence = this.findRelatedEvidence(graph, edge.from, edge.to);
            const relation = {
                id: `causal_${edge.id}`,
                cause: edge.from,
                effect: edge.to,
                type: relationType,
                strength,
                confidence,
                evidence: evidence.map(n => n.id),
                explanation: this.generateCausalExplanation(causeNode, effectNode, relationType, strength),
                metadata: {
                    correlation: edge.weight || 0.5,
                    temporalOrder: this.determineTemporalOrder(causeNode, effectNode),
                    mechanism: (_a = edge.metadata) === null || _a === void 0 ? void 0 : _a.reasoning,
                },
            };
            relations.push(relation);
        }
        return relations;
    }
    async buildCausalChains(graph, relations, options) {
        this.logger.debug(`Building causal chains from ${relations.length} relations`);
        const chains = [];
        const maxLength = (options === null || options === void 0 ? void 0 : options.maxChainLength) || 5;
        const rootCauses = relations
            .filter(r => !relations.some(other => other.effect === r.cause))
            .map(r => r.cause);
        for (const rootCause of rootCauses) {
            const chainsFromRoot = this.buildChainsFromNode(graph, relations, rootCause, maxLength, options);
            chains.push(...chainsFromRoot);
        }
        return chains;
    }
    buildChainsFromNode(graph, relations, startNodeId, maxLength, options) {
        const chains = [];
        const buildChain = (currentNodeId, currentChain, currentRelations, depth) => {
            if (depth >= maxLength) {
                return;
            }
            if (currentChain.includes(currentNodeId)) {
                return;
            }
            const newChain = [...currentChain, currentNodeId];
            const outgoingRelations = relations.filter(r => r.cause === currentNodeId);
            if (outgoingRelations.length === 0) {
                if (newChain.length > 1) {
                    const chainStrength = this.calculateChainStrength(currentRelations);
                    const chainConfidence = this.calculateChainConfidence(currentRelations);
                    if ((options === null || options === void 0 ? void 0 : options.minConfidence) && chainConfidence < options.minConfidence) {
                        return;
                    }
                    if ((options === null || options === void 0 ? void 0 : options.minStrength) &&
                        this.compareStrength(chainStrength, options.minStrength) < 0) {
                        return;
                    }
                    chains.push({
                        id: `chain_${chains.length}_${Date.now()}`,
                        nodes: newChain,
                        relations: currentRelations,
                        strength: chainStrength,
                        confidence: chainConfidence,
                        explanation: this.generateChainExplanation(graph, newChain, currentRelations),
                    });
                }
                return;
            }
            for (const relation of outgoingRelations) {
                buildChain(relation.effect, newChain, [...currentRelations, relation], depth + 1);
            }
        };
        buildChain(startNodeId, [], [], 0);
        return chains;
    }
    async reason(graph, targetNodeId, options) {
        this.logger.debug(`Executing causal reasoning${targetNodeId ? ` for node ${targetNodeId}` : ''}`);
        const causalRelations = await this.identifyCausalRelations(graph, options);
        const causalChains = await this.buildCausalChains(graph, causalRelations, options);
        const rootCauses = this.findRootCauses(graph, causalRelations);
        const effects = targetNodeId
            ? [graph.nodes.get(targetNodeId)].filter(Boolean)
            : this.findEffects(graph, causalRelations);
        const overallConfidence = causalChains.length > 0
            ? causalChains.reduce((sum, chain) => sum + chain.confidence, 0) / causalChains.length
            : causalRelations.length > 0
                ? causalRelations.reduce((sum, rel) => sum + rel.confidence, 0) / causalRelations.length
                : 0.5;
        const explanation = this.generateReasoningExplanation(rootCauses, effects, causalChains, causalRelations);
        return {
            graph,
            causalRelations,
            causalChains,
            rootCauses,
            effects,
            overallConfidence,
            explanation,
        };
    }
    determineCausalRelationType(causeNode, effectNode, edge) {
        if (edge.weight && edge.weight > 0.8) {
            return 'DIRECT_CAUSE';
        }
        else if (edge.weight && edge.weight > 0.5) {
            return 'INDIRECT_CAUSE';
        }
        else {
            return 'CONTRIBUTING_FACTOR';
        }
    }
    determineCausalStrength(edge, causeNode, effectNode) {
        var _a, _b;
        const weight = edge.weight || 0.5;
        const causeConfidence = ((_a = causeNode.metadata) === null || _a === void 0 ? void 0 : _a.confidence) || 0.5;
        const effectConfidence = ((_b = effectNode.metadata) === null || _b === void 0 ? void 0 : _b.confidence) || 0.5;
        const combined = weight * causeConfidence * effectConfidence;
        if (combined > 0.8)
            return 'VERY_STRONG';
        if (combined > 0.6)
            return 'STRONG';
        if (combined > 0.4)
            return 'MODERATE';
        return 'WEAK';
    }
    calculateCausalConfidence(edge, causeNode, effectNode) {
        var _a, _b, _c;
        const edgeConfidence = ((_a = edge.metadata) === null || _a === void 0 ? void 0 : _a.confidence) || 0.5;
        const causeConfidence = ((_b = causeNode.metadata) === null || _b === void 0 ? void 0 : _b.confidence) || 0.5;
        const effectConfidence = ((_c = effectNode.metadata) === null || _c === void 0 ? void 0 : _c.confidence) || 0.5;
        return (edgeConfidence + causeConfidence + effectConfidence) / 3;
    }
    compareStrength(a, b) {
        const strengthOrder = ['WEAK', 'MODERATE', 'STRONG', 'VERY_STRONG'];
        return strengthOrder.indexOf(a) - strengthOrder.indexOf(b);
    }
    findRelatedEvidence(graph, causeId, effectId) {
        const evidence = [];
        for (const edge of graph.edges.values()) {
            if (edge.type === 'DATA_SOURCE') {
                if (edge.to === causeId || edge.to === effectId) {
                    const evidenceNode = graph.nodes.get(edge.from);
                    if (evidenceNode && evidenceNode.type === 'EVIDENCE') {
                        evidence.push(evidenceNode);
                    }
                }
            }
        }
        return evidence;
    }
    determineTemporalOrder(causeNode, effectNode) {
        return 'BEFORE';
    }
    calculateChainStrength(relations) {
        if (relations.length === 0)
            return 'WEAK';
        const strengths = relations.map(r => r.strength);
        const strengthValues = strengths.map(s => {
            switch (s) {
                case 'VERY_STRONG': return 4;
                case 'STRONG': return 3;
                case 'MODERATE': return 2;
                case 'WEAK': return 1;
            }
        });
        const avgStrength = strengthValues.reduce((sum, v) => sum + v, 0) / strengthValues.length;
        if (avgStrength >= 3.5)
            return 'VERY_STRONG';
        if (avgStrength >= 2.5)
            return 'STRONG';
        if (avgStrength >= 1.5)
            return 'MODERATE';
        return 'WEAK';
    }
    calculateChainConfidence(relations) {
        if (relations.length === 0)
            return 0;
        const confidences = relations.map(r => r.confidence);
        return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    }
    findRootCauses(graph, relations) {
        const causeIds = new Set(relations.map(r => r.cause));
        const effectIds = new Set(relations.map(r => r.effect));
        const rootCauseIds = Array.from(causeIds).filter(id => !effectIds.has(id));
        return rootCauseIds
            .map(id => graph.nodes.get(id))
            .filter(Boolean);
    }
    findEffects(graph, relations) {
        const causeIds = new Set(relations.map(r => r.cause));
        const effectIds = new Set(relations.map(r => r.effect));
        const finalEffectIds = Array.from(effectIds).filter(id => !causeIds.has(id));
        return finalEffectIds
            .map(id => graph.nodes.get(id))
            .filter(Boolean);
    }
    generateCausalExplanation(causeNode, effectNode, type, strength) {
        const typeMap = {
            DIRECT_CAUSE: '直接导致',
            INDIRECT_CAUSE: '间接影响',
            CONTRIBUTING_FACTOR: '贡献因素',
            CONFOUNDING_FACTOR: '混淆因素',
        };
        return `${causeNode.label} ${typeMap[type]} ${effectNode.label}（${strength}）`;
    }
    generateChainExplanation(graph, nodeIds, relations) {
        const nodeLabels = nodeIds.map(id => { var _a; return ((_a = graph.nodes.get(id)) === null || _a === void 0 ? void 0 : _a.label) || id; });
        return `因果链：${nodeLabels.join(' → ')}`;
    }
    generateReasoningExplanation(rootCauses, effects, chains, relations) {
        const parts = [];
        if (rootCauses.length > 0) {
            parts.push(`识别出 ${rootCauses.length} 个根本原因`);
        }
        if (effects.length > 0) {
            parts.push(`${effects.length} 个结果`);
        }
        if (chains.length > 0) {
            parts.push(`构建了 ${chains.length} 条因果链`);
        }
        if (relations.length > 0) {
            parts.push(`识别了 ${relations.length} 个因果关系`);
        }
        return parts.join('，') || '因果推理完成';
    }
};
exports.CausalModelingService = CausalModelingService;
exports.CausalModelingService = CausalModelingService = CausalModelingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [graph_reasoning_service_1.GraphReasoningService])
], CausalModelingService);
//# sourceMappingURL=causal-modeling.service.js.map