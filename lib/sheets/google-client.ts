import { google, sheets_v4 } from "googleapis";

export interface ServiceAccountStatus {
  configured: boolean;
  clientEmail?: string;
  error?: string;
}

/**
 * Reads a Google service-account key from GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
 * (either the raw JSON, or a path to a JSON file — both are supported so the
 * key can be dropped in as a file and referenced by path in .env).
 *
 * Nothing calls Google until credentials actually exist: until then every
 * sync attempt cleanly reports CONNECTION_REQUIRED instead of throwing, per
 * spec section 48 ("If Google authorization expires or access fails,
 * clearly show CONNECTION REQUIRED. Do not show outdated data as though it
 * has just synced.").
 */
export function getServiceAccountStatus(): ServiceAccountStatus {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
  if (!raw || raw.trim() === "") {
    return { configured: false };
  }
  try {
    const json = raw.trim().startsWith("{") ? raw : require("node:fs").readFileSync(raw, "utf-8");
    const parsed = JSON.parse(json);
    if (!parsed.client_email || !parsed.private_key) {
      return { configured: false, error: "Service account JSON is missing client_email/private_key" };
    }
    return { configured: true, clientEmail: parsed.client_email };
  } catch (err) {
    return { configured: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function getSheetsClient(): sheets_v4.Sheets {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("CONNECTION_REQUIRED: no service account configured");
  const json = raw.trim().startsWith("{") ? raw : require("node:fs").readFileSync(raw, "utf-8");
  const credentials = JSON.parse(json);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth: auth as never });
}

/** Read-only by default (spec section 48: "READ-ONLY toward my existing Google Sheets unless I explicitly enable write-back"). */
export async function fetchTabValues(spreadsheetId: string, tabName: string): Promise<unknown[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'`,
  });
  return (res.data.values as unknown[][]) ?? [];
}

/** Only used when a user explicitly enables write-back for a specific column (spec: "Future Write-Back"). Off by default. */
export async function writeBackCell(spreadsheetId: string, tabName: string, a1Range: string, value: string | number) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!${a1Range}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}
