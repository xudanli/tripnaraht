// src/agent/services/system1-executor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RouteType } from '../interfaces/router.interface';
import { AgentState } from '../interfaces/agent-state.interface';
import { PlacesService } from '../../places/places.service';
import { TripsService } from '../../trips/trips.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { ItemType } from '../../itinerary-items/dto/create-itinerary-item.dto';
import { DateTime } from 'luxon';

/**
 * System 1 Executor Service
 * 
 * 快速路径执行器：API 和 RAG
 */
@Injectable()
export class System1ExecutorService {
  private readonly logger = new Logger(System1ExecutorService.name);

  constructor(
    private placesService: PlacesService,
    private tripsService: TripsService,
    private itineraryItemsService: ItineraryItemsService,
  ) {}

  /**
   * 执行 System 1 路由
   */
  async execute(
    route: RouteType,
    state: AgentState
  ): Promise<{
    success: boolean;
    result: any;
    answerText: string;
  }> {
    const startTime = Date.now();

    try {
      if (route === RouteType.SYSTEM1_API) {
        return await this.executeAPI(state);
      } else if (route === RouteType.SYSTEM1_RAG) {
        return await this.executeRAG(state);
      } else {
        throw new Error(`Unsupported System1 route: ${route}`);
      }
    } catch (error: any) {
      this.logger.error(`System1 execution error: ${error?.message || String(error)}`, error?.stack);
      return {
        success: false,
        result: null,
        answerText: `处理请求时出错：${error?.message || String(error)}`,
      };
    } finally {
      const latency = Date.now() - startTime;
      this.logger.debug(`System1 execution completed in ${latency}ms`);
    }
  }

