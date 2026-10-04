import { redis } from "@/utils/redis";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("reply-tracker-analyzing");

function getKey({ emailAccountId }: { emailAccountId: string }) {
  return `reply-tracker:analyzing:${emailAccountId}`;
}

export async function startAnalyzingReplyTracker({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  // expire in 5 minutes
  await redis.set(key, "true", { ex: 5 * 60 });
}

export async function stopAnalyzingReplyTracker({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  await redis.del(key);
}

export async function isAnalyzingReplyTracker({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  try {
    const result = await redis.get(key);
    return result === "true";
  } catch (error) {
    // This flag only picks the wording of an empty list. A Redis outage or a
    // missing Upstash config used to take the whole Reply Zero page down with
    // it; "not analysing" is the right answer whenever it cannot be known.
    logger.warn("Could not read reply tracker analysing state", { error });
    return false;
  }
}
