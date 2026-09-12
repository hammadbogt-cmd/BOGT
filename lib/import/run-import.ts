import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { SheetData, readCsvMatrix, readXlsxMatrix, fromValuesMatrix } from "./sheet-reader";
import { resolveColumnMap, detectHeaderRow } from "./header-mapping";
import { ALL_SCHEMAS, TargetEntity, schemaForTargetEntity } from "./tab-schemas";
import { importProductStats, ImportCounters } from "./importers/product-stats-importer";
import { importRoverMasterStock } from "./importers/rover-master-importer";
import { importStockIn } from "./importers/stock-in-importer";
import { importStockOut } from "./importers/stock-out-importer";
import { recomputeAllProducts, recomputeProducts } from "../engine/recompute";

export interface RunImportParams {
  targetEntity: TargetEntity;
  sourceType: "CSV" | "XLSX" | "GOOGLE_SHEETS";
  sourceName: string; // workbook name, for display
  buffer?: Buffer; // for CSV/XLSX
  xlsxSheetName?: string;
  sheetData?: SheetData; // pre-built, e.g. from Google Sheets API values.get
  /** Which row of the source held the headers, when sheetData was built by the caller. */
  headerRow?: number;
  triggeredById?: string | null;
  recomputeAfter?: boolean; // default true
}

export interface RunImportResult {
  importJobId: string;
  status: "SUCCEEDED" | "FAILED" | "PARTIAL";
  counters: ImportCounters & { newStockInTxns?: number; newStockOutTxns?: number };
  mappingIssue: { missingRequired: string[]; headersSeen: string[]; headerRow: number } | null;
  /** Which row of the source turned out to hold the column headers. */
  headerRow?: number;
  /** Logical field -> source column, as actually resolved for this run. */
  columnMap?: Record<string, string>;
  /** Source columns present but not used by this tab's mapping. */
  unmatchedHeaders?: string[];
}

/**
 * Single entry point used by BOTH the manual CSV/XLSX upload flow (available
 * today) and the Google Sheets sync engine (spec section 48, wired up once
 * credentials are supplied) — both ultimately produce the same `SheetData`
 * shape and go through identical header-resolution + importer logic, so
 * behavior never diverges between "upload a file" and "click Sync".
 */
export async function runImport(params: RunImportParams, client: PrismaClient = defaultPrisma): Promise<RunImportResult> {
  const schema = schemaForTargetEntity(params.targetEntity);

  const job = await client.importJob.create({
    data: {
      sourceType: params.sourceType as never,
      sourceName: params.sourceName,
      tabName: schema.tabName,
      status: "RUNNING",
      triggeredById: params.triggeredById ?? undefined,
    },
  });

  try {
    // Uploaded files are read as a raw grid so the real header row can be
    // located (some tabs open with a totals/date row above the headers).
    let sheet: SheetData;
    let headerRow = 1;
    if (params.sheetData) {
      sheet = params.sheetData;
      headerRow = params.headerRow ?? 1;
    } else {
      const matrix =
        params.sourceType === "CSV" ? readCsvMatrix(params.buffer!) : readXlsxMatrix(params.buffer!, params.xlsxSheetName ?? schema.tabName);
      const detection = detectHeaderRow(matrix, schema);
      headerRow = detection.headerRow;
      sheet = fromValuesMatrix(matrix, headerRow);
    }

    const resolved = resolveColumnMap(sheet.headers, schema);

    if (resolved.status === "SOURCE_MAPPING_ISSUE") {
      await client.importJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          mappingErrors: resolved.missingRequired.length,
          summary: { missingRequired: resolved.missingRequired, headersSeen: sheet.headers, headerRow },
        },
      });
      await client.alert.create({
        data: {
          type: "SOURCE_MAPPING_ISSUE",
          severity: "CRITICAL",
          message: `${params.sourceName} / ${schema.tabName}: missing required column(s) ${resolved.missingRequired.join(", ")}`,
          metadata: { importJobId: job.id, targetEntity: params.targetEntity, missing: resolved.missingRequired },
        },
      });
      return {
        importJobId: job.id,
        status: "FAILED",
        counters: emptyCounters(),
        mappingIssue: { missingRequired: resolved.missingRequired, headersSeen: sheet.headers.filter((h) => h !== ""), headerRow },
        headerRow,
        columnMap: resolved.map,
        unmatchedHeaders: resolved.unmatchedHeaders,
      };
    }

    let counters: ImportCounters & { newStockInTxns?: number; newStockOutTxns?: number };

    switch (params.targetEntity) {
      case "ALL_PRODUCTS_STATS":
        counters = await importProductStats(client, sheet, resolved.map, "AMAZON_MAIN", job.id);
        break;
      case "OA_USA_PRODUCTS":
        counters = await importProductStats(client, sheet, resolved.map, "OA_USA", job.id);
        break;
      case "ROVER_MASTER_STOCK":
        counters = await importRoverMasterStock(client, sheet, resolved.map, job.id);
        break;
      case "STOCK_IN":
        counters = await importStockIn(client, sheet, resolved.map, job.id);
        break;
      case "STOCK_OUT":
        counters = await importStockOut(client, sheet, resolved.map, job.id);
        break;
      default:
        throw new Error(`Unsupported target entity ${params.targetEntity}`);
    }

    const status = counters.errorCount > 0 && counters.rowsCreated + counters.rowsUpdated === 0 ? "FAILED" : counters.errorCount > 0 ? "PARTIAL" : "SUCCEEDED";

    await client.importJob.update({
      where: { id: job.id },
      data: {
        status: status as never,
        finishedAt: new Date(),
        rowsRead: counters.rowsRead,
        rowsCreated: counters.rowsCreated,
        rowsUpdated: counters.rowsUpdated,
        rowsSkipped: counters.rowsSkipped,
        errorCount: counters.errorCount,
        productsAdded: counters.productsAdded,
        productsUpdated: counters.productsUpdated,
        newStockInTxns: counters.newStockInTxns ?? 0,
        newStockOutTxns: counters.newStockOutTxns ?? 0,
        priceChanges: counters.priceChanges,
        stockChanges: counters.stockChanges,
        unmatchedProducts: counters.unmatchedProducts,
        summary: {
          rowErrors: counters.rowErrors.slice(0, 200),
          headerRow,
          columnMap: resolved.map,
          unmatchedHeaders: resolved.unmatchedHeaders ?? [],
        },
      },
    });

    if (params.recomputeAfter !== false) {
      // Only the products this import actually touched need recomputing.
      const touched = counters.touchedProductIds;
      if (touched && touched.length > 0) await recomputeProducts(touched, client);
      else if (!touched) await recomputeAllProducts(client);
    }

    return {
      importJobId: job.id,
      status,
      counters,
      mappingIssue: null,
      headerRow,
      columnMap: resolved.map,
      unmatchedHeaders: resolved.unmatchedHeaders,
    };
  } catch (err) {
    await client.importJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), summary: { fatalError: err instanceof Error ? err.message : String(err) } },
    });
    throw err;
  }
}

function emptyCounters(): ImportCounters {
  return {
    rowsRead: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    errorCount: 0,
    productsAdded: 0,
    productsUpdated: 0,
    priceChanges: 0,
    stockChanges: 0,
    unmatchedProducts: 0,
    rowErrors: [],
  };
}

export { ALL_SCHEMAS };
