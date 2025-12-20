// src/agent/services/actions/places.actions.ts
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { PlacesService } from '../../../places/places.service';
import { VectorSearchService } from '../../../places/services/vector-search.service';
import { EntityResolutionService } from '../../../places/services/entity-resolution.service';

/**
 * 提取must-have POI列表（从用户输入中）
 */
function extractMustHavePois(userInput: string): string[] {
  if (!userInput || userInput.trim().length === 0) {
    return [];
  }

  const pois: string[] = [];
  const input = userInput;

  // 提取"包含"、"去"、"参观"、"游览"等关键词后的POI
  const patterns = [
    /包含\s*([^，,。.\n]+)/g,
    /去\s*([^，,。.\n]+)/g,
    /参观\s*([^，,。.\n]+)/g,
    /游览\s*([^，,。.\n]+)/g,
    /包括\s*([^，,。.\n]+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const poiName = match[1].trim();
      if (poiName && !poiName.match(/^\d+/) && poiName.length > 1) {
        pois.push(poiName);
      }
    }
  }

  // 提取逗号/顿号分隔的POI列表
  const commaSeparated = input.match(/([^，,。.\n]+[、,，]([^，,。.\n]+[、,，])*[^，,。.\n]+)/);
  if (commaSeparated) {
    const parts = commaSeparated[1].split(/[、,，]/).map(s => s.trim()).filter(s => s.length > 1);
    pois.push(...parts);
  }

  return Array.from(new Set(pois)); // 去重
}

/**
 * Places Actions
 */
