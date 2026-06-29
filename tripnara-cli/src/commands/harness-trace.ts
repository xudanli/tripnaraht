import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  extractHarnessTraceObservability,
  formatHarnessTraceObservabilityLine,
  listHarnessTraceFiles,
  readHarnessTraceJson,
  resolveHarnessTraceAbsolutePath,
} from "../core/harness-observability.util";

export function registerHarnessTraceCommands(harness: Command): void {
  const trace = harness
    .command("trace")
    .description("Harness trace artifacts (on-failure export / observability paths)");

  trace
    .command("list")
    .description("List recent trace JSON files under export dir")
    .option(
      "--dir <path>",
      "export directory",
      process.env.HARNESS_TRACE_EXPORT_DIR ?? "artifacts/harness-on-failure",
    )
    .option("--limit <n>", "max files", "15")
    .action((opts: { dir: string; limit: string }) => {
      const limit = Math.max(1, parseInt(opts.limit, 10) || 15);
      const absDir = path.isAbsolute(opts.dir) ? opts.dir : path.join(process.cwd(), opts.dir);
      if (!fs.existsSync(absDir)) {
        console.error(`[harness trace list] directory not found: ${absDir}`);
        process.exitCode = 1;
        return;
      }
      const files = listHarnessTraceFiles(absDir, limit);
      if (files.length === 0) {
        console.log(`(no .json traces under ${absDir})`);
        return;
      }
      for (const f of files) {
        const rel = path.relative(process.cwd(), f) || f;
        const size = fs.statSync(f).size;
        console.log(`${rel}  ${size}B`);
      }
    });

  trace
    .command("show")
    .description("Pretty-print a trace JSON file (path or observability export path)")
    .argument("<path>", "relative/absolute trace json path")
    .action((filePath: string) => {
      try {
        const data = readHarnessTraceJson(filePath);
        console.log(JSON.stringify(data, null, 2));
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });

  trace
    .command("open")
    .description("Resolve export path and print absolute location (+ optional cat)")
    .argument("<export-path>", "observability.harness_trace_export_path")
    .option("--print", "also print JSON body", false)
    .action((exportPath: string, opts: { print?: boolean }) => {
      const abs = resolveHarnessTraceAbsolutePath(exportPath);
      console.log(abs);
      if (!fs.existsSync(abs)) {
        console.error("[harness trace open] file missing on disk");
        process.exitCode = 1;
        return;
      }
      if (opts.print) {
        const data = readHarnessTraceJson(exportPath);
        console.log(JSON.stringify(data, null, 2));
      }
    });

  trace
    .command("from-response")
    .description("Extract harness observability fields from a saved route_and_run JSON file")
    .argument("<response.json>", "saved API response")
    .option("--show", "pretty-print trace file if export path exists", false)
    .action((responseFile: string, opts: { show?: boolean }) => {
      const abs = path.isAbsolute(responseFile)
        ? responseFile
        : path.join(process.cwd(), responseFile);
      if (!fs.existsSync(abs)) {
        console.error(`file not found: ${abs}`);
        process.exitCode = 1;
        return;
      }
      const root = JSON.parse(fs.readFileSync(abs, "utf8")) as unknown;
      const slice = extractHarnessTraceObservability(root);
      console.log(formatHarnessTraceObservabilityLine(slice));
      if (opts.show && slice.harness_trace_export_path) {
        console.log("--- trace ---");
        console.log(JSON.stringify(readHarnessTraceJson(slice.harness_trace_export_path), null, 2));
      }
    });
}
