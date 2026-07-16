import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import {
  executeUpdateAssistantSettings,
  getUpdateAssistantSettingsValidationError,
  isNullableSettingsPath,
  trackSettingsToolCall,
  updateAssistantSettingsInputSchema,
  type UpdateAssistantSettingsLlmInput,
  updateAssistantSettingsLlmInputSchema,
} from "./shared";

export const updateAssistantSettingsTool = ({
  email,
  emailAccountId,
  userId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  userId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Update supported assistant settings. This is the primary tool for writing account settings. Batch multiple setting changes into one call when possible. The ONLY writable paths are: assistant.multiRuleSelection.enabled, assistant.meetingBriefs.enabled, assistant.meetingBriefs.minutesBefore, assistant.meetingBriefs.sendEmail, assistant.attachmentFiling.enabled, assistant.attachmentFiling.prompt, assistant.scheduledCheckIns.config, assistant.draftKnowledgeBase.upsert, and assistant.draftKnowledgeBase.delete. Settings such as the personal signature, writing style, referral signature, follow-up timing, and digest configuration are readable via getAssistantCapabilities but NOT writable here — if the user asks to change one of those, say it must be changed in the app's settings pages instead of guessing a path. Updates are partial: pass only the fields being changed and unspecified fields keep their existing values, including for scheduled check-ins config. The draft knowledge base upsert path creates or updates an entry by title and supports append mode for adding to existing content. For personal instruction changes, use the dedicated updatePersonalInstructions tool instead.",
    inputSchema: updateAssistantSettingsLlmInputSchema,
    execute: async ({ changes }) => {
      trackSettingsToolCall({
        tool: "update_assistant_settings",
        email,
        logger,
      });
      const parsedInput = parseUpdateAssistantSettingsChanges(changes);
      if ("error" in parsedInput) return parsedInput;

      return executeUpdateAssistantSettings({
        emailAccountId,
        userId,
        logger,
        changes: parsedInput.changes,
      });
    },
  });

export type UpdateAssistantSettingsTool = InferUITool<
  ReturnType<typeof updateAssistantSettingsTool>
>;

function parseUpdateAssistantSettingsChanges(
  changes: UpdateAssistantSettingsLlmInput["changes"],
) {
  const nonNullablePaths = changes
    .filter(
      (change) => change.value === null && !isNullableSettingsPath(change.path),
    )
    .map((change) => change.path);

  if (nonNullablePaths.length > 0) {
    return {
      error: `These settings cannot be set to null: ${nonNullablePaths.join(", ")}. Provide a valid value instead.`,
    };
  }

  const normalizedChanges = changes.map((change) => ({
    ...change,
    mode: change.mode ?? undefined,
  }));
  const parsedInput = updateAssistantSettingsInputSchema.safeParse({
    changes: normalizedChanges,
  });
  if (!parsedInput.success) {
    return {
      error: getUpdateAssistantSettingsValidationError(parsedInput.error),
    };
  }

  return parsedInput.data;
}