export function createPlacesActions(
  placesService: PlacesService,
  vectorSearchService?: VectorSearchService,
  entityResolutionService?: EntityResolutionService
): Action[] {
  return [
    {
      name: 'places.resolve_entities',
      description: '解析用户输入中的实体（POI、地点等）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.CALLS_API,
        preconditions: [],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          lat: { type: 'number', optional: true },
          lng: { type: 'number', optional: true },
          limit: { type: 'number', optional: true },
        },
        required: ['query'],
      },
      output_schema: {
        type: 'object',
        properties: {
          nodes: { type: 'array' },
          count: { type: 'number' },
        },
      },
      execute: async (input: { query?: string; userInput?: string; user_input?: string; lat?: number; lng?: number; limit?: number }, state: any) => {
        const logger = console; // 使用 console 作为 logger（可以后续改为注入 Logger）
        
        try {
          // 统一规范化入参 key：支持 query、userInput、user_input
          const normalizedInput = {
            query: input.query || input.userInput || input.user_input,
            lat: input.lat,
            lng: input.lng,
            limit: input.limit,
          };
          
          // 优先使用原始用户输入，而不是 input.query（可能被错误设置为 "unknown"）
          const query = (
            state?.user_input?.trim() ||
            state?.userQuery?.trim() ||
            state?.rawInput?.trim() ||
            normalizedInput.query?.trim() ||
            ''
          );

          // 如果 query 是 "unknown" 或空，直接返回空结果
          if (!query || query.toLowerCase() === 'unknown') {
            logger.warn(`places.resolve_entities: Invalid query (${query}), returning empty result`);
            return {
              nodes: [],
              count: 0,
              error: `Invalid query: ${query || 'empty'}`,
            };
          }

          logger.debug(`[resolve_entities] 开始解析实体，query: "${query}"`);

          // 提取must-have POI列表
          const mustHavePois = extractMustHavePois(query);
          logger.debug(`[resolve_entities] 提取的must-have POI: [${mustHavePois.join(', ')}]`);

          // 优先使用新的策略链服务（如果可用）
          if (entityResolutionService) {
            try {
              const resolutionResult = await entityResolutionService.resolveEntities(
                query,
                mustHavePois,
                input.lat,
                input.lng,
                input.limit || 10
              );

              // 转换为节点格式
              const nodes = resolutionResult.results
                .filter(r => r.lat && r.lng) // 只保留有坐标的结果
                .map(r => ({
                  id: r.id,
                  name: r.nameCN || r.nameEN || r.name,
                  type: 'poi',
                  geo: {
                    lat: r.lat,
                    lng: r.lng,
                  },
                  category: r.category,
                  metadata: {
                    address: r.address,
                    score: r.score,
                    source: r.source,
                    matchReasons: r.matchReasons,
                    ...r.metadata,
                  },
                }));

              // 输出诊断信息
              logger.debug(`[resolve_entities] 策略链解析结果: {
  totalResults: ${resolutionResult.results.length},
  nodesWithCoords: ${nodes.length},
  missingPois: [${resolutionResult.missingPois.join(', ')}],
  needsClarification: ${resolutionResult.needsClarification.length}
}`);

              if (resolutionResult.missingPois.length > 0) {
                logger.warn(`[resolve_entities] 缺失的must-have POI: [${resolutionResult.missingPois.join(', ')}]`);
              }

              if (resolutionResult.needsClarification.length > 0) {
                logger.warn(`[resolve_entities] 需要澄清的POI: ${JSON.stringify(resolutionResult.needsClarification, null, 2)}`);
              }

              return {
                nodes,
                count: nodes.length,
                diagnostics: {
                  searchMethod: 'entity_resolution_strategy_chain',
                  rawHitCount: resolutionResult.results.length,
                  filteredCount: resolutionResult.results.length - nodes.length,
                  mappingErrors: 0,
                  finalCount: nodes.length,
                  missingPois: resolutionResult.missingPois,
                  needsClarification: resolutionResult.needsClarification,
                },
              };
            } catch (strategyError: any) {
              logger.warn(`[resolve_entities] 策略链服务失败，降级到传统搜索: ${strategyError?.message || String(strategyError)}`);
              // 降级到传统搜索逻辑
            }
          }

          // 降级：使用传统向量搜索（如果可用）
          let results: any[];
          let rawHitCount = 0;
          let searchMethod = '';
          
          if (vectorSearchService) {
            try {
              // 使用混合搜索（向量 + 关键词）
              searchMethod = 'hybridSearch';
              const hybridResults = await vectorSearchService.hybridSearch(
                query,
                input.lat,
                input.lng,
                undefined, // radius
                undefined, // category
                input.limit || 10
              );
              results = hybridResults;
              rawHitCount = results.length;
              logger.debug(`[resolve_entities] VectorSearch 原始命中数: ${rawHitCount}`);
              
              // 输出前 3 条结果的详细信息
              if (rawHitCount > 0) {
                const top3 = results.slice(0, 3).map((r: any, idx: number) => ({
                  index: idx + 1,
                  id: r.id,
                  nameCN: r.nameCN,
                  nameEN: r.nameEN,
                  category: r.category,
                  score: r.finalScore || r.vectorScore || r.keywordScore,
                  hasLatLng: !!(r.lat && r.lng),
                }));
                logger.debug(`[resolve_entities] Top 3 结果: ${JSON.stringify(top3, null, 2)}`);
              }
            } catch (vectorError: any) {
              // 向量搜索失败，降级到关键词搜索
              logger.warn(`[resolve_entities] 向量搜索失败，降级到关键词搜索: ${vectorError?.message || String(vectorError)}`);
              searchMethod = 'placesService.search';
              results = await placesService.search(
                query,
                input.lat,
                input.lng,
                undefined, // radius
                undefined, // category
                input.limit || 10
              );
              rawHitCount = results.length;
              logger.debug(`[resolve_entities] 关键词搜索原始命中数: ${rawHitCount}`);
            }
          } else {
            // 降级到关键词搜索
            searchMethod = 'placesService.search';
            results = await placesService.search(
              query,
              input.lat,
              input.lng,
              undefined, // radius
              undefined, // category
              input.limit || 10
            );
            rawHitCount = results.length;
            logger.debug(`[resolve_entities] 关键词搜索原始命中数: ${rawHitCount}`);
          }

          // 转换为节点格式，并统计过滤情况
          // 注意：results 可能是 HybridSearchResult[] 或 Place[]
          let filteredCount = 0;
          let mappingErrors: Array<{ index: number; error: string; placeId?: number }> = [];
          
          // 先映射所有节点，然后过滤掉缺少坐标的
          const mappedNodes = results
            .map((place: any, index: number) => {
              try {
                // 检查必要字段
                if (!place.id) {
                  mappingErrors.push({ index, error: 'Missing id', placeId: place.id });
                  return null;
                }
                
                // 处理 HybridSearchResult 类型（来自 vector-search）
                if (place.finalScore !== undefined) {
                  const node = {
                    id: place.id,
                    name: place.nameCN || place.nameEN,
                    type: 'poi',
                    geo: {
                      lat: place.lat || (place as any).location?.lat,
                      lng: place.lng || (place as any).location?.lng,
                    },
                    category: place.category,
                    metadata: {
                      address: place.address,
                      rating: place.rating,
                      score: place.finalScore,
                      vectorScore: place.vectorScore,
                      keywordScore: place.keywordScore,
                      matchReasons: place.matchReasons,
                    },
                  };
                  
                  return node;
                }
                
                // 处理 Place 类型（来自 placesService.search）
                const node = {
                  id: place.id,
                  name: place.nameCN || place.nameEN,
                  type: 'poi',
                  geo: {
                    lat: place.lat || (place as any).location?.lat,
                    lng: place.lng || (place as any).location?.lng,
                  },
                  category: place.category,
                  metadata: {
                    address: place.address,
                    rating: place.rating,
                    score: (place as any).score || (place as any).vectorScore,
                  },
                };
                
                return node;
              } catch (error: any) {
                mappingErrors.push({ 
                  index, 
                  error: error?.message || String(error),
                  placeId: place.id 
                });
                logger.error(`[resolve_entities] 映射节点失败 (index: ${index}, id: ${place.id}): ${error?.message || String(error)}`);
                return null;
              }
            })
            .filter((node: any) => node !== null); // 过滤掉 null

          // 真正过滤掉缺少坐标的节点（只保留前5个用于坐标补全）
          const nodesWithCoords: any[] = [];
          const nodesWithoutCoords: any[] = [];
          
          for (const node of mappedNodes) {
            if (node.geo.lat && node.geo.lng) {
              nodesWithCoords.push(node);
            } else {
              nodesWithoutCoords.push(node);
              filteredCount++;
              logger.debug(`[resolve_entities] 节点 ${node.id} (${node.name}) 缺少坐标，将被过滤`);
            }
          }
          
          // 如果缺少坐标的节点数量较少（<=5），尝试补全坐标
          // TODO: 实现坐标补全流程（使用 geocode API）
          // 目前先返回有坐标的节点
          const nodes = nodesWithCoords;

          const finalCount = nodes.length;
          
          // 输出诊断信息
          logger.debug(`[resolve_entities] 诊断信息: {
  searchMethod: "${searchMethod}",
  rawHitCount: ${rawHitCount},
  filteredCount: ${filteredCount} (缺少坐标),
  mappingErrors: ${mappingErrors.length},
  finalCount: ${finalCount}
}`);
          
          if (mappingErrors.length > 0) {
            logger.warn(`[resolve_entities] 映射错误详情: ${JSON.stringify(mappingErrors, null, 2)}`);
          }
          
          if (finalCount === 0 && rawHitCount > 0) {
            logger.warn(`[resolve_entities] 警告：原始命中 ${rawHitCount} 条，但最终节点数为 0（可能被过滤或映射失败）`);
          }

          return {
            nodes,
            count: finalCount,
            diagnostics: {
              searchMethod,
              rawHitCount,
              filteredCount,
              mappingErrors: mappingErrors.length,
              finalCount,
            },
          };
        } catch (error: any) {
          // 如果所有搜索方法都失败，返回空结果而不是抛出错误
          // 这样可以让系统继续执行其他步骤
          logger.error(`[resolve_entities] 实体解析失败，返回空结果: ${error?.message || String(error)}`);
          logger.error(`[resolve_entities] 错误堆栈: ${error?.stack || 'N/A'}`);
          return {
            nodes: [],
            count: 0,
            error: error?.message || String(error),
          };
        }
      },
    },
    {
      name: 'places.get_poi_facts',
      description: '获取 POI 事实信息（营业时间、规则等）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.CALLS_API,
        preconditions: ['draft.nodes'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          poi_ids: { type: 'array', items: { type: 'number' } },
        },
        required: ['poi_ids'],
      },
      output_schema: {
        type: 'object',
        properties: {
          facts: { type: 'object' },
        },
      },
      execute: async (input: { poi_ids: number[] }, state: any) => {
        try {
          // 批量获取 POI 信息
          const places = await placesService.findBatch(input.poi_ids);
          
          // 提取事实信息
          const facts: Record<number, any> = {};
          for (const place of places) {
            const metadata = place.metadata as any;
            facts[place.id] = {
              name: place.nameCN || place.nameEN,
              category: place.category,
              address: place.address,
              rating: place.rating,
              opening_hours: metadata?.openingHours || metadata?.opening_hours,
              price_level: metadata?.priceLevel || metadata?.price_level,
              phone: metadata?.phone,
              website: metadata?.website,
              description: metadata?.description,
            };
          }

          return {
            facts,
          };
        } catch (error: any) {
          throw new Error(`获取 POI 事实失败: ${error?.message || String(error)}`);
        }
      },
    },
  ];
}

