// src/places/services/nara-hint.service.ts
import { Injectable } from '@nestjs/common';
import {
  IcelandNaturePoi,
  NaraHint,
  IcelandNatureSubCategory,
} from '../interfaces/nature-poi.interface';

/**
 * NARA 提示信息生成服务
 * 
 * 功能：
 * 1. 根据自然 POI 类型自动生成 NARA 提示信息
 * 2. 为 LLM 提供叙事种子、行动提示、反思提示等
 */
@Injectable()
export class NaraHintService {
  /**
   * 为自然 POI 生成 NARA 提示信息
   */
  generateNaraHint(poi: IcelandNaturePoi): NaraHint {
    // 每次拿一个「新的」 hint，避免污染全局模板
    const base = this.getBaseHint(poi.subCategory);
    const hint: NaraHint = { ...base }; // 浅拷贝足够，字段都是 string

    // 安全的字符串追加方法
    const append = (original: string | undefined, extra: string): string =>
      original ? `${original} ${extra}` : extra;

    // 1. 活火山增强
    if (poi.isActiveVolcano) {
      const placeName = poi.name?.primary || '这座火山';
      hint.narrativeSeed = `在冰岛，${placeName}是一座活火山，${base.narrativeSeed}`;
      hint.reflectionHint = append(
        base.reflectionHint,
        '站在活火山前，感受地球内部的力量，思考时间尺度和人类存在的短暂。'
      );
    }

    // 2. 冰河湖的特殊 anchor
    if (poi.subCategory === 'glacier_lagoon') {
      hint.anchorHint =
        '提醒用户拍一张"把小冰块握在手心"的照片，作为这段旅程的视觉锚点。';
    }

    // 3. 高海拔提示
    if (poi.elevationMeters && poi.elevationMeters > 1000) {
      hint.actionHint = append(
        base.actionHint,
        '在高海拔处，注意呼吸和保暖。'
      );
    }

    // 4. 危险等级影响文案
    if (poi.hazardLevel === 'high' || poi.hazardLevel === 'extreme') {
      hint.actionHint = append(
        hint.actionHint,
        '⚠️ 务必遵守现场警示标志，不要进入危险区域。'
      );
      hint.reflectionHint = append(
        hint.reflectionHint,
        '在危险面前，更能体会到自然的威严和人类的渺小。'
      );
    }

    // 5. 需要向导的特殊提示
    if (poi.requiresGuide) {
      hint.actionHint = append(
        hint.actionHint,
        '此区域必须由专业向导带领，请提前预约。'
      );
    }

    return hint;
  }

