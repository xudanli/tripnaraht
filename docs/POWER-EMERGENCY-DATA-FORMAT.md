# 插座信息和紧急电话数据格式说明

本文档说明如何为 `optimize-country-profiles.ts` 脚本提供插座信息和紧急电话数据。

## 一、插座信息数据格式

### 数据结构

插座信息需要添加到 `POWER_INFO_MAP` 对象中，格式如下：

```typescript
const POWER_INFO_MAP: Record<string, {
  voltage: number;      // 电压（伏特）
  frequency: number;    // 频率（赫兹）
  plugTypes: string[]; // 插头类型（字母代码数组）
}> = {
  '国家代码': {
    voltage: 220,        // 例如：220V
    frequency: 50,       // 例如：50Hz
    plugTypes: ['C', 'F'] // 例如：C型、F型插座
  },
  // ...
};
```

### 字段说明

#### 1. 电压 (voltage)
- **类型**: `number`
- **单位**: 伏特 (V)
- **常见值**: 
  - 100V (日本部分地区)
  - 110V (台湾、部分美洲国家)
  - 120V (美国、加拿大)
  - 127V (墨西哥、巴西部分地区)
  - 220V (中国、大部分亚洲国家)
  - 230V (欧洲、澳大利亚、新西兰)
  - 240V (马来西亚)

#### 2. 频率 (frequency)
- **类型**: `number`
- **单位**: 赫兹 (Hz)
- **常见值**:
  - 50Hz (大部分国家)
  - 60Hz (美国、加拿大、韩国、菲律宾等)

**注意**: 有些国家（如日本）不同地区频率不同，可以添加注释说明。

#### 3. 插头类型 (plugTypes)
- **类型**: `string[]` (字符串数组)
- **值**: 插头类型字母代码
- **常见类型**:
  - `A`: 美式两脚扁插头
  - `B`: 美式三脚插头（带地线）
  - `C`: 欧式两脚圆插头
  - `D`: 英式三脚插头（旧式）
  - `E`: 法式两脚圆插头（带地线孔）
  - `F`: 德式两脚圆插头（带地线夹）
  - `G`: 英式三脚方插头
  - `H`: 以色列三脚插头
  - `I`: 澳式三脚斜插头
  - `J`: 瑞士三脚插头
  - `K`: 丹麦三脚插头
  - `L`: 意式三脚圆插头
  - `M`: 南非三脚圆插头
  - `N`: 巴西三脚圆插头
  - `O`: 泰式三脚插头

### 示例

```typescript
// 中国
'CN': {
  voltage: 220,
  frequency: 50,
  plugTypes: ['A', 'I']
},

// 日本（部分地区频率为60Hz）
'JP': {
  voltage: 100,
  frequency: 50,  // 注：关东地区50Hz，关西地区60Hz
  plugTypes: ['A', 'B']
},

// 新加坡
'SG': {
  voltage: 230,
  frequency: 50,
  plugTypes: ['C', 'G', 'M']
},
```

### 数据来源

推荐的数据来源：
1. **World Standards**: https://www.worldstandards.eu/electricity/
2. **Wikipedia**: 搜索 "Mains electricity by country"
3. **各国官方旅游网站**

---

## 二、紧急电话数据格式

### 数据结构

紧急电话需要添加到 `EMERGENCY_MAP` 对象中，格式如下：

```typescript
const EMERGENCY_MAP: Record<string, {
  police: string;   // 报警电话
  fire: string;     // 火警电话
  medical: string;  // 医疗急救电话
}> = {
  '国家代码': {
    police: '110',   // 例如：110
    fire: '119',     // 例如：119
    medical: '120'   // 例如：120
  },
  // ...
};
```

### 字段说明

#### 1. 报警电话 (police)
- **类型**: `string`
- **说明**: 报警/警察电话
- **格式**: 通常是数字字符串，可能包含特殊字符
- **示例**: 
  - `'110'` (中国、日本)
  - `'911'` (美国、加拿大)
  - `'999'` (英国、新加坡)
  - `'17'` (法国)

#### 2. 火警电话 (fire)
- **类型**: `string`
- **说明**: 火警电话
- **格式**: 通常是数字字符串
- **示例**:
  - `'119'` (中国、日本、韩国)
  - `'911'` (美国、加拿大)
  - `'999'` (英国)
  - `'18'` (法国)

