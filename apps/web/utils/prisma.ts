import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions/db-connections";
import { Pool } from "pg";
import { env } from "@/env";
import { PrismaClient } from "@/generated/prisma/client";
import { encryptedTokens } from "@/utils/prisma-extensions";
import { auditPrismaQueries } from "@/utils/audit/prisma-extension";
import { retryConnectionSlotExhaustion } from "@/utils/prisma-connection-retry";

declare global {
  var prisma: PrismaClient | undefined;
}

const _prisma = global.prisma || createPrismaClient();

if (env.NODE_ENV === "development") global.prisma = _prisma;

export default _prisma;

function createPrismaClient() {
  const pool = new Pool({
    connectionString: env.PREVIEW_DATABASE_URL ?? env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX ?? 5,
  });

  // Serverless instances are frozen after responding, which suspends the
  // event loop so the pool's idle timer never fires and connections are
  // held until Postgres runs out of slots. This keeps the instance alive
  // until idle connections have actually closed.
  if (process.env.VERCEL) attachDatabasePool(pool);

  // Create the Prisma client with extensions, but cast it back to PrismaClient for type compatibility.
  // retryConnectionSlotExhaustion must stay last: later extensions run closer
  // to the engine, and retrying from outside encryptedTokens would re-encrypt
  // args that it mutates in place.
  return new PrismaClient({ adapter: new PrismaPg(pool) })
    .$extends(encryptedTokens)
    .$extends(auditPrismaQueries)
    .$extends(retryConnectionSlotExhaustion) as unknown as PrismaClient;
}