  /**
   * 获取基础提示信息（根据子类别）
   * 注意：每次返回新的对象副本，避免共享引用被修改
   */
  private getBaseHint(subCategory: IcelandNatureSubCategory): NaraHint {
    const hints: Record<IcelandNatureSubCategory, NaraHint> = {
      volcano: {
        narrativeSeed: '火山是地球内部力量的直接体现，这里见证了地质时间的漫长和人类时间的短暂。',
        actionHint: '建议从不同角度观察火山形态，注意安全距离，可以拍摄火山口和周围熔岩地貌。',
        reflectionHint: '思考"变化"与"永恒"——火山在数千年间缓慢形成，而一次喷发可能改变整个区域。',
        anchorHint: '记录下站在火山前的感受，这可能是你人生中距离地球内部力量最近的一次。',
      },
      lava_field: {
        narrativeSeed: '熔岩区是火山喷发后的遗迹，黑色的熔岩流凝固成奇异的形状，仿佛时间在这里被冻结。',
        actionHint: '步行探索熔岩区，观察不同形态的熔岩（绳状熔岩、块状熔岩），注意脚下安全。',
        reflectionHint: '感受"毁灭"与"重生"——熔岩摧毁了一切，但也为新的生命创造了基础。',
        anchorHint: '捡一块小熔岩作为纪念，但更重要的是记住这种"从毁灭中重生"的体验。',
      },
      glacier: {
        narrativeSeed: '冰川是时间的见证者，每一层冰都记录着过去的气候。在气候变化的今天，它们正在加速消融。',
        actionHint: '如果条件允许，可以参加冰川徒步或冰洞探险（需专业向导）。注意保暖和防滑。',
        reflectionHint: '思考"永恒"与"消逝"——冰川存在了数万年，但可能在我们的有生之年消失。',
        anchorHint: '拍下冰川的照片，记录下这一刻，因为未来可能再也看不到这样的景象。',
      },
      glacier_lagoon: {
        narrativeSeed: '在冰岛南岸，冰川崩裂出的冰块缓慢漂向大海，这里仿佛是时间被减速的角落。',
        actionHint: '建议步行到湖岸边的几个观景点，尝试从不同角度观察冰块形状与光线变化。',
        reflectionHint: '思考"变化"与"消融"，以及自己过去几年中经历的改变。',
        anchorHint: '提醒用户拍一张"把小冰块握在手心"的照片，作为这段旅程的视觉锚点。',
      },
      waterfall: {
        narrativeSeed: '瀑布是水与重力的对话，水流从高处倾泻而下，形成永恒的动态平衡。',
        actionHint: '可以从不同角度拍摄瀑布（正面、侧面、底部），注意防水，靠近瀑布区域水汽较大。',
        reflectionHint: '感受"流动"与"坚持"——水不断流动，但瀑布的位置相对固定，就像人生中的某些坚持。',
        anchorHint: '记录下瀑布的声音和感受，这种自然的声音可能成为你未来回忆这段旅程的触发点。',
      },
      geothermal_area: {
        narrativeSeed: '地热区是地球内部热量的直接体现，蒸汽从地缝中升起，硫磺的味道弥漫在空气中。',
        actionHint: '沿着指定步道行走，观察地热现象（喷气孔、泥浆池、温泉），注意安全，不要离开步道。',
        reflectionHint: '思考"隐藏的力量"——表面平静，但地下蕴藏着巨大的能量，就像人的内心。',
        anchorHint: '感受地热区的独特氛围，这种"地球在呼吸"的感觉是冰岛独有的体验。',
      },
      hot_spring: {
        narrativeSeed: '温泉是地热与水的完美结合，在寒冷的冰岛，温泉是当地人社交和放松的重要场所。',
        actionHint: '如果允许，可以体验温泉（注意水温，有些温泉温度很高）。准备毛巾和换洗衣物。',
        reflectionHint: '感受"自然给予的温暖"——在寒冷的环境中，自然提供了温暖的庇护。',
        anchorHint: '在温泉中的放松时刻，思考生活中那些"自然给予的温暖"时刻。',
      },
      black_sand_beach: {
        narrativeSeed: '黑沙滩是火山与海洋的相遇，黑色的沙粒来自火山岩，与白色的海浪形成强烈对比。',
        actionHint: '可以在沙滩上漫步，观察海浪与黑沙的互动，注意安全，不要离海浪太近。',
        reflectionHint: '思考"对比"与"和谐"——黑与白、火与水的对比，但最终形成和谐的画面。',
        anchorHint: '拍下黑沙滩的照片，这种独特的色彩对比是冰岛海岸线的标志。',
      },
      canyon: {
        narrativeSeed: '峡谷是水与岩石的长期对话，河流在数千年间切割出深邃的沟壑。',
        actionHint: '可以沿着峡谷边缘徒步，观察不同高度的景观，注意安全，不要靠近边缘。',
        reflectionHint: '思考"时间的力量"——看似坚硬的岩石，在时间的冲刷下也会改变形状。',
        anchorHint: '记录下峡谷的深度和规模，这种"时间雕刻"的景观让人感受到自然的伟大。',
      },
      crater_lake: {
        narrativeSeed: '火山口湖是火山喷发后形成的宁静水域，火山与湖泊的对比形成独特的景观。',
        actionHint: '可以从火山口边缘观察湖泊，注意安全。如果允许，可以徒步到湖边。',
        reflectionHint: '思考"毁灭"与"创造"——火山喷发是毁灭性的，但也创造了美丽的湖泊。',
        anchorHint: '记录下火山口湖的宁静，这种"从毁灭中诞生"的美是独特的体验。',
      },
      sea_cliff: {
        narrativeSeed: '海崖是陆地与海洋的边界，海浪不断冲击着岩石，形成壮观的景象。',
        actionHint: '可以从安全距离观察海崖和鸟类（如海鹦），注意安全，不要靠近边缘。',
        reflectionHint: '感受"边界"的概念——陆地与海洋、安全与危险的边界。',
        anchorHint: '记录下海崖的壮观，这种"边界"的体验让人思考生活中的各种边界。',
      },
      national_park: {
        narrativeSeed: '国家公园是自然保护的象征，这里保存着冰岛最原始的自然景观。',
        actionHint: '可以沿着指定步道探索，观察不同的自然景观，遵守公园规定，保护环境。',
        reflectionHint: '思考"保护"与"体验"——如何在保护自然的同时，让人们体验自然的美。',
        anchorHint: '记录下在国家公园中的感受，这种"被保护的自然"是珍贵的体验。',
      },
      nature_reserve: {
        narrativeSeed: '自然保护区是生态系统的保护地，这里维护着生物多样性和生态平衡。',
        actionHint: '可以观察野生动物和植物，注意保持安静，不要干扰自然。',
        reflectionHint: '思考"平衡"——人类活动与自然保护的平衡，以及我们在这个平衡中的角色。',
        anchorHint: '记录下在保护区中的感受，这种"和谐共存"的体验值得珍惜。',
      },
      viewpoint: {
        narrativeSeed: '观景点提供了俯瞰全景的视角，从这里可以看到更广阔的自然景观。',
        actionHint: '可以从不同角度拍摄全景，注意光线和构图，寻找最佳的拍摄时机。',
        reflectionHint: '思考"视角"——从高处看，很多细节变得模糊，但整体更加清晰。',
        anchorHint: '记录下从观景点看到的全景，这种"俯瞰"的视角可能改变你对这个地区的理解。',
      },
      cave: {
        narrativeSeed: '洞穴是地下的神秘世界，这里保存着独特的地质形态和可能的冰层。',
        actionHint: '可以探索洞穴内部（需专业向导），观察冰层和地质形态，注意安全。',
        reflectionHint: '感受"隐藏的世界"——表面之下，还有另一个世界等待探索。',
        anchorHint: '记录下在洞穴中的感受，这种"探索隐藏世界"的体验是独特的。',
      },
      coastline: {
        narrativeSeed: '海岸线是陆地与海洋的交汇处，这里有着丰富的生态和壮观的景观。',
        actionHint: '可以沿着海岸线漫步，观察海浪、岩石和可能的野生动物。',
        reflectionHint: '思考"交汇"——陆地与海洋、稳定与变化的交汇。',
        anchorHint: '记录下海岸线的景观，这种"交汇"的体验让人思考生活中的各种交汇点。',
      },
      other: {
        narrativeSeed: '这里是冰岛自然的一部分，每个地方都有其独特的故事。',
        actionHint: '探索这个区域，观察周围的自然景观，注意安全。',
        reflectionHint: '感受自然的多样性和独特性。',
        anchorHint: '记录下在这个地方的感受，每个地方都有其独特的价值。',
      },
    };

    // 返回一个拷贝，防止外面修改内部模板
    const base = hints[subCategory] ?? hints.other;
    return { ...base };
  }

  /**
   * 批量生成 NARA 提示信息
   */
  generateNaraHints(pois: IcelandNaturePoi[]): Map<string, NaraHint> {
    const hints = new Map<string, NaraHint>();
    for (const poi of pois) {
      hints.set(poi.id, this.generateNaraHint(poi));
    }
    return hints;
  }
}
