import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma is configured to use the "client" (query-compiler) engine type with the
// @prisma/adapter-pg driver adapter. This avoids needing to download native/wasm
// query-engine binaries at runtime, and connects directly through `pg`.
//
// See prisma.config.ts for the equivalent setup used by the Prisma CLI
// (schema engine, migrations).

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