#### 3. 医疗急救电话 (medical)
- **类型**: `string`
- **说明**: 医疗急救电话
- **格式**: 通常是数字字符串
- **示例**:
  - `'120'` (中国)
  - `'119'` (日本、韩国)
  - `'911'` (美国、加拿大)
  - `'15'` (法国)

**注意**: 
- 有些国家所有紧急情况使用同一个号码（如美国的 911）
- 有些国家不同紧急情况使用不同号码（如中国的 110/119/120）
- 电话号码可能包含特殊字符或前缀（如 `'091'` 表示需要加区号）

### 示例

```typescript
// 中国
'CN': {
  police: '110',
  fire: '119',
  medical: '120'
},

// 美国（统一紧急电话）
'US': {
  police: '911',
  fire: '911',
  medical: '911'
},

// 法国
'FR': {
  police: '17',
  fire: '18',
  medical: '15'
},
```

### 数据来源

推荐的数据来源：
1. **各国官方旅游网站**
2. **Wikipedia**: 搜索 "Emergency telephone number by country"
3. **各国驻外使领馆网站**

---

## 三、如何添加数据

### 方法 1: 直接编辑脚本文件

1. 打开 `scripts/optimize-country-profiles.ts`
2. 找到 `POWER_INFO_MAP` 或 `EMERGENCY_MAP`
3. 添加或更新国家数据：

```typescript
const POWER_INFO_MAP: Record<string, {...}> = {
  // ... 现有数据 ...
  '新国家代码': {
    voltage: 220,
    frequency: 50,
    plugTypes: ['C', 'F']
  },
};

const EMERGENCY_MAP: Record<string, {...}> = {
  // ... 现有数据 ...
  '新国家代码': {
    police: '110',
    fire: '119',
    medical: '120'
  },
};
```

### 方法 2: 批量导入（推荐）

如果你有大量数据，可以：

1. **准备 CSV 或 JSON 文件**：

```csv
国家代码,电压,频率,插头类型,报警电话,火警电话,医疗电话
CN,220,50,"A,I",110,119,120
JP,100,50,"A,B",110,119,119
```

2. **编写转换脚本**，将数据转换为 TypeScript 格式

3. **复制到脚本文件中**

---

## 四、数据验证

### 插座信息验证

- ✅ 电压范围：通常 100-240V
- ✅ 频率：通常是 50Hz 或 60Hz
- ✅ 插头类型：必须是有效的字母代码（A-Z，不包括某些字母）

### 紧急电话验证

- ✅ 电话号码格式：通常是数字字符串
- ✅ 长度：通常 2-5 位数字
- ✅ 特殊字符：可能包含 `-` 或其他字符

---

## 五、运行脚本更新数据库

添加数据后，运行脚本：

```bash
npm run optimize:countries
```

脚本会：
1. 检查每个国家的插座信息和紧急电话
2. 如果缺失，使用映射表中的数据填充
3. 显示更新进度和统计信息

---

## 六、数据示例（完整）

### 插座信息示例

```typescript
const POWER_INFO_MAP = {
  'JP': { voltage: 100, frequency: 50, plugTypes: ['A', 'B'] },
  'CN': { voltage: 220, frequency: 50, plugTypes: ['A', 'I'] },
  'KR': { voltage: 220, frequency: 60, plugTypes: ['C', 'F'] },
  'TH': { voltage: 220, frequency: 50, plugTypes: ['A', 'B', 'C', 'F'] },
  'SG': { voltage: 230, frequency: 50, plugTypes: ['C', 'G', 'M'] },
  'IN': { voltage: 230, frequency: 50, plugTypes: ['C', 'D', 'M'] },
  'AE': { voltage: 230, frequency: 50, plugTypes: ['D', 'G', 'C'] },
  'GB': { voltage: 230, frequency: 50, plugTypes: ['G'] },
  'DE': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'FR': { voltage: 230, frequency: 50, plugTypes: ['C', 'E'] },
  'IT': { voltage: 230, frequency: 50, plugTypes: ['C', 'F', 'L'] },
  'RU': { voltage: 220, frequency: 50, plugTypes: ['C', 'F'] },
  'CH': { voltage: 230, frequency: 50, plugTypes: ['C', 'J'] },
  'US': { voltage: 120, frequency: 60, plugTypes: ['A', 'B'] },
  'CA': { voltage: 120, frequency: 60, plugTypes: ['A', 'B'] },
  'MX': { voltage: 127, frequency: 60, plugTypes: ['A', 'B'] },
  'BR': { voltage: 127, frequency: 60, plugTypes: ['C', 'N'] },
  'AR': { voltage: 220, frequency: 50, plugTypes: ['C', 'I'] },
  'CL': { voltage: 220, frequency: 50, plugTypes: ['C', 'L'] },
  'AU': { voltage: 230, frequency: 50, plugTypes: ['I'] },
  'NZ': { voltage: 230, frequency: 50, plugTypes: ['I'] },
  'ZA': { voltage: 230, frequency: 50, plugTypes: ['C', 'M', 'N'] },
  'EG': { voltage: 220, frequency: 50, plugTypes: ['C', 'F'] },
};
```

