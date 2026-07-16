import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { GroupItemType } from "@/generated/prisma/enums";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import { findSenderOnlyOverlapConflict } from "@/utils/rule/sender-scope-overlap";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";
import {
  buildHiddenRuleNotFoundError,
  buildVisibleOrgManagedRuleError,
  trackRuleToolCall,
  validateRuleWasReadRecently,
} from "./shared";

export const updateLearnedPatternsTool = ({
  email,
  emailAccountId,
  logger,
  getRuleReadState,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
  getRuleReadState?: () => RuleReadState | null;
}) =>
  tool({
    description:
      "Update the learned patterns of an existing inbox rule after you have identified the exact rule to change. Use when an existing category rule already fits and the user wants recurring senders added or removed, instead of creating a new rule or editing static from/to fields. Only save patterns the user's current message explicitly identifies or that confirm a concrete proposal you made; never silently widen a rule's senders from your own inference. If a recurring sender should move from one rule to another, apply the exclude on the old rule before the include on the new one; includes that overlap another rule's senders are rejected with the conflicting rule's name.",
    inputSchema: z.object({
      ruleName: z.string().describe("The name of the rule to update"),
      learnedPatterns: z
        .array(
          z
            .object({
              include: z
                .object({
                  from: z
                    .string()
                    .nullish()
                    .describe("Sender pattern to include in the rule."),
                  subject: z
                    .string()
                    .nullish()
                    .describe("Subject pattern to include in the rule."),
                })
                .describe("Patterns that should match the rule.")
                .nullish(),
              exclude: z
                .object({
                  from: z
                    .string()
                    .nullish()
                    .describe("Sender pattern to exclude from the rule."),
                  subject: z
                    .string()
                    .nullish()
                    .describe("Subject pattern to exclude from the rule."),
                })
                .describe("Patterns that should not match the rule.")
                .nullish(),
            })
            .describe("One learned-pattern update entry."),
        )
        .describe("Learned sender and subject patterns to save for the rule.")
        .min(1, "At least one learned pattern is required"),
    }),
    execute: async ({ ruleName, learnedPatterns }) => {
      trackRuleToolCall({ tool: "update_learned_patterns", email, logger });
      try {
        const readValidationError = validateRuleWasReadRecently({
          ruleName,
          getRuleReadState,
        });

        if (readValidationError) {
          return hideToolErrorFromUser({
            success: false,
            error: readValidationError,
          });
        }

        const rule = await prisma.rule.findUnique({
          where: { name_emailAccountId: { name: ruleName, emailAccountId } },
          select: {
            id: true,
            name: true,
            updatedAt: true,
            organizationRuleId: true,
            emailAccount: {
              select: {
                rulesRevision: true,
              },
            },
          },
        });

        if (!rule) {
          return buildHiddenRuleNotFoundError();
        }

        if (rule.organizationRuleId) {
          return buildVisibleOrgManagedRuleError();
        }

        const staleReadError = validateRuleWasReadRecently({
          ruleName,
          getRuleReadState,
          currentRulesRevision: rule.emailAccount.rulesRevision,
          currentRuleUpdatedAt: rule.updatedAt,
        });
        if (staleReadError) {
          return hideToolErrorFromUser({
            success: false,
            error: staleReadError,
          });
        }

        const patternsToSave: Array<{
          type: GroupItemType;
          value: string;
          exclude?: boolean;
        }> = [];

        for (const pattern of learnedPatterns) {
          if (pattern.include?.from) {
            patternsToSave.push({
              type: GroupItemType.FROM,
              value: pattern.include.from,
              exclude: false,
            });
          }

          if (pattern.include?.subject) {
            patternsToSave.push({
              type: GroupItemType.SUBJECT,
              value: pattern.include.subject,
              exclude: false,
            });
          }

          if (pattern.exclude?.from) {
            patternsToSave.push({
              type: GroupItemType.FROM,
              value: pattern.exclude.from,
              exclude: true,
            });
          }

          if (pattern.exclude?.subject) {
            patternsToSave.push({
              type: GroupItemType.SUBJECT,
              value: pattern.exclude.subject,
              exclude: true,
            });
          }
        }

        // Same overlap guard as createRule: an include that another rule
        // already matches on sender scope would make rule selection
        // ambiguous, so reject it and name the conflicting rule instead.
        const includedFromPatterns = patternsToSave
          .filter(
            (pattern) =>
              pattern.type === GroupItemType.FROM && !pattern.exclude,
          )
          .map((pattern) => pattern.value);
        if (includedFromPatterns.length > 0) {
          const overlapConflict = await findSenderOnlyOverlapConflict({
            emailAccountId,
            rule: { from: includedFromPatterns.join(", ") },
            excludeRuleId: rule.id,
          });
          if (overlapConflict) {
            return {
              success: false,
              error: `No patterns were saved. Sender ${overlapConflict.overlappingSenders.join(", ")} already matches the "${overlapConflict.ruleName}" rule. To move the sender, add an exclude to "${overlapConflict.ruleName}" first, then retry this include; otherwise leave it where it is.`,
              conflictingRuleName: overlapConflict.ruleName,
              overlappingSenders: overlapConflict.overlappingSenders,
            };
          }
        }

        if (patternsToSave.length > 0) {
          const result = await saveLearnedPatterns({
            emailAccountId,
            ruleName: rule.name,
            patterns: patternsToSave,
            logger,
          });

          if (result?.error) {
            return {
              success: false,
              error: result.error,
            };
          }
        }

        return { success: true, ruleId: rule.id };
      } catch (error) {
        logger.error("Failed to update learned patterns", { error, ruleName });
        return {
          success: false,
          error: "Failed to update learned patterns",
        };
      }
    },
  });

export type UpdateLearnedPatternsTool = InferUITool<
  ReturnType<typeof updateLearnedPatternsTool>
>;
