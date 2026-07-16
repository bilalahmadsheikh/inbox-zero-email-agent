import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import {
  createRule,
  outboundActionsNeedChatRiskConfirmation,
} from "@/utils/rule/rule";
import {
  findSenderOnlyOverlapConflict,
  formatSenderOnlyOverlapError,
} from "@/utils/rule/sender-scope-overlap";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  buildCreateRuleSchemaFromChatToolInput,
  loadRuleSnapshotAfterWrite,
  trackRuleToolCall,
} from "./shared";
import type { RuleReadState } from "../../chat-rule-state";

export const createRuleTool = ({
  email,
  emailAccountId,
  provider,
  logger,
  setRuleReadState,
  onRulesStateExposed,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
  setRuleReadState?: (state: RuleReadState) => void;
  onRulesStateExposed?: (rulesRevision: number) => void;
}) =>
  tool({
    description:
      "Create a new automation rule that runs on future incoming email. Only call this when the user's CURRENT message directly asks for ongoing automation with enough condition and action detail, or confirms a concrete rule you proposed with its exact conditions and actions. A complaint, a one-time cleanup request, or a vague wish (e.g. being tired of promo emails) is NOT a rule request: handle the immediate need or propose the exact rule and ask before creating it. Rules with send, reply, forward, or webhook actions additionally return requiresConfirmation and only exist after the user confirms the card in the UI.",
    inputSchema: createRuleSchema(provider),
    execute: async ({ name, condition, actions }) => {
      trackRuleToolCall({ tool: "create_rule", email, logger });

      try {
        const overlapConflict = await findSenderOnlyOverlapConflict({
          emailAccountId,
          rule: {
            instructions: condition.aiInstructions,
            from: condition.static?.from,
            to: condition.static?.to,
            subject: condition.static?.subject,
          },
        });

        if (overlapConflict) {
          return {
            success: false,
            error: formatSenderOnlyOverlapError(overlapConflict),
            conflictingRuleName: overlapConflict.ruleName,
            overlappingSenders: overlapConflict.overlappingSenders,
          };
        }

        const resultPayload = buildCreateRuleSchemaFromChatToolInput(
          { name, condition, actions },
          provider,
        );

        const { needsConfirmation, riskMessages } =
          outboundActionsNeedChatRiskConfirmation(resultPayload);

        if (needsConfirmation) {
          return {
            success: true,
            actionType: "create_rule" as const,
            requiresConfirmation: true as const,
            confirmationState: "pending" as const,
            riskMessages,
          };
        }

        const rule = await createRule({
          result: resultPayload,
          emailAccountId,
          provider,
          runOnThreads: true,
          logger,
          enablement: { source: "chat" },
        });

        const snapshot = await loadRuleSnapshotAfterWrite({
          emailAccountId,
          logger,
          setRuleReadState,
          onRulesStateExposed,
        });
        const currentRule = snapshot?.rules.find(
          (snapshotRule) => snapshotRule.name === resultPayload.name,
        );

        return {
          success: true,
          ruleId: rule.id,
          currentRule,
        };
      } catch (error) {
        if (isDuplicateError(error, "name")) {
          return {
            success: false,
            error: `A rule named "${name}" already exists. Read the current rules: if the existing rule already serves this purpose, update it with updateRule instead; otherwise retry createRule once with a different, more specific name. Do not abandon the remaining parts of the user's request.`,
            conflictingRuleName: name,
          };
        }

        const message = error instanceof Error ? error.message : String(error);

        logger.error("Failed to create rule", { error });

        return { error: "Failed to create rule", message };
      }
    },
  });

export type CreateRuleTool = InferUITool<ReturnType<typeof createRuleTool>>;
