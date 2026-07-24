import type {
  CanonicalTravelGraph,
  TravelGraphDayNode,
  TravelGraphEdge,
  TravelGraphNode,
  TravelGraphPoiNode,
} from '../contracts/canonical-travel-graph.types';

function dayIndexOfNode(node: TravelGraphNode): number | undefined {
  if (node.kind === 'DAY') return node.dayIndex;
  return node.dayIndex;
}

function recomputeStats(graph: CanonicalTravelGraph): CanonicalTravelGraph['stats'] {
  const poiNodes = graph.nodes.filter((n) => n.kind === 'POI');
  const poiResolved = poiNodes.filter(
    (n) => n.canonical?.poiId || (n.kind === 'POI' && (n as TravelGraphPoiNode).poiId),
  ).length;
  const routeNodes = graph.nodes.filter((n) => n.kind === 'ROUTE');
  const segmentNodes = graph.nodes.filter((n) => n.kind === 'ROUTE_SEGMENT');

  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    poiResolved,
    poiUnresolved: poiNodes.length - poiResolved,
    routeTemplatesResolved: routeNodes.length,
    routeTemplatesTotal: routeNodes.length,
    routeSegmentsResolved: segmentNodes.length,
    routeSegmentsTotal: segmentNodes.length,
    bookingRequired: graph.bookings.filter((b) => b.required).length,
    dependencySatisfied: graph.dependencies.filter((d) => d.satisfied).length,
    dependencyTotal: graph.dependencies.length,
  };
}

/**
 * 增量合并：保留未受影响天的 Graph 切片，替换 affectedDayIndices 对应天。
 */
export function mergeIncrementalTravelGraph(params: {
  previous: CanonicalTravelGraph;
  incremental: CanonicalTravelGraph;
  affectedDayIndices: number[];
}): CanonicalTravelGraph {
  const affected = new Set(params.affectedDayIndices);

  const preservedDayNodes = params.previous.days.filter((d) => !affected.has(d.dayIndex));
  const replacedDayNodes = params.incremental.days.filter((d) => affected.has(d.dayIndex));
  const days: TravelGraphDayNode[] = [...preservedDayNodes, ...replacedDayNodes].sort(
    (a, b) => a.dayIndex - b.dayIndex,
  );

  const preservedNodes = params.previous.nodes.filter((node) => {
    const dayIndex = dayIndexOfNode(node);
    if (dayIndex === undefined) return node.kind !== 'DAY';
    return !affected.has(dayIndex);
  });

  const incrementalNodes = params.incremental.nodes.filter((node) => {
    const dayIndex = dayIndexOfNode(node);
    if (dayIndex === undefined) return false;
    return affected.has(dayIndex);
  });

  const nodeIds = new Set<string>();
  const nodes: TravelGraphNode[] = [];
  for (const node of [...preservedNodes, ...incrementalNodes]) {
    if (nodeIds.has(node.nodeId)) continue;
    nodeIds.add(node.nodeId);
    nodes.push(node);
  }

  const preservedEdges = params.previous.edges.filter(
    (edge) => nodeIds.has(edge.from.nodeId) && nodeIds.has(edge.to.nodeId),
  );

  const incrementalEdgeIds = new Set(preservedEdges.map((e) => e.edgeId));
  const incrementalEdges = params.incremental.edges.filter((edge) => {
    if (incrementalEdgeIds.has(edge.edgeId)) return false;
    return nodeIds.has(edge.from.nodeId) && nodeIds.has(edge.to.nodeId);
  });

  const edges: TravelGraphEdge[] = [...preservedEdges, ...incrementalEdges];

  const dependencies = [
    ...params.previous.dependencies.filter((dep) => {
      const subject = nodes.find((n) => n.nodeId === dep.subjectNodeId);
      const dayIndex = subject ? dayIndexOfNode(subject) : undefined;
      return dayIndex === undefined || !affected.has(dayIndex);
    }),
    ...params.incremental.dependencies.filter((dep) => {
      const subject = nodes.find((n) => n.nodeId === dep.subjectNodeId);
      const dayIndex = subject ? dayIndexOfNode(subject) : undefined;
      return dayIndex !== undefined && affected.has(dayIndex);
    }),
  ];

  const constraints = [...params.previous.constraints, ...params.incremental.constraints];
  const bookings = [
    ...params.previous.bookings.filter((b) => {
      const dayIndex = b.dayIndex;
      return dayIndex === undefined || !affected.has(dayIndex);
    }),
    ...params.incremental.bookings.filter((b) => b.dayIndex !== undefined && affected.has(b.dayIndex)),
  ];

  const graph: CanonicalTravelGraph = {
    ...params.incremental,
    graphId: params.previous.graphId,
    days,
    nodes,
    edges,
    dependencies,
    constraints,
    bookings,
    bindings: {
      ...params.previous.bindings,
      ...params.incremental.bindings,
    },
    stats: {
      nodeCount: 0,
      edgeCount: 0,
      poiResolved: 0,
      poiUnresolved: 0,
      routeTemplatesResolved: 0,
      routeTemplatesTotal: 0,
      routeSegmentsResolved: 0,
      routeSegmentsTotal: 0,
      bookingRequired: 0,
      dependencySatisfied: 0,
      dependencyTotal: 0,
    },
  };

  graph.stats = recomputeStats(graph);
  return graph;
}
