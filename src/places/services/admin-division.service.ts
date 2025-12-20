// src/places/services/admin-division.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 行政区划映射服务
 * 
 * 功能：
 * 1. 将县/区映射到上级市（prefecture-level）
 * 2. 处理别名映射（如"西湖"→"杭州市"）
 * 3. 维护行政区划层级关系
 */
@Injectable()
export class AdminDivisionService {
  private readonly logger = new Logger(AdminDivisionService.name);

  // 县/区到市的映射表（硬编码，后续可以从数据库加载）
  private readonly countyToCityMap: Map<string, string> = new Map([
    // 浙江省
    ['宁海县', '宁波市'],
    ['象山县', '宁波市'],
    ['余姚市', '宁波市'],
    ['慈溪市', '宁波市'],
    ['奉化区', '宁波市'],
    ['镇海区', '宁波市'],
    ['北仑区', '宁波市'],
    ['鄞州区', '宁波市'],
    ['海曙区', '宁波市'],
    ['江北区', '宁波市'],
    ['西湖区', '杭州市'],
    ['上城区', '杭州市'],
    ['下城区', '杭州市'],
    ['江干区', '杭州市'],
    ['拱墅区', '杭州市'],
    ['滨江区', '杭州市'],
    ['萧山区', '杭州市'],
    ['余杭区', '杭州市'],
    ['临安区', '杭州市'],
    ['富阳区', '杭州市'],
    // 可以继续添加更多映射
  ]);

  // POI别名到城市的映射（如"西湖"→"杭州市"）
  private readonly poiAliasToCityMap: Map<string, string> = new Map([
    ['西湖', '杭州市'],
    ['西湖景区', '杭州市'],
    ['西湖风景名胜区', '杭州市'],
    ['十里红妆', '宁波市'], // 宁海县属于宁波市
    ['十里红妆博物馆', '宁波市'],
    ['十里红妆文化园', '宁波市'],
    ['十里红妆景区', '宁波市'],
    // 可以继续添加更多映射
  ]);

  constructor(private prisma: PrismaService) {}

  /**
   * 将县/区名称映射到上级市
   * 
   * @param divisionName 县/区名称（如"宁海县"、"西湖区"）
   * @returns 上级市名称（如"宁波市"、"杭州市"），如果未找到则返回null
   */
  async mapToCity(divisionName: string): Promise<string | null> {
    // 先检查硬编码映射
    if (this.countyToCityMap.has(divisionName)) {
      return this.countyToCityMap.get(divisionName)!;
    }

    // 尝试从数据库查询（通过adcode或metadata）
    try {
      const city = await this.prisma.city.findFirst({
        where: {
          OR: [
            { nameCN: divisionName },
            { name: divisionName },
            { nameEN: divisionName },
          ],
        },
        select: {
          id: true,
          name: true,
          nameCN: true,
          adcode: true,
          metadata: true,
        },
      });

      if (city) {
        // 如果找到的是县/区，尝试通过adcode推断上级市
        // 中国行政区划代码规则：前4位是地级市代码，后2位是区县代码
        if (city.adcode) {
          const prefectureCode = city.adcode.substring(0, 4) + '00';
          const prefectureCity = await this.prisma.city.findFirst({
            where: {
              adcode: prefectureCode,
            },
            select: {
              nameCN: true,
              name: true,
            },
          });

          if (prefectureCity) {
            return prefectureCity.nameCN || prefectureCity.name;
          }
        }

        // 如果metadata中有parentCity信息
        const metadata = city.metadata as any;
        if (metadata?.parentCity) {
          return metadata.parentCity;
        }
      }
    } catch (error) {
      this.logger.warn(`查询城市映射失败: ${error}`);
    }

    return null;
  }

  /**
   * 将POI别名映射到城市
   * 
   * @param poiName POI名称或别名（如"西湖"、"十里红妆"）
   * @returns 城市名称，如果未找到则返回null
   */
  mapPoiAliasToCity(poiName: string): string | null {
    // 直接匹配
    if (this.poiAliasToCityMap.has(poiName)) {
      return this.poiAliasToCityMap.get(poiName)!;
    }

    // 模糊匹配（检查是否包含别名）
    for (const [alias, city] of this.poiAliasToCityMap.entries()) {
      if (poiName.includes(alias) || alias.includes(poiName)) {
        return city;
      }
    }

    return null;
  }

  /**
   * 规范化城市名称（将县/区映射到市）
   * 
   * @param cityName 城市名称（可能是县/区）
   * @returns 规范化后的城市名称
   */
  async normalizeCityName(cityName: string): Promise<string> {
    // 先尝试POI别名映射
    const poiCity = this.mapPoiAliasToCity(cityName);
    if (poiCity) {
      return poiCity;
    }

    // 再尝试县/区映射
    const mappedCity = await this.mapToCity(cityName);
    if (mappedCity) {
      return mappedCity;
    }

    // 如果都找不到，返回原名称
    return cityName;
  }

  /**
   * 批量规范化城市名称
   */
  async normalizeCityNames(cityNames: string[]): Promise<string[]> {
    const normalized = await Promise.all(
      cityNames.map(name => this.normalizeCityName(name))
    );
    return Array.from(new Set(normalized)); // 去重
  }
}

