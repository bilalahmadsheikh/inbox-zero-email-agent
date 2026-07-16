import { z } from "zod";
import { LogicalOperator } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { filterNullProperties } from "@/utils";
import {
  createRuleActionSchema,
  type RuleAction,
} from "@/utils/ai/rule/create-rule-schema";
import {
  AI_INSTRUCTIONS_PROMPT_DESCRIPTION,
  INVALID_STATIC_FROM_MESSAGE,
  isInvalidStaticFromValue,
  STATIC_FROM_CONDITION_DESCRIPTION,
} from "@/utils/ai/rule/rule-condition-descriptions";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  outboundActionsNeedChatRiskConfirmation,
  partialUpdateRule,
  setRuleEnabled,
  updateRuleActions,
} from "@/utils/rule/rule";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type {
  AssistantRuleSnapshot,
  RuleReadState,
} from "../../chat-rule-state";
import {
  buildProviderRuleActionFields,
  buildHiddenRuleNotFoundError,
  buildVisibleOrgManagedRuleError,
  loadRuleSnapshotAfterWrite,
  validateRuleWasReadRecently,
} from "./shared";

export type PatchCondition = {
  aiInstructions?: string;
  clearAiInstructions?: true;
  static?: {
    from?: string | null;
    to?: string | null;
    subject?: string | null;
  } | null;
  conditionalOperator?: LogicalOperator | null;
};

export type RuleUpdatePatch = {
  name?: string;
  enabled?: boolean;
  condition?: PatchCondition;
  actions?: RuleAction[];
};

export type UpdateRuleOutput = {
  success: boolean;
  alreadyApplied?: boolean;
  message?: string;
  ruleId?: string;
  error?: string;
  originalName?: string;
  updatedName?: string;
  originalEnabled?: boolean;
  updatedEnabled?: boolean;
  originalConditions?: {
    aiInstructions: string | null;
    static?: Record<string, string | null>;
    conditionalOperator: string | null;
  };
  updatedConditions?: PatchCondition;
  originalActions?: Array<{
    type: string;
    fields: Record<string, string | null>;
    delayInMinutes?: number | null;
  }>;
  updatedActions?: RuleAction[];
  currentRule?: AssistantRuleSnapshot["rules"][number];
};

export type UpdateRuleRiskPendingOutput = {
  success: true;
  actionType: "update_rule";
  requiresConfirmation: true;
  confirmationState: "pending";
  riskMessages: string[];
  ruleName: string;
  updates: RuleUpdatePatch;
};

// Shared by the chat tool's input schema and the confirmation server action,
// so the payload a user confirms is validated exactly like a fresh tool call.
export function createRuleUpdatesSchema(provider: string) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe("The new rule name, when renaming the rule."),
      enabled: z
        .boolean()
        .optional()
        .describe(
          "Whether the rule should be enabled. Use false for pause/disable, true for enable/resume. For enabled-state-only requests, this should be the only field in updates.",
        ),
      condition: createPatchConditionSchema().optional(),
      actions: z
        .array(createRuleActionSchema(provider))
        .min(1, "Rules must have at least one action.")
        .optional()
        .describe(
          "The full replacement list of actions. Use only when the user explicitly asks to change actions/outcomes. Omit for condition-only, name-only, or enabled-state-only edits; omitted actions are preserved. To remove one action, include every action that should remain and omit the action being removed. Empty action lists are invalid.",
        ),
    })
    .refine((updates) => Object.keys(updates).length > 0, {
      message: "At least one update field is required.",
    });
}

function createPatchConditionSchema() {
  return z
    .object({
      aiInstructions: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          `${AI_INSTRUCTIONS_PROMPT_DESCRIPTION} Omit this field to preserve existing instructions.`,
        ),
      clearAiInstructions: z
        .literal(true)
        .optional()
        .describe(
          "Set to true only when the user explicitly asks to remove the semantic AI instructions from this rule.",
        ),
      static: z
        .object({
          from: z
            .string()
            .transform((v) => (v?.trim() ? v : null))
            .nullable()
            .optional()
            .refine((value) => !isInvalidStaticFromValue(value), {
              message: INVALID_STATIC_FROM_MESSAGE,
            })
            .describe(STATIC_FROM_CONDITION_DESCRIPTION),
          to: z.string().nullish(),
          subject: z.string().nullish(),
        })
        .nullish()
        .describe(
          "Static condition fields to patch. Omit fields to preserve them. To clear one field, pass an object with only that field set to null (e.g. { from: null } to remove just the sender restriction). Setting the whole static object to null clears every static condition; do that only when the user asks to remove them all.",
        ),
      conditionalOperator: z
        .enum([LogicalOperator.AND, LogicalOperator.OR])
        .nullish(),
    })
    .describe(
      "Condition patch. Omitted condition fields are preserved; null clears fields only when explicit.",
    );
}

