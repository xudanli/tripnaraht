import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  collectHarnessBadcaseCatalog,
  defaultBadcaseCatalogPath,
  formatBadcaseEntryLine,
  loadBadcaseCatalog,
  searchBadcaseEntries,
} from "../core/harness-badcase-catalog.util";

export function registerHarnessBadcaseCommands(harness: Command): void {
  const badcase = harness
    .command("badcase")
    .description("On-failure trace badcase catalog (collect / list / search)");

  badcase
    .command("collect")
    .description("Scan HARNESS_TRACE_EXPORT_DIR and upsert artifacts/harness-badcases/catalog.json")
    .option(
      "--dir <path>",
      "trace export directory",
      process.env.HARNESS_TRACE_EXPORT_DIR ?? "artifacts/harness-on-failure",
    )
    .option("--catalog <path>", "catalog.json output path")
    .option("--limit <n>", "max trace files to scan", "500")
    .option("--json", "print result JSON", false)
    .action((opts: { dir: string; catalog?: string; limit: string; json?: boolean }) => {
      try {
        const result = collectHarnessBadcaseCatalog({
          exportDir: opts.dir,
          catalogPath: opts.catalog,
          limit: parseInt(opts.limit, 10) || 500,
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(
          `collected catalog=${result.catalogPath} added=${result.added} updated=${result.updated} total=${result.total}`,
        );
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });

  badcase
    .command("list")
    .description("List badcase catalog entries (newest first)")
    .option("--catalog <path>", "catalog.json path")
    .option("--limit <n>", "max rows", "20")
    .option("--json", "print entries JSON", false)
    .action((opts: { catalog?: string; limit: string; json?: boolean }) => {
      const catalogPath = opts.catalog ?? defaultBadcaseCatalogPath();
      const catalog = loadBadcaseCatalog(catalogPath);
      if (!catalog) {
        console.error(`catalog not found: ${catalogPath} (run \`tripnara harness badcase collect\`)`);
        process.exitCode = 1;
        return;
      }
      const limit = Math.max(1, parseInt(opts.limit, 10) || 20);
      const rows = catalog.entries.slice(0, limit);
      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      console.log(`catalog=${catalogPath} total=${catalog.entries.length} showing=${rows.length}`);
      for (const e of rows) {
        console.log(formatBadcaseEntryLine(e));
      }
    });

  badcase
    .command("search")
    .description("Search catalog by request_id / phase / violation code / otel trace")
    .argument("<query>", "search needle")
    .option("--catalog <path>", "catalog.json path")
    .option("--limit <n>", "max rows", "20")
    .option("--json", "print matches JSON", false)
    .action(
      (
        query: string,
        opts: { catalog?: string; limit: string; json?: boolean },
      ) => {
        const catalogPath = opts.catalog ?? defaultBadcaseCatalogPath();
        const catalog = loadBadcaseCatalog(catalogPath);
        if (!catalog) {
          console.error(`catalog not found: ${catalogPath}`);
          process.exitCode = 1;
          return;
        }
        const matches = searchBadcaseEntries(catalog, query);
        const limit = Math.max(1, parseInt(opts.limit, 10) || 20);
        const rows = matches.slice(0, limit);
        if (opts.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }
        console.log(`matches=${matches.length} showing=${rows.length} query=${query}`);
        for (const e of rows) {
          console.log(formatBadcaseEntryLine(e));
        }
      },
    );

  badcase
    .command("open")
    .description("Print absolute path to a catalog entry trace file")
    .argument("<id>", "catalog entry id")
    .option("--catalog <path>", "catalog.json path")
    .action((id: string, opts: { catalog?: string }) => {
      const catalogPath = opts.catalog ?? defaultBadcaseCatalogPath();
      const catalog = loadBadcaseCatalog(catalogPath);
      const entry = catalog?.entries.find((e) => e.id === id);
      if (!entry) {
        console.error(`entry not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(entry.trace_file);
      if (!fs.existsSync(entry.trace_file)) {
        console.error("[badcase open] trace file missing on disk");
        process.exitCode = 1;
      }
    });
}
