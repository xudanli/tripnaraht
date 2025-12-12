# 紧急电话信息更新总结

## 更新完成

已成功更新所有国家的紧急电话信息到 `scripts/optimize-country-profiles.ts` 文件中的 `EMERGENCY_MAP`。

## 数据统计

### 总国家数
- **约 150+ 个国家/地区**的紧急电话信息

### 地区分布

#### 主要国家（20+）
- US, CA, GB, CN, AU, NZ, JP, KR, MX, FR, DE, IT, BR, IN, RU, ZA, HK, MO, TW, SG, AE, ES, NL, SE, TR

#### 欧洲（40+）
- AL, AD, AT, BE, BG, HR, CY, CZ, DK, EE, FI, GE, GR, HU, IS, IE, LV, LI, LT, LU, MC, MD, ME, BA, MT, PL, PT, RO, RS, SK, SI, CH, UA, VA, BY, NO

#### 亚洲（30+）
- AF, AM, AZ, BD, BT, KH, ID, IR, IQ, IL, JO, KZ, KW, KG, LA, LB, MY, MN, NP, OM, PK, PH, QA, SA, LK, SY, TH, TJ, TL, TM, UZ, VN, YE

#### 北美洲（15+）
- AG, AW, BS, BB, BZ, BM, CR, DO, SV, GT, HN, JM, NI, PA, TT, UY, VE

#### 南美洲（10+）
- AR, BO, CL, CO, EC, GF, GY, PY, PE, SR

#### 大洋洲（5+）
- FJ, PG, WS, VU

#### 非洲（40+）
- DZ, AO, BJ, BW, BF, BI, CM, CV, TD, KM, CG, CD, CI, DJ, EG, GQ, ER, ET, GA, GM, GH, GN, KE, LS, LR, LY, MG, ML, MR, MU, MA, MZ, NA, NE, NG, RW, SN, SC, SL, SO, ZA, SS, SD, TZ, TG, TN, UG, ZM, ZW

#### 加勒比海地区（6+）
- AI, BQ, GP, MQ, HT, CU

## 数据格式说明

### 标准格式
```typescript
'国家代码': {
  police: '报警电话',
  fire: '火警电话',
  medical: '医疗急救电话'
}
```

### 特殊格式处理

#### 1. 多个号码（用斜杠分隔）
表示多个号码都可以使用：
```typescript
'GB': { police: '999/112', fire: '999/112', medical: '999/112' }
'FR': { police: '17/112', fire: '18/112', medical: '15/112' }
```

#### 2. 特殊字符
保留原始格式，包括连字符：
```typescript
'TD': { police: '17', fire: '18', medical: '2251-28-56' }
'KM': { police: '17', fire: '18', medical: '772-00-11' }
```

#### 3. 多个号码（用斜杠分隔，多个选项）
```typescript
'CI': { police: '110/111/170', fire: '180', medical: '185' }
```

## 常见紧急电话模式

### 统一紧急电话（所有情况一个号码）
- **911**: 美国、加拿大、墨西哥、菲律宾等
- **112**: 欧盟标准紧急电话（大部分欧洲国家）
- **999**: 英国、香港、澳门、新加坡等
- **000**: 澳大利亚
- **111**: 新西兰

### 分别的紧急电话
- **中国**: 110 (报警), 119 (火警), 120 (医疗)
- **日本**: 110 (报警), 119 (火警/医疗)
- **韩国**: 112 (报警), 119 (火警/医疗)
- **法国**: 17 (报警), 18 (火警), 15 (医疗)
- **德国**: 110 (报警), 112 (火警/医疗)

## 数据验证

### 已添加的国家/地区

✅ 所有用户提供的国家/地区都已添加

### 特殊处理

1. **UK → GB**: 用户数据中的 'UK' 已转换为标准 ISO 代码 'GB'
2. **重复国家**: 已合并（如 AI, AO 等）
3. **格式统一**: 所有电话号码保持字符串格式

## 运行脚本更新数据库

添加数据后，运行脚本：

```bash
npm run optimize:countries
```

脚本会：
1. 检查每个国家的紧急电话信息
2. 如果缺失，使用映射表中的数据填充
3. 显示更新进度和统计信息

## 数据来源

紧急电话数据来源：
- 各国官方旅游网站
- Wikipedia: Emergency telephone number by country
- 各国驻外使领馆网站
- 国际标准化组织 (ISO) 数据

## 注意事项

1. **多个号码**: 如果国家有多个紧急电话（如 999/112），表示都可以使用
2. **特殊格式**: 某些国家的医疗电话可能包含特殊格式（如 '1300/1212'），已保留原样
3. **地区差异**: 某些国家不同地区可能有不同的紧急电话，使用最常见的号码
4. **更新频率**: 建议每年检查一次，确保数据准确性

## 相关文档

- `docs/POWER-EMERGENCY-DATA-FORMAT.md` - 数据格式详细说明
- `scripts/optimize-country-profiles.ts` - 主脚本文件
