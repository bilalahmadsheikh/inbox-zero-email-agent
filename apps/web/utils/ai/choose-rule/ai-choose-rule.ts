import { z } from "zod";
import { TriageTier } from "@/generated/prisma/enums";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { isDefined, type EmailForLLM } from "@/utils/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import {
  appendOllamaOnlySystemGuidance,
  isOllamaProvider,
} from "@/utils/llms/ollama-guidance";
import { getUserInfoPrompt, getUserRulesPrompt } from "@/utils/ai/helpers";
import { sortRulesForAutomation } from "@/utils/rule/sort";
import type { Logger } from "@/utils/logger";
import type { ClassificationFeedbackItem } from "@/utils/rule/classification-feedback";

type GetAiResponseOptions = {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: { name: string; instructions: string; systemType?: string | null }[];
  modelType?: ModelType;
  classificationFeedback?: ClassificationFeedbackItem[] | null;
};

export type EmailTriage = {
  tier: TriageTier;
  reason: string;
};

const TRIAGE_TIER_VALUES = [
  TriageTier.URGENT,
  TriageTier.IMPORTANT,
  TriageTier.FYI,
] as const;

const MAX_TRIAGE_REASON_WORDS = 15;

const triageSchemaFields = {
  triageTier: z
    .enum(TRIAGE_TIER_VALUES)
    .describe(
      "Priority tier for this email, independent of rule matching. URGENT: needs the user's action or attention right away. IMPORTANT: deserves attention soon. FYI: no action needed.",
    ),
  triageReason: z
    .string()
    .describe(
      "One-line explanation (15 words max) telling the user exactly why this email got its tier. Be specific to this email.",
    ),
};

const TRIAGE_PROMPT_SECTION = `<triage>
  Always classify this email into a priority tier (triageTier) with a one-line reason (triageReason), even when no rule matches:
  - URGENT: needs the user's action or attention right away (hard deadlines, emergencies, blocking requests, time-critical problems).
  - IMPORTANT: matters to the user and deserves attention soon (real work, decisions, questions from people they know).
  - FYI: no action needed (updates, newsletters, marketing, receipts, automated notifications).
  The triageReason must be specific to this email, at most 15 words, and written for the user (e.g. "Boss asked for the report by 5pm today").
</triage>`;

export async function aiChooseRule<
  T extends { name: string; instructions: string; systemType?: string | null },
>({
  email,
  rules,
  emailAccount,
  modelType,
  logger,
  classificationFeedback,
}: {
  email: EmailForLLM;
  rules: T[];
  emailAccount: EmailAccountWithAI;
  modelType?: ModelType;
  logger: Logger;
  classificationFeedback?: ClassificationFeedbackItem[] | null;
}): Promise<{
  rules: { rule: T; isPrimary?: boolean }[];
  reason: string;
  triage: EmailTriage | null;
}> {
  if (!rules.length) {
    return { rules: [], reason: "No rules to evaluate", triage: null };
  }

  const orderedRules = sortRulesForAutomation(rules);

  const { result: aiResponse } = await getAiResponse({
    email,
    rules: orderedRules,
    emailAccount,
    modelType,
    classificationFeedback,
  });

  const rulesWithMetadata = aiResponse.matchedRules
    .map((match) => {
      if (!match.ruleName) return;
      const rule = orderedRules.find(
        (r) => r.name.toLowerCase() === match.ruleName.toLowerCase(),
      );
      return rule ? { rule, isPrimary: match.isPrimary } : undefined;
    })
    .filter(isDefined);

  logAiChooseRuleResult({
    aiResponse,
    logger,
    orderedRules,
    rulesWithMetadata,
  });

  const triage = buildTriage(aiResponse);

  if (aiResponse.noMatchFound) {
    return {
      rules: [],
      reason: aiResponse.reasoning || "AI determined no rules matched",
      triage,
    };
  }

  return {
    rules: rulesWithMetadata,
    reason: aiResponse.reasoning,
    triage,
  };
}