// Applies a patch update to an existing rule. Newly-introduced outbound or
// webhook actions are the same risk surface as creating such a rule, so
// unless riskConfirmed is set they return a pending confirmation instead of
// writing; the confirmation card re-applies with riskConfirmed once the user
// accepts. Read-state guards only run when getRuleReadState is provided
// (the chat tool passes it; the confirm path re-reads fresh state itself).
export async function applyRuleUpdate({
  emailAccountId,
  provider,
  logger,
  ruleName,
  updates,
  riskConfirmed,
  getRuleReadState,
  hasPendingRuleDeletion,
  setRuleReadState,
  onRulesStateExposed,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
  ruleName: string;
  updates: RuleUpdatePatch;
  riskConfirmed: boolean;
  getRuleReadState?: () => RuleReadState | null;
  hasPendingRuleDeletion?: (ruleName: string) => boolean;
  setRuleReadState?: (state: RuleReadState) => void;
  onRulesStateExposed?: (rulesRevision: number) => void;
}) {
  try {
    if (getRuleReadState) {
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
    }

    const rule = await prisma.rule.findUnique({
      where: { name_emailAccountId: { name: ruleName, emailAccountId } },
      select: {
        id: true,
        name: true,
        enabled: true,
        updatedAt: true,
        organizationRuleId: true,
        instructions: true,
        from: true,
        to: true,
        subject: true,
        conditionalOperator: true,
        emailAccount: {
          select: {
            rulesRevision: true,
          },
        },
        actions: {
          select: {
            type: true,
            content: true,
            label: true,
            to: true,
            cc: true,
            bcc: true,
            replyAll: true,
            subject: true,
            url: true,
            folderName: true,
            delayInMinutes: true,
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

    if (getRuleReadState) {
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
    }

    if (hasPendingRuleDeletion?.(rule.name)) {
      return hideToolErrorFromUser({
        success: false,
        error:
          "Deletion is already pending for this rule. Do not update or disable the same rule after requesting deletion.",
      });
    }

    const originalConditions = {
      aiInstructions: rule.instructions,
      static: filterNullProperties({
        from: rule.from,
        to: rule.to,
        subject: rule.subject,
      }),
      conditionalOperator: rule.conditionalOperator,
    };
    const originalActions = rule.actions.map((action) => ({
      type: action.type,
      fields: filterNullProperties(
        buildProviderRuleActionFields({
          provider,
          fields: {
            label: action.label,
            content: action.content,
            to: action.to,
            cc: action.cc,
            bcc: action.bcc,
            replyAll: action.replyAll,
            subject: action.subject,
            webhookUrl: action.url,
            folderName: action.folderName,
          },
        }),
      ),
      delayInMinutes: action.delayInMinutes,
    }));
    const requestedChangesAlreadyMatchRule = !ruleUpdateHasChanges({
      updates,
      rule,
      originalActions,
    });
    const effectiveUpdates = normalizeRuleUpdates({
      updates,
      rule,
      originalActions,
    });
    if (requestedChangesAlreadyMatchRule) {
      const snapshot = await loadRuleSnapshotAfterWrite({
        emailAccountId,
        logger,
        setRuleReadState,
        onRulesStateExposed,
      });
      const currentRule = snapshot?.rules.find(
        (snapshotRule) => snapshotRule.name === rule.name,
      );

      return {
        success: true,
        alreadyApplied: true,
        message:
          "The requested update already matches the current rule, so no write was applied.",
        ruleId: rule.id,
        originalName: rule.name,
        updatedName: rule.name,
        originalEnabled: rule.enabled,
        updatedEnabled: rule.enabled,
        originalConditions,
        originalActions,
        currentRule,
      };
    }

    if (!riskConfirmed) {
      const riskGate = getUpdateRiskConfirmation({
        rule,
        effectiveUpdates,
        originalActions,
      });
      if (riskGate.needsConfirmation) {
        return {
          success: true as const,
          actionType: "update_rule" as const,
          requiresConfirmation: true as const,
          confirmationState: "pending" as const,
          riskMessages: riskGate.riskMessages,
          ruleName: rule.name,
          updates: effectiveUpdates,
        };
      }
    }

    if (effectiveUpdates.name || effectiveUpdates.condition) {
      await partialUpdateRule({
        ruleId: rule.id,
        emailAccountId,
        data: {
          ...(effectiveUpdates.name && { name: effectiveUpdates.name }),
          ...(effectiveUpdates.condition &&
            buildConditionUpdateData(effectiveUpdates.condition)),
        },
      });
    }

    if (effectiveUpdates.actions) {
      await updateRuleActions({
        ruleId: rule.id,
        actions: effectiveUpdates.actions.map((action) => ({
          type: action.type,
          fields: buildProviderRuleActionFields({
            provider,
            fields: action.fields ?? {},
          }),
          delayInMinutes: action.delayInMinutes ?? null,
        })),
        provider,
        emailAccountId,
        logger,
      });
    }

    if (
      effectiveUpdates.enabled !== undefined &&
      effectiveUpdates.enabled !== rule.enabled
    ) {
      await setRuleEnabled({
        ruleId: rule.id,
        emailAccountId,
        enabled: effectiveUpdates.enabled,
      });
    }

    const snapshot = await loadRuleSnapshotAfterWrite({
      emailAccountId,
      logger,
      setRuleReadState,
      onRulesStateExposed,
    });
    const currentRule = snapshot?.rules.find(
      (snapshotRule) =>
        snapshotRule.name === (effectiveUpdates.name ?? rule.name),
    );

    return {
      success: true,
      ruleId: rule.id,
      originalName: rule.name,
      updatedName: effectiveUpdates.name ?? rule.name,
      originalEnabled: rule.enabled,
      updatedEnabled: effectiveUpdates.enabled ?? rule.enabled,
      originalConditions,
      updatedConditions: effectiveUpdates.condition,
      originalActions,
      updatedActions: effectiveUpdates.actions,
      currentRule,
    };
  } catch (error) {
    logger.error("Failed to update rule", { error, ruleName });

    if (isDuplicateError(error, "name")) {
      return {
        success: false,
        error:
          "No rule was updated. Another rule already uses that name. Ask the user for a different name.",
      };
    }

    return {
      success: false,
      error: "Failed to update rule",
    };
  }
}

// Only actions the rule did not already have are risk-checked: the existing
// risky ones were accepted when they were originally added.
function getUpdateRiskConfirmation({
  rule,
  effectiveUpdates,
  originalActions,
}: {
  rule: {
    name: string;
    instructions: string | null;
    from: string | null;
    to: string | null;
    subject: string | null;
  };
  effectiveUpdates: RuleUpdatePatch;
  originalActions: NonNullable<UpdateRuleOutput["originalActions"]>;
}): { needsConfirmation: boolean; riskMessages: string[] } {
  if (!effectiveUpdates.actions) {
    return { needsConfirmation: false, riskMessages: [] };
  }

  const originalNormalized = new Set(
    originalActions.map((action) =>
      JSON.stringify(normalizeActionForComparison(action)),
    ),
  );
  const newActions = effectiveUpdates.actions.filter(
    (action) =>
      !originalNormalized.has(
        JSON.stringify(normalizeActionForComparison(action)),
      ),
  );
  if (newActions.length === 0) {
    return { needsConfirmation: false, riskMessages: [] };
  }

  const patchData = effectiveUpdates.condition
    ? buildConditionUpdateData(effectiveUpdates.condition)
    : {};
  return outboundActionsNeedChatRiskConfirmation({
    name: effectiveUpdates.name ?? rule.name,
    condition: {
      aiInstructions:
        ("instructions" in patchData
          ? patchData.instructions
          : rule.instructions) ?? undefined,
      static: {
        from: ("from" in patchData ? patchData.from : rule.from) ?? undefined,
        to: ("to" in patchData ? patchData.to : rule.to) ?? undefined,
        subject:
          ("subject" in patchData ? patchData.subject : rule.subject) ??
          undefined,
      },
    },
    actions: newActions,
  });
}

function ruleUpdateHasChanges({
  updates,
  rule,
  originalActions,
}: {
  updates: RuleUpdatePatch;
  rule: {
    conditionalOperator: LogicalOperator | null;
    enabled: boolean;
    from: string | null;
    instructions: string | null;
    name: string;
    subject: string | null;
    to: string | null;
  };
  originalActions: NonNullable<UpdateRuleOutput["originalActions"]>;
}) {
  if (updates.name !== undefined && updates.name !== rule.name) return true;
  if (updates.enabled !== undefined && updates.enabled !== rule.enabled) {
    return true;
  }
  if (updates.condition && conditionChangesRule(updates.condition, rule)) {
    return true;
  }
  if (
    updates.actions &&
    !actionsLookCopiedFromRule(updates.actions, originalActions)
  ) {
    return true;
  }

  return false;
}

function conditionChangesRule(
  condition: PatchCondition,
  rule: {
    conditionalOperator: LogicalOperator | null;
    from: string | null;
    instructions: string | null;
    subject: string | null;
    to: string | null;
  },
) {
  if ("aiInstructions" in condition) {
    if (condition.aiInstructions !== rule.instructions) return true;
  }
  if (
    condition.clearAiInstructions &&
    !("aiInstructions" in condition) &&
    rule.instructions !== null
  ) {
    return true;
  }
  if (
    "conditionalOperator" in condition &&
    condition.conditionalOperator !== rule.conditionalOperator
  ) {
    return true;
  }
  if ("static" in condition) {
    return !staticLooksCopiedFromRule(condition.static, rule);
  }

  return false;
}

function normalizeRuleUpdates({
  updates,
  rule,
  originalActions,
}: {
  updates: RuleUpdatePatch;
  rule: {
    conditionalOperator: LogicalOperator | null;
    from: string | null;
    instructions: string | null;
    name: string;
    subject: string | null;
    to: string | null;
  };
  originalActions: NonNullable<UpdateRuleOutput["originalActions"]>;
}): RuleUpdatePatch {
  const normalized = { ...updates };
  if (normalized.name === rule.name) normalized.name = undefined;
  if (
    normalized.condition &&
    conditionLooksCopiedFromRule(normalized.condition, rule)
  ) {
    normalized.condition = undefined;
  }
  if (
    normalized.actions &&
    actionsLookCopiedFromRule(normalized.actions, originalActions)
  ) {
    normalized.actions = undefined;
  }

  return normalized;
}

function conditionLooksCopiedFromRule(
  condition: PatchCondition,
  rule: {
    conditionalOperator: LogicalOperator | null;
    from: string | null;
    instructions: string | null;
    subject: string | null;
    to: string | null;
  },
) {
  return !conditionChangesRule(condition, rule);
}

function staticLooksCopiedFromRule(
  staticCondition: PatchCondition["static"] | undefined,
  rule: { from: string | null; subject: string | null; to: string | null },
) {
  if (staticCondition === undefined) return true;
  if (staticCondition === null) {
    return rule.from === null && rule.to === null && rule.subject === null;
  }

  return (
    (!("from" in staticCondition) ||
      normalizeNullableString(staticCondition.from) === rule.from) &&
    (!("to" in staticCondition) ||
      normalizeNullableString(staticCondition.to) === rule.to) &&
    (!("subject" in staticCondition) ||
      normalizeNullableString(staticCondition.subject) === rule.subject)
  );
}

function actionsLookCopiedFromRule(
  actions: RuleAction[],
  originalActions: NonNullable<UpdateRuleOutput["originalActions"]>,
) {
  return (
    JSON.stringify(actions.map(normalizeActionForComparison)) ===
    JSON.stringify(originalActions.map(normalizeActionForComparison))
  );
}

function normalizeActionForComparison(action: {
  delayInMinutes?: number | null;
  fields?: Record<string, string | null> | null;
  type: string;
}) {
  return {
    type: action.type,
    delayInMinutes: action.delayInMinutes ?? null,
    fields: Object.fromEntries(
      Object.entries(action.fields ?? {})
        .map(([key, value]) => [key, normalizeNullableString(value)] as const)
        .filter(([, value]) => value !== null)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

function normalizeNullableString(value: string | null | undefined) {
  if (value === undefined || value === null || value === "null") return null;
  return value;
}

function buildConditionUpdateData(condition: PatchCondition) {
  const data: {
    instructions?: string | null;
    from?: string | null;
    to?: string | null;
    subject?: string | null;
    conditionalOperator?: LogicalOperator;
  } = {};

  if (condition.aiInstructions !== undefined) {
    data.instructions = condition.aiInstructions;
  } else if (condition.clearAiInstructions) {
    data.instructions = null;
  }

  if (condition.conditionalOperator) {
    data.conditionalOperator = condition.conditionalOperator;
  }

  if ("static" in condition) {
    if (condition.static === null) {
      data.from = null;
      data.to = null;
      data.subject = null;
    } else if (condition.static) {
      if ("from" in condition.static) data.from = condition.static.from ?? null;
      if ("to" in condition.static) data.to = condition.static.to ?? null;
      if ("subject" in condition.static) {
        data.subject = condition.static.subject ?? null;
      }
    }
  }

  return data;
}
