/**
 * Identity normalization. These are pure string functions so they can be
 * unit-tested without a database, and reused identically by every importer
 * (CSV/XLSX, Google Sheets sync, supplier uploads, invoice parsing) so two
 * imports of "the same" identifier always collide correctly.
 */

/** Barcodes: keep digits only. Handles EAN-13/UPC-A stored with spaces, dashes,
 * leading apostrophes (common Excel artifact), or leading zeros dropped by Excel. */
export function normalizeBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digitsOnly = String(raw).replace(/[^0-9]/g, "");
  if (digitsOnly.length === 0) return null;
  return digitsOnly;
}

export function normalizeAsin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toUpperCase();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export function normalizeSku(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toUpperCase();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/** A syntactically plausible ASIN: 10 uppercase alphanumeric characters. */
export function isValidAsinFormat(asin: string | null | undefined): boolean {
  if (!asin) return false;
  return /^[A-Z0-9]{10}$/.test(asin);
}

/** GTIN/EAN/UPC family: 8, 12, 13, or 14 digits are the plausible lengths. */
export function isValidBarcodeFormat(barcode: string | null | undefined): boolean {
  if (!barcode) return false;
  return /^[0-9]{8}$|^[0-9]{12,14}$/.test(barcode);
}