async function getAiResponse(options: GetAiResponseOptions): Promise<{
  result: {
    matchedRules: { ruleName: string; isPrimary?: boolean }[];
    reasoning: string;
    noMatchFound: boolean;
    triageTier?: string;
    triageReason?: string;
  };
  modelOptions: ReturnType<typeof getModel>;
}> {
  const {
    email,
    emailAccount,
    rules,
    modelType = "default",
    classificationFeedback,
  } = options;

  const modelOptions = getModel(emailAccount.user, modelType);

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Choose rule",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
  });

  const hasCustomRules = rules.some((rule) => !rule.systemType);

  if (hasCustomRules && emailAccount.multiRuleSelectionEnabled) {
    const result = await getAiResponseMultiRule({
      email,
      emailAccount,
      rules,
      modelOptions,
      generateObject,
      classificationFeedback,
    });

    return { result, modelOptions };
  } else {
    return getAiResponseSingleRule({
      email,
      emailAccount,
      rules,
      modelOptions,
      generateObject,
      classificationFeedback,
    });
  }
}

async function getAiResponseSingleRule({
  email,
  emailAccount,
  rules,
  modelOptions,
  generateObject,
  classificationFeedback,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: GetAiResponseOptions["rules"];
  modelOptions: ReturnType<typeof getModel>;
  generateObject: ReturnType<typeof createGenerateObject>;
  classificationFeedback?: ClassificationFeedbackItem[] | null;
}) {
  const system = `You are an AI assistant that helps people manage their emails.

<instructions>
  IMPORTANT: Follow these instructions carefully when selecting a rule:

  <priority>
  1. Match the email to a SPECIFIC user-defined rule that addresses the email's exact content or purpose.
  2. If the email doesn't match any specific rule but the user has a catch-all rule (like "emails that don't match other criteria"), use that catch-all rule.
  3. Only set "noMatchFound" to true if no user-defined rule can reasonably apply.
  4. Be concise in your reasoning - avoid repetitive explanations.
  5. Provide only the exact rule name from the list below.
  </priority>

  <guidelines>
  - If a rule says to exclude certain types of emails, DO NOT select that rule for those excluded emails.
  - When multiple rules match, choose the more specific one that best matches the email's content.
  - Rules about requiring replies should be prioritized when the email clearly needs a response.
  ${METADATA_GUIDELINE}
  </guidelines>

  ${TRIAGE_PROMPT_SECTION}
</instructions>

${getUserRulesPrompt({ rules })}

${formatClassificationFeedback(classificationFeedback)}

${getUserInfoPrompt({ emailAccount })}

Respond with a valid JSON object:

Example response format:
{
  "reasoning": "This email is a newsletter subscription",
  "ruleName": "Newsletter",
  "noMatchFound": false,
  "triageTier": "FYI",
  "triageReason": "Weekly newsletter, no response or action needed"
}`;

  const prompt = `Select a rule to apply to this email that was sent to me:

<email>
${stringifyEmail(email, 500)}
</email>${email.listUnsubscribe ? "\nNote: This email has a List-Unsubscribe header." : ""}`;

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      reasoning: z
        .string()
        .describe("The reason you chose the rule. Keep it concise"),
      ruleName: z
        .string()
        .nullable()
        .describe("The exact name of the rule you want to apply"),
      noMatchFound: z
        .boolean()
        .describe("True if no match was found, false otherwise"),
      ...triageSchemaFields,
    }),
  });

  const hasRuleName = !!aiResponse.object?.ruleName;

  return {
    result: {
      matchedRules:
        hasRuleName && aiResponse.object.ruleName
          ? [{ ruleName: aiResponse.object.ruleName, isPrimary: true }]
          : [],
      noMatchFound: aiResponse.object?.noMatchFound ?? !hasRuleName,
      reasoning: aiResponse.object?.reasoning,
      triageTier: aiResponse.object?.triageTier,
      triageReason: aiResponse.object?.triageReason,
    },
    modelOptions,
  };
}

