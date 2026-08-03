// Backfills missing Reply Zero conversation rules (To Reply, Awaiting Reply,
// FYI, Actioned) on existing email accounts.
//
// Reply Zero classifies every conversation into exactly one of those four
// states, chosen with no knowledge of which rules an account actually has, so a
// missing state leaves that mail with nowhere to go. Onboarding used to create
// three of them only when To Reply had a configured action, and delete them
// otherwise; this repairs accounts left in that state.
//
// Dry run (default, writes nothing):
//   npx tsx --require ./scripts/lib/script-runtime.cjs scripts/backfill-conversation-rules.ts
// Apply:
//   ... scripts/backfill-conversation-rules.ts --apply
// Single account:
//   ... scripts/backfill-conversation-rules.ts --apply --email=someone@example.com

import "dotenv/config";
import { after } from "next/server";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { CONVERSATION_STATUS_TYPES } from "@/utils/reply-tracker/conversation-status-config";
import { getCategoryAction, getRuleConfig } from "@/utils/rule/consts";
import { getActionsFromCategoryAction } from "@/utils/rule/system-rule-actions";
import { upsertSystemRule } from "@/utils/rule/rule";
import type { SystemType } from "@/generated/prisma/enums";

const logger = createScopedLogger("backfill-conversation-rules");

const apply = process.argv.includes("--apply");
const emailArg = process.argv
  .find((arg) => arg.startsWith("--email="))
  ?.split("=")[1];

async function main() {
  console.log(apply ? "MODE: APPLY (writes)" : "MODE: DRY RUN (no writes)");
  if (emailArg) console.log("Limited to:", emailArg);

  const accounts = await prisma.emailAccount.findMany({
    where: emailArg ? { email: emailArg } : undefined,
    select: {
      id: true,
      email: true,
      account: { select: { provider: true } },
      rules: {
        where: { systemType: { in: CONVERSATION_STATUS_TYPES } },
        select: { systemType: true, enabled: true },
      },
    },
    orderBy: { email: "asc" },
  });

  let created = 0;
  let wouldCreate = 0;
  let failed = 0;

  for (const account of accounts) {
    const existing = new Set(account.rules.map((rule) => rule.systemType));
    const missing = CONVERSATION_STATUS_TYPES.filter(
      (type) => !existing.has(type),
    );

    if (!missing.length) {
      console.log(`${account.email.padEnd(30)} ok`);
      continue;
    }

    const provider = account.account?.provider;
    if (!provider) {
      console.log(
        `${account.email.padEnd(30)} SKIPPED - no provider on account`,
      );
      failed += missing.length;
      continue;
    }

    console.log(
      `${account.email.padEnd(30)} missing: ${missing.join(", ")}${apply ? "" : "  (dry run)"}`,
    );

    if (!apply) {
      wouldCreate += missing.length;
      continue;
    }

    for (const systemType of missing) {
      try {
        await createConversationRule({
          emailAccountId: account.id,
          provider,
          systemType,
        });
        created += 1;
        console.log(`  created ${systemType}`);
      } catch (error) {
        failed += 1;
        console.log(`  FAILED  ${systemType}: ${(error as Error).message}`);
      }
    }
  }

  console.log("\n--- summary ---");
  console.log("accounts checked:", accounts.length);
  if (apply) {
    console.log("rules created:", created);
    console.log("failures:", failed);
  } else {
    console.log("rules that would be created:", wouldCreate);
    console.log("accounts unusable (no provider):", failed);
    console.log("\nRe-run with --apply to write these changes.");
  }
}

async function createConversationRule({
  emailAccountId,
  provider,
  systemType,
}: {
  emailAccountId: string;
  provider: string;
  systemType: SystemType;
}) {
  const config = getRuleConfig(systemType);

  const actions = await getActionsFromCategoryAction({
    emailAccountId,
    ruleName: config.name,
    categoryAction: getCategoryAction(systemType, provider),
    label: config.label,
    hasDigest: false,
    draftReply: !!config.draftReply,
    provider,
    logger,
    systemType,
  });

  await upsertSystemRule({
    name: config.name,
    instructions: config.instructions,
    actions,
    emailAccountId,
    systemType,
    runOnThreads: config.runOnThreads,
    enabled: true,
    logger,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    // Rule creation queues its history record through after(); the script
    // runtime runs those immediately, so let them settle before disconnecting.
    await (
      after as typeof after & { pending?: () => Promise<unknown[]> }
    ).pending?.();
    await prisma.$disconnect();
  });
