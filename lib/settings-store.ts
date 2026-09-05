import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./prisma";
import { BusinessSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from "./calc/settings";

let cache: { value: BusinessSettings; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5_000; // short TTL: Settings UI changes should take effect almost immediately

export async function getSettings(client: PrismaClient = defaultPrisma): Promise<BusinessSettings> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  const row = await client.setting.findUnique({ where: { key: SETTINGS_KEY } });
  const value: BusinessSettings = row ? { ...DEFAULT_SETTINGS, ...(row.value as Partial<BusinessSettings>) } : DEFAULT_SETTINGS;
  cache = { value, loadedAt: Date.now() };
  return value;
}

export async function updateSettings(
  patch: Partial<BusinessSettings>,
  changedById: string | null,
  client: PrismaClient = defaultPrisma
): Promise<BusinessSettings> {
  const current = await getSettings(client);
  const next = { ...current, ...patch };

  await client.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next as object, description: "Core business rule configuration" },
    update: { value: next as object },
  });

  await client.settingChange.create({
    data: {
      key: SETTINGS_KEY,
      oldValue: current as object,
      newValue: next as object,
      changedById: changedById ?? undefined,
    },
  });

  cache = { value: next, loadedAt: Date.now() };
  return next;
}

export function invalidateSettingsCache() {
  cache = null;
}
