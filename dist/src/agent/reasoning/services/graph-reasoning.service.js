"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GraphReasoningService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphReasoningService = void 0;
const common_1 = require("@nestjs/common");
let GraphReasoningService = GraphReasoningService_1 = class GraphReasoningService {
    constructor() {
        this.logger = new common_1.Logger(GraphReasoningService_1.name);
    }
    createGraph(context) {
        const graph = {
            nodes: new Map(),
            edges: new Map(),
            rootNodes: [],
            leafNodes: [],
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                context,
            },
        };
        return graph;
    }
    addNode(graph, node) {
        graph.nodes.set(node.id, node);
        this.updateRootAndLeafNodes(graph);
    }
    addEdge(graph, edge) {
        if (!graph.nodes.has(edge.from)) {
            throw new Error(`Source node ${edge.from} not found`);
        }
        if (!graph.nodes.has(edge.to)) {
            throw new Error(`Target node ${edge.to} not found`);
        }
        graph.edges.set(edge.id, edge);
        this.updateRootAndLeafNodes(graph);
    }
    updateRootAndLeafNodes(graph) {
        const nodeIds = Array.from(graph.nodes.keys());
        const hasIncoming = new Set();
        const hasOutgoing = new Set();
        for (const edge of graph.edges.values()) {
            hasIncoming.add(edge.to);
            hasOutgoing.add(edge.from);
        }
        graph.rootNodes = nodeIds.filter(id => !hasIncoming.has(id));
        graph.leafNodes = nodeIds.filter(id => !hasOutgoing.has(id));
    }
    queryNodes(graph, options) {
        let nodes = Array.from(graph.nodes.values());
        if ((options === null || options === void 0 ? void 0 : options.nodeTypes) && options.nodeTypes.length > 0) {
            nodes = nodes.filter(node => options.nodeTypes.includes(node.type));
        }
        if ((options === null || options === void 0 ? void 0 : options.minConfidence) !== undefined) {
            nodes = nodes.filter(node => { var _a; return (((_a = node.metadata) === null || _a === void 0 ? void 0 : _a.confidence) || 1.0) >= options.minConfidence; });
        }
        return nodes;
    }
    queryEdges(graph, options) {
        let edges = Array.from(graph.edges.values());
        if ((options === null || options === void 0 ? void 0 : options.edgeTypes) && options.edgeTypes.length > 0) {
            edges = edges.filter(edge => options.edgeTypes.includes(edge.type));
        }
        if (options === null || options === void 0 ? void 0 : options.startNodeId) {
            edges = edges.filter(edge => edge.from === options.startNodeId);
        }
        if (options === null || options === void 0 ? void 0 : options.endNodeId) {
            edges = edges.filter(edge => edge.to === options.endNodeId);
        }
        return edges;
    }
    traverseGraph(graph, startNodeId, options) {
        const results = [];
        const visited = new Set();
        const maxDepth = (options === null || options === void 0 ? void 0 : options.maxDepth) || 10;
        const dfs = (currentNodeId, path, currentWeight, currentConfidence, depth) => {
            var _a, _b;
            if (depth > maxDepth) {
                return;
            }
            if (visited.has(currentNodeId)) {
                return;
            }
            const node = graph.nodes.get(currentNodeId);
            if (!node) {
                return;
            }
            const nodeConfidence = ((_a = node.metadata) === null || _a === void 0 ? void 0 : _a.confidence) || 1.0;
            const minConfidence = (options === null || options === void 0 ? void 0 : options.minConfidence) || 0;
            if (nodeConfidence < minConfidence) {
                return;
            }
            const newPath = [...path, currentNodeId];
            const newConfidence = currentConfidence * nodeConfidence;
            if (graph.leafNodes.includes(currentNodeId) ||
                ((options === null || options === void 0 ? void 0 : options.endNodeId) && currentNodeId === options.endNodeId)) {
                const pathNodes = newPath.map(id => graph.nodes.get(id)).filter(Boolean);
                const pathEdges = this.getEdgesForPath(graph, newPath);
                results.push({
                    path: newPath,
                    nodes: pathNodes,
                    edges: pathEdges,
                    totalWeight: currentWeight,
                    confidence: newConfidence,
                });
                return;
            }
            visited.add(currentNodeId);
            const outgoingEdges = Array.from(graph.edges.values())
                .filter(edge => edge.from === currentNodeId);
            for (const edge of outgoingEdges) {
                if ((options === null || options === void 0 ? void 0 : options.edgeTypes) &&
                    options.edgeTypes.length > 0 &&
                    !options.edgeTypes.includes(edge.type)) {
                    continue;
                }
                const edgeWeight = edge.weight || 1.0;
                const edgeConfidence = ((_b = edge.metadata) === null || _b === void 0 ? void 0 : _b.confidence) || 1.0;
                dfs(edge.to, newPath, currentWeight + edgeWeight, newConfidence * edgeConfidence, depth + 1);
            }
            visited.delete(currentNodeId);
        };
        dfs(startNodeId, [], 0, 1.0, 0);
        return results;
    }
    getEdgesForPath(graph, path) {
        const edges = [];
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const edge = Array.from(graph.edges.values())
                .find(e => e.from === from && e.to === to);
            if (edge) {
                edges.push(edge);
            }
        }
        return edges;
    }
    async reason(graph, startNodeIds, options) {
        this.logger.debug(`Executing graph reasoning with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);
        const startNodes = startNodeIds || graph.rootNodes;
        if (startNodes.length === 0) {
            throw new Error('No start nodes specified and no root nodes found');
        }
        const allPaths = [];
        for (const startNodeId of startNodes) {
            const paths = this.traverseGraph(graph, startNodeId, options);
            allPaths.push(...paths);
        }
        const conclusionNodes = this.queryNodes(graph, {
            nodeTypes: ['JUDGMENT'],
            minConfidence: options === null || options === void 0 ? void 0 : options.minConfidence,
        });
        const evidenceNodes = this.queryNodes(graph, {
            nodeTypes: ['EVIDENCE'],
            minConfidence: options === null || options === void 0 ? void 0 : options.minConfidence,
        });
        const maxConfidence = allPaths.length > 0
            ? Math.max(...allPaths.map(p => p.confidence))
            : 0.5;
        const explanation = this.generateExplanation(graph, allPaths, conclusionNodes, evidenceNodes);
        return {
            graph,
            reasoningPath: allPaths,
            conclusions: conclusionNodes,
            evidence: evidenceNodes,
            confidence: maxConfidence,
            explanation,
        };
    }
    generateExplanation(graph, paths, conclusions, evidence) {
        const parts = [];
        if (conclusions.length > 0) {
            parts.push(`基于 ${evidence.length} 个证据节点，得出 ${conclusions.length} 个判断结论`);
        }
        if (paths.length > 0) {
            const topPath = paths.sort((a, b) => b.confidence - a.confidence)[0];
            parts.push(`主要推理路径包含 ${topPath.nodes.length} 个节点，置信度 ${(topPath.confidence * 100).toFixed(1)}%`);
        }
        return parts.join('。') || '图推理完成';
    }
    findPaths(graph, fromNodeId, toNodeId, options) {
        return this.traverseGraph(graph, fromNodeId, {
            ...options,
            endNodeId: toNodeId,
        });
    }
    getNeighbors(graph, nodeId, direction = 'both') {
        const neighborIds = new Set();
        if (direction === 'incoming' || direction === 'both') {
            for (const edge of graph.edges.values()) {
                if (edge.to === nodeId) {
                    neighborIds.add(edge.from);
                }
            }
        }
        if (direction === 'outgoing' || direction === 'both') {
            for (const edge of graph.edges.values()) {
                if (edge.from === nodeId) {
                    neighborIds.add(edge.to);
                }
            }
        }
        return Array.from(neighborIds)
            .map(id => graph.nodes.get(id))
            .filter(Boolean);
    }
};
exports.GraphReasoningService = GraphReasoningService;
exports.GraphReasoningService = GraphReasoningService = GraphReasoningService_1 = __decorate([
    (0, common_1.Injectable)()
], GraphReasoningService);
//# sourceMappingURL=graph-reasoning.service.js.map