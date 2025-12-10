// scripts/check-data-columns.ts
// 检查数据文件的列名，确认是否包含所需字段

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

dotenv.config();

function detectFileType(filePath: string): 'excel' | 'csv' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    return 'excel';
  }
  
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);
  
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03) {
    return 'excel';
  }
  
  return 'csv';
}

function checkCSVColumns(filePath: string) {
  console.log('📋 检查 CSV 文件列名...\n');
  
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n').slice(0, 5); // 只读取前5行
  
  if (lines.length > 0) {
    const headers = parse(lines[0], { columns: true, skip_empty_lines: true });
    const columnNames = Object.keys(headers[0] || {});
    
    console.log('   找到的列名:');
    columnNames.forEach((col, i) => {
      console.log(`     ${i + 1}. ${col}`);
    });
    
    console.log('\n   必需字段检查:');
    const requiredFields = ['出发城市', '到达城市', '日期', '价格(元)', '价格元'];
    requiredFields.forEach(field => {
      const found = columnNames.some(col => col.includes(field) || field.includes(col));
      console.log(`     ${found ? '✅' : '❌'} ${field}`);
    });
    
    console.log('\n   推荐字段检查:');
    const recommendedFields = [
      '里程（公里）', '里程公里', '里程',
      '航空公司', '航司',
      '起飞时间', '起飞',
      '降落时间', '降落'
    ];
    recommendedFields.forEach(field => {
      const found = columnNames.some(col => col === field || col.includes(field) || field.includes(col));
      console.log(`     ${found ? '✅' : '❌'} ${field}`);
    });
    
    // 显示前3行数据示例
    if (lines.length > 1) {
      console.log('\n   数据示例（前3行）:');
      const records = parse(lines.slice(0, 4).join('\n'), {
        columns: true,
        skip_empty_lines: true,
      });
      records.slice(0, 3).forEach((record: any, i: number) => {
        console.log(`\n     第 ${i + 1} 行:`);
        console.log(`       出发城市: ${record['出发城市'] || record['出发'] || 'N/A'}`);
        console.log(`       到达城市: ${record['到达城市'] || record['到达'] || 'N/A'}`);
        console.log(`       日期: ${record['日期'] || 'N/A'}`);
        console.log(`       价格: ${record['价格(元)'] || record['价格元'] || record['价格'] || 'N/A'}`);
        console.log(`       里程: ${record['里程（公里）'] || record['里程公里'] || record['里程'] || 'N/A'}`);
        console.log(`       航空公司: ${record['航空公司'] || record['航司'] || 'N/A'}`);
        console.log(`       起飞时间: ${record['起飞时间'] || record['起飞'] || 'N/A'}`);
        console.log(`       降落时间: ${record['降落时间'] || record['降落'] || 'N/A'}`);
      });
    }
  }
}

function checkExcelColumns(filePath: string) {
  console.log('📋 检查 Excel 文件列名...\n');
  
  const workbook = XLSX.readFile(filePath, { 
    cellDates: false,
    cellNF: false,
    cellStyles: false,
  });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // 读取前几行
  const rawData = XLSX.utils.sheet_to_json(worksheet, { 
    raw: true, 
    defval: null,
    range: 0, // 只读取前几行
  });
  
  if (rawData.length > 0) {
    const columnNames = Object.keys(rawData[0] as object);
    
    console.log('   找到的列名:');
    columnNames.forEach((col, i) => {
      console.log(`     ${i + 1}. ${col}`);
    });
    
    console.log('\n   必需字段检查:');
    const requiredFields = ['出发城市', '到达城市', '日期', '价格(元)', '价格元'];
    requiredFields.forEach(field => {
      const found = columnNames.some(col => col.includes(field) || field.includes(col));
      console.log(`     ${found ? '✅' : '❌'} ${field}`);
    });
    
    console.log('\n   推荐字段检查:');
    const recommendedFields = [
      '里程（公里）', '里程公里', '里程',
      '航空公司', '航司',
      '起飞时间', '起飞',
      '降落时间', '降落'
    ];
    recommendedFields.forEach(field => {
      const found = columnNames.some(col => col === field || col.includes(field) || field.includes(col));
      console.log(`     ${found ? '✅' : '❌'} ${field}`);
    });
    
    // 显示前3行数据示例
    if (rawData.length > 1) {
      console.log('\n   数据示例（前3行）:');
      rawData.slice(0, 3).forEach((record: any, i: number) => {
        console.log(`\n     第 ${i + 1} 行:`);
        console.log(`       出发城市: ${record['出发城市'] || record['出发'] || 'N/A'}`);
        console.log(`       到达城市: ${record['到达城市'] || record['到达'] || 'N/A'}`);
        console.log(`       日期: ${record['日期'] || 'N/A'}`);
        console.log(`       价格: ${record['价格(元)'] || record['价格元'] || record['价格'] || 'N/A'}`);
        console.log(`       里程: ${record['里程（公里）'] || record['里程公里'] || record['里程'] || 'N/A'}`);
        console.log(`       航空公司: ${record['航空公司'] || record['航司'] || 'N/A'}`);
        console.log(`       起飞时间: ${record['起飞时间'] || record['起飞'] || 'N/A'}`);
        console.log(`       降落时间: ${record['降落时间'] || record['降落'] || 'N/A'}`);
      });
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('❌ 请提供数据文件路径');
    console.log('用法: npx ts-node scripts/check-data-columns.ts <文件路径>');
    process.exit(1);
  }
  
  const filePath = path.resolve(args[0]);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }
  
  console.log(`📁 文件: ${filePath}\n`);
  
  const fileType = detectFileType(filePath);
  console.log(`📄 文件类型: ${fileType.toUpperCase()}\n`);
  
  if (fileType === 'csv') {
    checkCSVColumns(filePath);
  } else {
    checkExcelColumns(filePath);
  }
  
  console.log('\n💡 提示:');
  console.log('   - 如果推荐字段显示 ❌，说明数据文件中缺少这些字段');
  console.log('   - 缺少的字段会导致新功能（里程、月度因子、航司数量等）无法使用');
  console.log('   - 如果数据文件确实包含这些字段但列名不同，需要更新导入脚本的列名映射');
}

main();

