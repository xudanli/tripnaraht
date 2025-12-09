// 将 Excel 文件转换为 CSV（用于大文件处理）
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * 将 Excel 文件转换为 CSV
 */
function convertExcelToCSV(excelPath: string, outputPath?: string): string {
  console.log(`📊 开始转换 Excel 文件: ${excelPath}`);
  
  if (!fs.existsSync(excelPath)) {
    throw new Error(`文件不存在: ${excelPath}`);
  }

  // 如果没有指定输出路径，使用相同的目录和文件名，但扩展名为 .csv
  if (!outputPath) {
    const dir = path.dirname(excelPath);
    const name = path.basename(excelPath, path.extname(excelPath));
    outputPath = path.join(dir, `${name}.csv`);
  }

  console.log(`  正在读取 Excel 文件...`);
  const workbook = XLSX.readFile(excelPath, {
    cellDates: false,
    cellNF: false,
    cellStyles: false,
  });
  
  const sheetName = workbook.SheetNames[0];
  console.log(`  工作表: ${sheetName}`);
  
  const worksheet = workbook.Sheets[sheetName];
  
  // 转换为 CSV
  console.log(`  正在转换为 CSV...`);
  const csv = XLSX.utils.sheet_to_csv(worksheet, { 
    FS: ',',
    blankrows: false,
  });
  
  // 写入文件
  console.log(`  正在写入 CSV 文件: ${outputPath}`);
  fs.writeFileSync(outputPath, csv, 'utf-8');
  
  const stats = fs.statSync(outputPath);
  console.log(`✅ 转换完成！`);
  console.log(`  CSV 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  输出路径: ${outputPath}`);
  
  return outputPath;
}

async function main() {
  const args = process.argv.slice(2);
  const excelPath = args[0];
  const outputPath = args[1];

  if (!excelPath) {
    console.error('❌ 请提供 Excel 文件路径');
    console.log('用法: npm run convert:excel-to-csv <excel文件路径> [输出CSV路径]');
    process.exit(1);
  }

  try {
    const csvPath = convertExcelToCSV(excelPath, outputPath);
    console.log(`\n💡 提示: 现在可以使用 CSV 文件进行流式导入:`);
    console.log(`  npm run import:flight-data ${csvPath}`);
  } catch (error: any) {
    console.error('❌ 转换失败:', error.message);
    process.exit(1);
  }
}

main();



