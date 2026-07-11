import { TriageTier } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import { labelMessageAndSync } from "@/utils/label.server";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

// Mailbox label (Gmail) / category (Outlook) applied per priority tier.
export const TRIAGE_LABEL_NAMES: Record<TriageTier, string> = {
  [TriageTier.URGENT]: "Priority/Urgent",
  [TriageTier.IMPORTANT]: "Priority/Important",
  [TriageTier.FYI]: "Priority/FYI",
};

// Applies the tier label to the processed message in the user's mailbox.
// Best-effort: labeling must never fail rule processing.
export async function applyTriageLabel({
  client,
  emailAccountId,
  messageId,
  tier,
  logger,
}: {
  client: EmailProvider;
  emailAccountId: string;
  messageId: string;
  tier: TriageTier;
  logger: Logger;
}): Promise<void> {
  try {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { triageLabelsEnabled: true },
    });
    if (!emailAccount?.triageLabelsEnabled) return;

    const labelName = TRIAGE_LABEL_NAMES[tier];
    const existingLabel = await client.getLabelByName(labelName);
    const labelId =
      existingLabel?.id ?? (await client.createLabel(labelName)).id;
    if (!labelId) {
      logger.warn("Triage label could not be resolved", { labelName });
      return;
    }

    await labelMessageAndSync({
      provider: client,
      messageId,
      labelId,
      labelName,
      emailAccountId,
      logger,
    });
  } catch (error) {
    logger.warn("Failed to apply triage label", { error });
  }
}
