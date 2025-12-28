# 尼泊尔 POI 数据包

## 📦 内容

本目录包含尼泊尔 POI 导入所需的所有配置和数据：

- `region-seeds.json` - 8 个 MVP regions 的种子点配置
- `country-rules.json` - 尼泊尔特定的规则和约束（TIMS、限制区域等）

## 🚀 快速开始

### 1. 导入所有 MVP Regions

```bash
npm run import:nepal-poi -- --all
```

这将导入 8 个 priority=1 的 regions，每个 region 跑 4 个 profiles（A/B/C/D）。

### 2. 导入特定 Region

```bash
# 只导入加德满都
npm run import:nepal-poi -- --region NP_KTM

# 只导入博卡拉
npm run import:nepal-poi -- --region NP_PKR
```

### 3. 导入特定 Region 的特定 Profile

```bash
# 只导入加德满都的 Profile A（徒步核心）
npm run import:nepal-poi -- --region NP_KTM --profile A
```

## 📋 Region 列表

### MVP Regions (Priority 1)

1. **NP_KTM** - 加德满都（城市补给/签证/交通枢纽）
2. **NP_PKR** - 博卡拉（安娜普尔纳门户）
3. **NP_BESISAHAR** - 贝西萨哈（Annapurna Circuit 起点）
4. **NP_LUKLA** - 卢克拉（EBC 空路入口）
5. **NP_NAMCHE** - 南池市场（EBC 核心补给镇）
6. **NP_CHITWAN_SAURAHA** - 奇特旺（丛林活动/安全点）
7. **NP_LUMBINI** - 蓝毗尼（文化朝圣）
8. **NP_WELLNESS_RING** - 加德满都谷地周边（轻量徒步/观景兜底）

### 未来扩展 Regions (Priority 2)

- `NP_LANGTANG_SYABRUBESI` - Langtang 徒步区域
- `NP_MANASLU_SOTI_KHOLA` - Manaslu 徒步区域（限制区域）
- `NP_MUSTANG_JOMSOM` - Mustang 限制区域

## 🔍 Profile 说明

- **Profile A**: Trekking Core（徒步入口/营地/小屋/信息点）
- **Profile B**: Tea House / Lodge（茶屋/住宿）
- **Profile C**: Safety & Supply（安全与补给）
- **Profile D**: Transport Nodes（交通节点）

## 📚 详细文档

查看 `docs/NEPAL-POI-IMPORT-GUIDE.md` 获取完整文档。

