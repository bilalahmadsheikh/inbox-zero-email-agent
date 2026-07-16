import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { RuleReadState } from "../../chat-rule-state";
import { trackRuleToolCall } from "./shared";
import { applyRuleUpdate, createRuleUpdatesSchema } from "./update-rule-apply";

export const updateRuleTool = ({
  email,
  emailAccountId,
  provider,
  logger,
  setRuleReadState,
  getRuleReadState,
  onRulesStateExposed,
  hasPendingRuleDeletion,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
  setRuleReadState?: (state: RuleReadState) => void;
  getRuleReadState?: () => RuleReadState | null;
  onRulesStateExposed?: (rulesRevision: number) => void;
  hasPendingRuleDeletion?: (ruleName: string) => boolean;
}) =>
  tool({
    description:
      "Update an existing rule after reading the user's current rules. Use this for direct requests to change rule name, enabled state, conditions, or actions; no capabilities lookup is needed before editing an existing rule. This is a patch: include only the fields being changed, and omitted fields are preserved. Use updates.name to rename a rule. Use updates.condition to change conditions; omit condition fields that should stay unchanged, and set a static field to null only when the user explicitly asks to clear it. Do not set aiInstructions to null to preserve instructions; omit it instead. Use clearAiInstructions only when the user explicitly asks to remove semantic instructions. Use DRAFT_EMAIL for draft reply actions; do not use SEND_EMAIL or REPLY when the user asks to draft. Never use this tool to add/remove a sender or domain from an existing category rule; use updateLearnedPatterns for recurring sender/domain includes and excludes instead. Direct requests to change existing rule behavior are already confirmed; do not create a replacement rule for edits. Exception: updates that ADD send, reply, forward, or webhook actions the rule did not already have return requiresConfirmation — the change is NOT applied until the user confirms the card in the UI, so say it is pending and never claim it was applied.",
    inputSchema: z
      .object({
        ruleName: z.string().describe("The exact current name of the rule."),
        updates: createRuleUpdatesSchema(provider),
      })
      .describe("Patch update for an existing rule."),
    execute: async ({ ruleName, updates }) => {
      trackRuleToolCall({ tool: "update_rule", email, logger });

      return applyRuleUpdate({
        emailAccountId,
        provider,
        logger,
        ruleName,
        updates,
        riskConfirmed: false,
        getRuleReadState,
        hasPendingRuleDeletion,
        setRuleReadState,
        onRulesStateExposed,
      });
    },
  });

export type UpdateRuleTool = InferUITool<ReturnType<typeof updateRuleTool>>;
