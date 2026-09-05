import { createHash } from "node:crypto";

/**
 * Stable fingerprint for one source row so re-importing/re-syncing the same
 * spreadsheet rows never creates duplicate transactions (spec section 48:
 * "clicking Sync multiple times without changes must NOT duplicate data").
 *
 * Built from the fields that identify a real-world event: which tab, the
 * date, the barcode, the quantity, and (for Stock_IN) the invoice ID. Two
 * genuinely different rows that happen to share all of these are
 * astronomically unlikely for this dataset's shape; a hash keeps the
 * unique-constraint column short regardless of input size.
 */
export function rowFingerprint(parts: (string | number | null | undefined)[]): string {
  const normalized = parts.map((p) => (p === null || p === undefined ? "" : String(p).trim().toLowerCase())).join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function stockInFingerprint(params: {
  date: Date;
  invoiceId: string | null;
  barcode: string;
  qty: number;
}): string {
  return rowFingerprint(["STOCK_IN", params.date.toISOString().slice(0, 10), params.invoiceId, params.barcode, params.qty]);
}

export function stockOutFingerprint(params: {
  date: Date;
  barcode: string;
  qty: number;
  shipmentReference: string | null;
}): string {
  return rowFingerprint(["STOCK_OUT", params.date.toISOString().slice(0, 10), params.barcode, params.qty, params.shipmentReference]);
}
