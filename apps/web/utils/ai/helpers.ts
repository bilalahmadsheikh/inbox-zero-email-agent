import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import type { EmailForLLM } from "@/utils/types";

export function getTodayForLLM(date: Date = new Date()) {
  return `Today's date and time is: ${date.toISOString()}.`;
}

export const getUserInfoPrompt = ({
  emailAccount,
  prefix = "The user you are acting on behalf of is:",
}: {
  emailAccount: Pick<EmailAccountWithAI, "email" | "about"> & {
    name?: string | null;
  };
  prefix?: string;
}) => {
  const info = [
    {
      label: "email",
      value: emailAccount.email,
    },
    {
      label: "name",
      value: emailAccount.name,
    },
    {
      label: "about",
      value: emailAccount.about,
    },
  ].filter((i) => i.value);

  return `${prefix || ""}
<user_info>
${info.map((i) => `<${i.label}>${i.value}</${i.label}>`).join("\n")}
</user_info>`.trim();
};

/**
 * Resolves which writing style text should drive a draft: an explicit manual
 * style always wins; the learned style is only promoted to the effective
 * style when no manual style exists, otherwise it's kept as a lower-priority
 * advisory alongside the manual style; falls back to `defaultWritingStyle`
 * when neither is set.
 */
export const resolveEffectiveWritingStyle = ({
  writingStyle,
  learnedWritingStyle,
  defaultWritingStyle,
}: {
  writingStyle?: string | null;
  learnedWritingStyle?: string | null;
  defaultWritingStyle: string;
}): { effective: string; advisoryLearned: string | null } => {
  const normalizedWritingStyle = writingStyle?.trim() || null;
  const normalizedLearnedWritingStyle = learnedWritingStyle?.trim() || null;

  return {
    effective:
      normalizedWritingStyle ||
      normalizedLearnedWritingStyle ||
      defaultWritingStyle,
    advisoryLearned: normalizedWritingStyle
      ? normalizedLearnedWritingStyle
      : null,
  };
};

export const getUserRulesPrompt = ({
  rules,
}: {
  rules: { name: string; instructions: string }[];
}) => `<user_rules>
${rules
  .map(
    (rule) => `<rule>
  <name>${rule.name}</name>
  <criteria>${rule.instructions}</criteria>
</rule>`,
  )
  .join("\n")}
</user_rules>`;

export const getEmailListPrompt = ({
  messages,
  messageMaxLength,
  maxMessages,
}: {
  messages: EmailForLLM[];
  messageMaxLength: number;
  maxMessages?: number;
}) => {
  const messagesToUse = maxMessages ? messages.slice(-maxMessages) : messages;

  return messagesToUse
    .map((email) => `<email>${stringifyEmail(email, messageMaxLength)}</email>`)
    .join("\n");
};