async function getAiResponseMultiRule({
  email,
  emailAccount,
  rules,
  modelOptions,
  generateObject,
  classificationFeedback,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: GetAiResponseOptions["rules"];
  modelOptions: ReturnType<typeof getModel>;
  generateObject: ReturnType<typeof createGenerateObject>;
  classificationFeedback?: ClassificationFeedbackItem[] | null;
}) {
  const rulesSection = rules
    .map(
      (rule) =>
        `<rule>\n<name>${rule.name}</name>\n<instructions>${rule.instructions}</instructions>\n</rule>`,
    )
    .join("\n");

  const system = `You are an AI assistant that helps people manage their emails.

<instructions>
  IMPORTANT: Follow these instructions carefully when selecting rules:

  <priority>
  - Review all available rules and select those that genuinely match this email.
  - You can select multiple rules, but BE SELECTIVE - it's rare that you need to select more than 1-2 rules.
  - Only set "noMatchFound" to true if no rules can reasonably apply. There is usually a rule that matches.
  </priority>

  <isPrimary_field>
  - When returning multiple rules, mark ONLY ONE rule as the primary match (isPrimary: true).
  - The primary rule should be the MOST SPECIFIC rule that best matches the email's content and purpose.
  </isPrimary_field>

  <guidelines>
  - If a rule says to exclude certain types of emails, DO NOT select that rule for those excluded emails.
  - Do not be greedy - only select rules that add meaningful context.
  - Be concise in your reasoning - avoid repetitive explanations.
  ${METADATA_GUIDELINE}
  </guidelines>

  ${TRIAGE_PROMPT_SECTION}
</instructions>

<available_rules>
${rulesSection}
</available_rules>

${formatClassificationFeedback(classificationFeedback)}

${getUserInfoPrompt({ emailAccount })}

Respond with a valid JSON object:

Example response format (single rule):
{
  "matchedRules": [{ "ruleName": "Newsletter", "isPrimary": true }],
  "noMatchFound": false,
  "reasoning": "This is a newsletter subscription",
  "triageTier": "FYI",
  "triageReason": "Weekly newsletter, no response or action needed"
}

Example response format (multiple rules):
{
  "matchedRules": [
    { "ruleName": "To Reply", "isPrimary": true },
    { "ruleName": "Team Emails", "isPrimary": false }
  ],
  "noMatchFound": false,
  "reasoning": "This email requires a response and is from a team member",
  "triageTier": "IMPORTANT",
  "triageReason": "Teammate is waiting on your answer about the launch plan"
}`;

  const prompt = `Select all rules that apply to this email that was sent to me:

<email>
${stringifyEmail(email, 500)}
</email>${email.listUnsubscribe ? "\nNote: This email has a List-Unsubscribe header." : ""}`;

  const aiResponse = await generateObject({
    ...modelOptions,
    system: appendOllamaOnlySystemGuidance(
      { system },
      modelOptions,
      OLLAMA_MULTI_RULE_SELECTION_GUIDANCE,
    ).system,
    prompt,
    schema: z.object({
      matchedRules: z
        .array(
          z.object({
            ruleName: z.string().describe("The exact name of the rule"),
            isPrimary: z
              .boolean()
              .describe(
                "True if the rule is the primary match, false otherwise",
              ),
          }),
        )
        .describe("Array of all matching rules"),
      reasoning: z
        .string()
        .describe(
          "The reasoning you used to choose the rules. Keep it concise",
        ),
      noMatchFound: z
        .boolean()
        .describe("True if no match was found, false otherwise"),
      ...triageSchemaFields,
    }),
  });

  const response = {
    matchedRules: aiResponse.object.matchedRules || [],
    noMatchFound: aiResponse.object?.noMatchFound ?? false,
    reasoning: aiResponse.object?.reasoning ?? "",
    triageTier: aiResponse.object?.triageTier,
    triageReason: aiResponse.object?.triageReason,
  };

  if (isOllamaProvider(modelOptions.provider)) {
    const primaryRule = response.matchedRules.find((rule) => rule.isPrimary);
    if (primaryRule) return { ...response, matchedRules: [primaryRule] };
  }

  return response;
}