### 紧急电话示例

```typescript
const EMERGENCY_MAP = {
  'CN': { police: '110', fire: '119', medical: '120' },
  'JP': { police: '110', fire: '119', medical: '119' },
  'KR': { police: '112', fire: '119', medical: '119' },
  'US': { police: '911', fire: '911', medical: '911' },
  'CA': { police: '911', fire: '911', medical: '911' },
  'GB': { police: '999', fire: '999', medical: '999' },
  'FR': { police: '17', fire: '18', medical: '15' },
  'DE': { police: '110', fire: '112', medical: '112' },
  'IT': { police: '113', fire: '115', medical: '118' },
  'AU': { police: '000', fire: '000', medical: '000' },
  'NZ': { police: '111', fire: '111', medical: '111' },
};
```

---

## 七、常见问题

### Q1: 如果某个国家有多个电压标准怎么办？

**A**: 使用最常见的标准，或在注释中说明。例如：
```typescript
'BR': { 
  voltage: 127,  // 部分地区为220V
  frequency: 60, 
  plugTypes: ['C', 'N'] 
},
```

### Q2: 插头类型代码从哪里找？

**A**: 参考以下资源：
- World Standards: https://www.worldstandards.eu/electricity/plug-voltage-by-country/
- 插头类型图片和说明

### Q3: 紧急电话格式不统一怎么办？

**A**: 使用最常见的格式。如果不同地区不同，使用主要城市的号码。

### Q4: 如何验证数据是否正确？

**A**: 
1. 交叉验证多个数据源
2. 查看各国官方旅游网站
3. 运行脚本后检查输出日志

---

## 八、快速参考

### 插头类型代码速查

| 代码 | 名称 | 图片特征 |
|------|------|----------|
| A | 美式两脚扁插头 | 两脚平行扁插头 |
| B | 美式三脚插头 | 两脚扁+圆地线 |
| C | 欧式两脚圆插头 | 两脚圆形插头 |
| D | 英式三脚插头（旧） | 三脚圆形插头 |
| E | 法式两脚圆插头 | 两脚圆+地线孔 |
| F | 德式两脚圆插头 | 两脚圆+地线夹 |
| G | 英式三脚方插头 | 三脚方形插头 |
| H | 以色列三脚插头 | 三脚圆形插头 |
| I | 澳式三脚斜插头 | 三脚斜插头 |
| J | 瑞士三脚插头 | 三脚圆形插头 |
| K | 丹麦三脚插头 | 三脚圆形插头 |
| L | 意式三脚圆插头 | 三脚圆形插头 |
| M | 南非三脚圆插头 | 三脚圆形插头 |
| N | 巴西三脚圆插头 | 三脚圆形插头 |
| O | 泰式三脚插头 | 三脚圆形插头 |

### 电压/频率常见组合

- **100V / 50Hz**: 日本（部分地区60Hz）
- **110V / 60Hz**: 台湾
- **120V / 60Hz**: 美国、加拿大
- **127V / 60Hz**: 墨西哥、巴西部分地区
- **220V / 50Hz**: 中国、大部分亚洲国家、俄罗斯
- **230V / 50Hz**: 欧洲、澳大利亚、新西兰、新加坡、印度
- **240V / 50Hz**: 马来西亚

---

## 九、数据更新清单

更新数据时，请检查：

- [ ] 国家代码正确（ISO 3166-1 alpha-2）
- [ ] 电压值合理（100-240V）
- [ ] 频率值正确（50Hz 或 60Hz）
- [ ] 插头类型代码有效
- [ ] 紧急电话号码格式正确
- [ ] 数据来源可靠
- [ ] 已运行脚本验证

---

## 十、相关文件

- `scripts/optimize-country-profiles.ts` - 主脚本文件
- `prisma/schema.prisma` - 数据库 Schema（powerInfo 和 emergency 字段）
- `src/countries/countries.service.ts` - 国家服务（使用这些数据）