  /**
   * 执行 API 路径（CRUD 操作）
   */
  private async executeAPI(state: AgentState): Promise<{
    success: boolean;
    result: any;
    answerText: string;
  }> {
    const input = state.user_input.toLowerCase();

    // 删除操作
    if (/删除|移除/.test(input)) {
      // 提取 POI 名称
      const match = input.match(/删除|移除\s*(.+)/);
      if (match) {
        const targetName = match[1].trim();
        
        // 尝试解析实体：搜索匹配的 POI
        try {
          const searchResults = await this.placesService.search(targetName, undefined, undefined, undefined, undefined, 5);
          
          if (searchResults.length === 0) {
            return {
              success: false,
              result: { action: 'delete', target: targetName, resolved: false },
              answerText: `未找到"${targetName}"，请检查名称是否正确`,
            };
          }

          // 如果找到唯一匹配，返回成功
          if (searchResults.length === 1) {
            const poi = searchResults[0];
            
            // 实际调用删除服务
            if (!state.trip.trip_id) {
              return {
                success: false,
                result: { action: 'delete', target: targetName, resolved: false },
                answerText: '未找到行程信息，无法执行删除操作',
              };
            }

            try {
              // 获取行程的所有 items，找到匹配的项
              const trip = await this.tripsService.findOne(state.trip.trip_id);
              const itemsToDelete: string[] = [];

              // 遍历所有天的所有 items，找到匹配 placeId 的项
              for (const day of trip.days || []) {
                for (const item of day.items || []) {
                  if (item.placeId === poi.id) {
                    itemsToDelete.push(item.id);
                  }
                }
              }

              if (itemsToDelete.length === 0) {
                return {
                  success: false,
                  result: { action: 'delete', target: targetName, resolved: false },
                  answerText: `未找到行程中包含"${poi.nameCN || poi.nameEN}"的项目`,
                };
              }

              // 删除所有匹配的 items
              for (const itemId of itemsToDelete) {
                await this.itineraryItemsService.remove(itemId);
              }

              return {
                success: true,
                result: { 
                  action: 'delete', 
                  target: targetName,
                  resolved: true,
                  poi: { id: poi.id, name: poi.nameCN || poi.nameEN },
                  deletedCount: itemsToDelete.length
                },
                answerText: `已删除 ${itemsToDelete.length} 个包含"${poi.nameCN || poi.nameEN}"的行程项`,
              };
            } catch (error: any) {
              this.logger.error(`删除操作失败: ${error?.message || String(error)}`);
              return {
                success: false,
                result: { action: 'delete', target: targetName, resolved: false },
                answerText: `删除操作失败：${error?.message || String(error)}`,
              };
            }
          }

          // 多个匹配，返回候选列表
          return {
            success: false,
            result: { 
              action: 'delete', 
              target: targetName,
              resolved: false,
              candidates: searchResults.slice(0, 5).map(p => ({
                id: p.id,
                name: p.nameCN || p.nameEN,
              }))
            },
            answerText: `找到多个匹配的"${targetName}"，请选择要删除的具体地点`,
          };
        } catch (error: any) {
          this.logger.error(`实体解析失败: ${error?.message || String(error)}`);
          return {
            success: false,
            result: { action: 'delete', target: targetName, resolved: false },
            answerText: `解析"${targetName}"时出错，请重试`,
          };
        }
      }
    }

    // 添加操作
    if (/添加|加入/.test(input)) {
      const match = input.match(/添加|加入\s*(.+)/);
      if (match) {
        const targetName = match[1].trim();
        
        // 尝试解析实体：搜索匹配的 POI
        try {
          const searchResults = await this.placesService.search(targetName, undefined, undefined, undefined, undefined, 5);
          
          if (searchResults.length === 0) {
            return {
              success: false,
              result: { action: 'add', target: targetName, resolved: false },
              answerText: `未找到"${targetName}"，请检查名称是否正确或提供更多信息`,
            };
          }

          // 如果找到唯一匹配，返回成功
          if (searchResults.length === 1) {
            const poi = searchResults[0];
            
            // 实际调用添加服务
            if (!state.trip.trip_id) {
              return {
                success: false,
                result: { action: 'add', target: targetName, resolved: false },
                answerText: '未找到行程信息，无法执行添加操作',
              };
            }

            try {
              // 获取行程信息，找到第一个可用的 day
              const trip = await this.tripsService.findOne(state.trip.trip_id);
              
              if (!trip.days || trip.days.length === 0) {
                return {
                  success: false,
                  result: { action: 'add', target: targetName, resolved: false },
                  answerText: '行程中没有可用的日期',
                };
              }

              // 使用第一个 day（可以后续优化为找到最合适的 day）
              const firstDay = trip.days[0];
              
              // 获取该 day 的所有 items 以确定合适的时间
              const existingItems = firstDay.items || [];
              const dayDate = DateTime.fromJSDate(firstDay.date);
              
              // 确定添加时间：如果已有 items，添加到最后一个之后；否则使用默认时间（10:00-12:00）
              let startTime: Date;
              let endTime: Date;
              
              if (existingItems.length > 0 && existingItems[existingItems.length - 1].endTime) {
                // 添加到最后一个 item 之后，默认持续 2 小时
                const lastEndTime = DateTime.fromJSDate(existingItems[existingItems.length - 1].endTime);
                startTime = lastEndTime.toJSDate();
                endTime = lastEndTime.plus({ hours: 2 }).toJSDate();
              } else {
                // 使用默认时间：10:00-12:00
                startTime = dayDate.set({ hour: 10, minute: 0, second: 0 }).toJSDate();
                endTime = dayDate.set({ hour: 12, minute: 0, second: 0 }).toJSDate();
              }

              // 创建新的 itinerary item
              const newItem = await this.itineraryItemsService.create({
                tripDayId: firstDay.id,
                placeId: poi.id,
                type: ItemType.ACTIVITY,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
              });

              return {
                success: true,
                result: { 
                  action: 'add', 
                  target: targetName,
                  resolved: true,
                  poi: { id: poi.id, name: poi.nameCN || poi.nameEN },
                  item: { id: newItem.id, startTime, endTime }
                },
                answerText: `已添加：${poi.nameCN || poi.nameEN || targetName}`,
              };
            } catch (error: any) {
              this.logger.error(`添加操作失败: ${error?.message || String(error)}`);
              return {
                success: false,
                result: { action: 'add', target: targetName, resolved: false },
                answerText: `添加操作失败：${error?.message || String(error)}`,
              };
            }
          }

          // 多个匹配，返回候选列表
          return {
            success: false,
            result: { 
              action: 'add', 
              target: targetName,
              resolved: false,
              candidates: searchResults.slice(0, 5).map(p => ({
                id: p.id,
                name: p.nameCN || p.nameEN,
              }))
            },
            answerText: `找到多个匹配的"${targetName}"，请选择要添加的具体地点`,
          };
        } catch (error: any) {
          this.logger.error(`实体解析失败: ${error?.message || String(error)}`);
          return {
            success: false,
            result: { action: 'add', target: targetName, resolved: false },
            answerText: `解析"${targetName}"时出错，请重试`,
          };
        }
      }
    }

    // 默认：返回需要更多信息
    return {
      success: false,
      result: null,
      answerText: '请提供更具体的操作指令',
    };
  }

  /**
   * 执行 RAG 路径（知识库检索）
   */
  private async executeRAG(state: AgentState): Promise<{
    success: boolean;
    result: any;
    answerText: string;
  }> {
    const input = state.user_input;

    try {
      // 使用 PlacesService 的搜索功能（关键词搜索）
      const results = await this.placesService.search(input, undefined, undefined, undefined, undefined, 10);
      
      if (results.length === 0) {
        return {
          success: true,
          result: {
            type: 'rag',
            query: input,
            results: [],
          },
          answerText: `未找到与"${input}"相关的地点信息。`,
        };
      }

      // 格式化结果
      const formattedResults = results.map((place, index) => ({
        rank: index + 1,
        id: place.id,
        name: place.nameCN || place.nameEN,
        category: place.category,
        address: place.address,
        rating: place.rating,
      }));

      // 生成自然语言回答
      const topResult = results[0];
      const answerText = results.length === 1
        ? `找到了"${topResult.nameCN || topResult.nameEN}"。${topResult.address ? `地址：${topResult.address}` : ''}`
        : `找到了 ${results.length} 个相关地点，推荐：${topResult.nameCN || topResult.nameEN}${results.length > 1 ? ` 等` : ''}`;

      return {
        success: true,
        result: {
          type: 'rag',
          query: input,
          results: formattedResults,
          top_result: formattedResults[0],
        },
        answerText,
      };
    } catch (error: any) {
      this.logger.error(`RAG execution error: ${error?.message || String(error)}`);
      return {
        success: false,
        result: null,
        answerText: '查询知识库时出错',
      };
    }
  }
}

