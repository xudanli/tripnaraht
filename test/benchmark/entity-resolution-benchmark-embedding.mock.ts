/**
 * Golden Set 基准用语义 Mock Embedding（CI 确定性，模拟 BGE 聚类行为）。
 */

import type { EmbeddingService } from '../../src/places/services/embedding.service';

type SemanticCluster =
  | 'iceland'
  | 'svalbard'
  | 'tibet'
  | 'us_ny'
  | 'us_la'
  | 'japan'
  | 'korea'
  | 'china_coastal'
  | 'china_inland'
  | 'europe'
  | 'nepal'
  | 'switzerland'
  | 'thailand'
  | 'generic';

const CLUSTER_VECTORS: Record<SemanticCluster, number[]> = {
  iceland: [1, 0, 0, 0, 0, 0, 0, 0],
  svalbard: [0, 1, 0, 0, 0, 0, 0, 0],
  tibet: [0, 0, 1, 0, 0, 0, 0, 0],
  us_ny: [0, 0, 0, 1, 0, 0, 0, 0],
  us_la: [0, 0, 0, 0.85, 0.15, 0, 0, 0],
  japan: [0, 0, 0, 0, 1, 0, 0, 0],
  korea: [0, 0, 0, 0, 0, 1, 0, 0],
  china_coastal: [0, 0, 0, 0, 0, 0, 1, 0],
  china_inland: [0, 0, 0, 0, 0, 0, 0.9, 0.1],
  europe: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9],
  nepal: [0.05, 0.05, 0.7, 0.05, 0.05, 0.05, 0.05, 0.7],
  switzerland: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.95],
  thailand: [0.05, 0.05, 0.05, 0.05, 0.6, 0.05, 0.05, 0.2],
  generic: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
};

function detectCluster(text: string): SemanticCluster {
  const t = text.toLowerCase();

  if (/西峡湾|westfjord|冰岛|iceland|雷克雅|reykjav|vik|f路|高地.*冰|黑沙滩|瀑布.*冰/.test(t)) {
    return 'iceland';
  }
  if (/斯瓦尔巴|svalbard|朗伊尔|longyear|北极熊|polar|极夜|防熊/.test(t)) {
    return 'svalbard';
  }
  if (/林芝|西藏|nyingchi|桃花|鲁朗|高原自驾/.test(t)) {
    return 'tibet';
  }
  if (/自由女神|statue|liberty|nyc|纽约|大苹果|new york|central area hotel/.test(t)) {
    return 'us_ny';
  }
  if (/la\s|洛杉矶|los angeles/.test(t) && !/自由女神|statue|纽约|nyc/.test(t)) {
    return 'us_la';
  }
  if (/东京|大阪|京都|北海道|新宿|富士|日本|hokkaido|kamakura/.test(t)) {
    return 'japan';
  }
  if (/首尔|釜山|济州|korea|seoul/.test(t)) {
    return 'korea';
  }
  if (/三亚|厦门|青岛|魔都|上海/.test(t)) {
    return 'china_coastal';
  }
  if (/北京|帝都|故宫|西安|成都|重庆|广州|深圳/.test(t)) {
    return 'china_inland';
  }
  if (/巴黎|伦敦|罗马|米兰|巴塞罗那|阿姆斯特丹|柏林|eiffel|paris/.test(t)) {
    return 'europe';
  }
  if (/博卡拉|加德满都|尼泊尔|pokhara/.test(t)) {
    return 'nepal';
  }
  if (/瑞士|苏黎世|日内瓦|因特拉肯|interlaken|少女峰/.test(t)) {
    return 'switzerland';
  }
  if (/清迈|曼谷|普吉|chiangmai|thailand/.test(t)) {
    return 'thailand';
  }

  return 'generic';
}

export function createBenchmarkEmbeddingService(): EmbeddingService {
  return {
    generateEmbedding: jest.fn(async (text: string) => {
      const cluster = detectCluster(text);
      return [...CLUSTER_VECTORS[cluster]];
    }),
    embedTextsOrdered: jest.fn(async (texts: string[]) =>
      Promise.all(texts.map(async (t) => createBenchmarkEmbeddingService().generateEmbedding(t))),
    ),
  } as unknown as EmbeddingService;
}
