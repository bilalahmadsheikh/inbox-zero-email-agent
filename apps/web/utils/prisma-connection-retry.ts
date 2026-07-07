import { Prisma } from "@/generated/prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("prisma-connection-retry");

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 150;
const JITTER_MS = 250;

/**
 * P2037 is raised when Postgres refuses the connection handshake itself
 * ("remaining connection slots are reserved..."), so the query never
 * executed and retrying is safe for reads and writes alike.
 */
export function isConnectionSlotError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2037"
  );
}

export async function withConnectionSlotRetry<T>(
  run: () => Promise<T>,
  delay: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isConnectionSlotError(error) || attempt >= MAX_ATTEMPTS) {
        throw error;
      }
      const waitMs = Math.round(
        BASE_DELAY_MS * attempt + Math.random() * JITTER_MS,
      );
      logger.warn("Connection slots exhausted; retrying query", {
        attempt,
        waitMs,
      });
      await delay(waitMs);
    }
  }
}

// Must stay the LAST extension in the $extends chain: later extensions run
// closer to the engine, and retrying from outside the encryption extension
// would re-encrypt args that it mutates in place.
export const retryConnectionSlotExhaustion = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      $allOperations({ args, query }) {
        return withConnectionSlotRetry(() => query(args));
      },
    },
  }),
);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