const METADATA_GUIDELINE =
  "- Consider email metadata (e.g. List-Unsubscribe headers) alongside content.";

function logAiChooseRuleResult<
  T extends { name: string; systemType?: string | null },
>({
  aiResponse,
  logger,
  orderedRules,
  rulesWithMetadata,
}: {
  aiResponse: {
    matchedRules: { ruleName: string; isPrimary?: boolean }[];
    reasoning: string;
    noMatchFound: boolean;
  };
  logger: Logger;
  orderedRules: T[];
  rulesWithMetadata: { rule: T; isPrimary?: boolean }[];
}) {
  const candidateRuleNames = orderedRules.map((rule) => rule.name);
  const returnedRuleNames = aiResponse.matchedRules
    .map((match) => match.ruleName)
    .filter(Boolean);
  const resolvedRuleNames = rulesWithMetadata.map(({ rule }) => rule.name);
  const unresolvedRuleNames = returnedRuleNames.filter(
    (ruleName) =>
      !orderedRules.some(
        (rule) => rule.name.toLowerCase() === ruleName.toLowerCase(),
      ),
  );

  const logPayload = {
    candidateRuleCount: candidateRuleNames.length,
    candidateRuleNames: joinLogValues(candidateRuleNames),
    candidateSystemTypes: joinLogValues(
      orderedRules.map((rule) => rule.systemType ?? "custom"),
    ),
    returnedRuleCount: returnedRuleNames.length,
    returnedRuleNames: joinLogValues(returnedRuleNames),
    resolvedRuleCount: resolvedRuleNames.length,
    resolvedRuleNames: joinLogValues(resolvedRuleNames),
    unresolvedRuleCount: unresolvedRuleNames.length,
    unresolvedRuleNames: joinLogValues(unresolvedRuleNames),
    noMatchFound: aiResponse.noMatchFound,
    reasoningPresent: !!aiResponse.reasoning,
  };

  if (resolvedRuleNames.length === 0) {
    logger.warn("AI choose rule returned no usable rule", logPayload);
  } else {
    logger.info("AI choose rule completed", logPayload);
  }

  if (aiResponse.reasoning) {
    logger.trace("AI choose rule reasoning", {
      reasoning: aiResponse.reasoning,
    });
  }
}

function joinLogValues(values: (string | null | undefined)[]) {
  return values.filter(isDefined).join(", ");
}

function buildTriage(aiResponse: {
  triageTier?: string;
  triageReason?: string;
}): EmailTriage | null {
  const tier = TRIAGE_TIER_VALUES.find(
    (value) => value === aiResponse.triageTier,
  );
  if (!tier) return null;

  return {
    tier,
    reason: truncateWords(
      aiResponse.triageReason || "",
      MAX_TRIAGE_REASON_WORDS,
    ),
  };
}

// Hard cap regardless of what the model produced: the reason must stay one line.
function truncateWords(text: string, maxWords: number) {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

function formatClassificationFeedback(
  feedback: ClassificationFeedbackItem[] | null | undefined,
): string {
  if (!feedback?.length) return "";

  const lines = feedback.map((entry) => {
    const subject = entry.subject
      ? `"${entry.subject}"`
      : "(email no longer available)";
    if (entry.eventType === "LABEL_ADDED") {
      return `- ${subject} → ${entry.ruleName}`;
    }
    return `- ${subject} removed from ${entry.ruleName}`;
  });

  return `<classification_feedback>
User has manually classified emails from this sender into these rules:
${lines.join("\n")}
These are hints from past user actions. Still evaluate the current email on its own merits.
</classification_feedback>`;
}

const OLLAMA_MULTI_RULE_SELECTION_GUIDANCE = [
  "Do not be greedy. Only select secondary rules when they capture a separate, independently actionable purpose in the email.",
  "Select problem, alert, or action-needed rules only when the email actually describes a problem, risk, failed action, or required user action.",
  "When one specific transactional rule fully explains the email, do not also select a generic notification or account-update rule.",
  "Prefer one best rule when candidate rules refer to the same underlying event.",
] as const;
