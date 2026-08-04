import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  getTodayForLLM,
  getUserInfoPrompt,
  resolveEffectiveWritingStyle,
} from "@/utils/ai/helpers";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";

const DEFAULT_WRITING_STYLE =
  "Write concisely, directly, and in a friendly, plainspoken tone. Prefer short declarative sentences over polished or overly elaborate phrasing.";

/**
 * Writes a brand-new email body from the user's instruction.
 *
 * Grounded on the same described writing style the chat assistant uses, plus a
 * relationship signal for the recipient. Deliberately not given the user's past
 * email bodies: those exist for tone reference, and a generator that can see
 * them can copy a line from unrelated correspondence into a message addressed
 * to someone else.
 */
export async function aiGenerateNewEmail({
  emailAccount,
  instruction,
  to,
  subject,
  relationship,
}: {
  emailAccount: EmailAccountWithAI & {
    name?: string | null;
    learnedWritingStyle?: string | null;
  };
  instruction: string;
  to?: string | null;
  subject?: string | null;
  relationship?: "personal" | "business" | null;
}) {
  const { effective: writingStyle } = resolveEffectiveWritingStyle({
    writingStyle: emailAccount.writingStyle,
    learnedWritingStyle: emailAccount.learnedWritingStyle,
    defaultWritingStyle: DEFAULT_WRITING_STYLE,
  });

  const system = `You write emails on behalf of the user.

Write only the body of the email. Never include a subject line, and never wrap the body in quotes or commentary.
Do not mention that you are an AI or that the message was generated.
Write original content from the user's instruction. Never reuse boilerplate or text from other emails.
When the instruction is brief, write a short genuine message rather than padding it out; a few sincere sentences beat a long generic one.
Match this writing style: ${writingStyle}
Vary the greeting to suit the relationship rather than reusing one opener. A close contact gets something warm and direct; a business contact gets a professional opener.
Return plain text. Separate paragraphs with a blank line; the composer turns them into HTML.`;

  const relationshipLine = relationship
    ? `The recipient looks like a ${relationship} contact, so pitch the tone accordingly.`
    : "";

  const prompt = `${getUserInfoPrompt({ emailAccount })}

${to ? `Recipient: ${to}` : "The recipient is not yet known."}
${subject ? `Subject already chosen by the user: ${subject}` : ""}
${relationshipLine}

<user_instruction>
${instruction.trim()}
</user_instruction>

Write the email body.
${getTodayForLLM()}`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.DRAFT_REPLY,
  );

  const generateText = createGenerateText({
    label: "Generate new email",
    emailAccount,
    modelOptions,
    // The instruction comes from the user's own input, but the recipient
    // address does not, so the prompt is still hardened.
    promptHardening: {
      trust: "untrusted",
      level: "full",
      outputConstraint: "plain-text",
    },
  });

  const result = await generateText({
    ...modelOptions,
    system,
    prompt,
  });

  return { text: result.text.trim() };
}
