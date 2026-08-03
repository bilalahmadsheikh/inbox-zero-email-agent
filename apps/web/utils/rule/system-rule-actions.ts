import { ActionType, type SystemType } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import { ONE_WEEK_MINUTES } from "@/utils/date";
import { getActionTypesForCategoryAction } from "@/utils/rule/consts";
import type { CategoryAction } from "@/utils/actions/rule.validation";
import type { RuleActionCreateData } from "@/utils/rule/rule";

/**
 * Builds the action list for a system rule from the category action a user
 * picked (label, archive, move to folder, ...), resolving label and folder IDs
 * against the account's mailbox.
 *
 * Shared by onboarding and the conversation-rule backfill so both produce
 * identical rules.
 */
export async function getActionsFromCategoryAction({
  emailAccountId,
  ruleName,
  categoryAction,
  label,
  draftReply,
  hasDigest,
  provider,
  logger,
  systemType,
}: {
  emailAccountId: string;
  ruleName: string;
  categoryAction: CategoryAction;
  label: string;
  hasDigest: boolean;
  draftReply: boolean;
  provider: string;
  logger: Logger;
  systemType?: SystemType;
}): Promise<RuleActionCreateData[]> {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  const { base: baseCategoryAction, isDelayed } =
    normalizeCategory(categoryAction);

  const actionTypes = getActionTypesForCategoryAction({
    categoryAction: baseCategoryAction,
    systemType,
    draftReply,
    hasDigest,
  });

  const actions: RuleActionCreateData[] = [];

  for (const actionType of actionTypes) {
    switch (actionType.type) {
      case ActionType.LABEL: {
        const { label: labelName, labelId } = await resolveLabelNameAndId({
          emailProvider,
          label,
          labelId: null,
        });

        logger.info("Resolved label ID for system rule", {
          requestedLabel: label,
          resolvedLabelName: labelName,
          resolvedLabelId: labelId,
          ruleName,
        });

        actions.push({ type: ActionType.LABEL, label: labelName, labelId });
        break;
      }
      case ActionType.MOVE_FOLDER: {
        const folderId =
          await emailProvider.getOrCreateFolderIdByName(ruleName);

        logger.info("Resolved folder ID for system rule", {
          folderName: ruleName,
          resolvedFolderId: folderId,
          categoryAction,
        });

        actions.push({
          type: ActionType.MOVE_FOLDER,
          folderId,
          folderName: ruleName,
          delayInMinutes: isDelayed ? ONE_WEEK_MINUTES : undefined,
        });
        break;
      }
      case ActionType.ARCHIVE: {
        actions.push({
          type: ActionType.ARCHIVE,
          delayInMinutes: isDelayed ? ONE_WEEK_MINUTES : undefined,
        });
        break;
      }
      default: {
        actions.push({ type: actionType.type });
      }
    }
  }

  return actions;
}

function normalizeCategory(action: CategoryAction) {
  switch (action) {
    case "label_archive_delayed":
      return { base: "label_archive" as const, isDelayed: true };
    case "move_folder_delayed":
      return { base: "move_folder" as const, isDelayed: true };
    default:
      return {
        base: action as "label" | "label_archive" | "move_folder",
        isDelayed: false,
      };
  }
}
