import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  experimental: { adapter: true },
  engine: "js",
  adapter: async () => {
    return new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  },
  migrations: {
    path: "prisma/migrations",
  },
});
