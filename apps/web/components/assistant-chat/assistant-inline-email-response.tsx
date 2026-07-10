"use client";

import { cn } from "@/utils/index";
import {
  createElement,
  memo,
  type ComponentProps,
  type HTMLAttributes,
} from "react";
import { Streamdown } from "streamdown";
import {
  InlineEmailCard,
  InlineEmailDetail,
  InlineEmailList,
} from "@/components/assistant-chat/inline-email-card";
import {
  InlineRuleSuggestionCard,
  InlineRuleSuggestions,
} from "@/components/assistant-chat/inline-rule-suggestion-card";

type AssistantInlineEmailResponseProps = ComponentProps<typeof Streamdown>;

const allowedTags = {
  emails: [],
  email: ["id", "threadid", "index"],
  "email-detail": ["id", "threadid"],
  "rule-suggestions": [],
  "rule-suggestion": [
    "name",
    "when",
    "do",
    "label",
    "archive",
    "notify",
    "draft",
    "markread",
  ],
};
const components = {
  p: AssistantMarkdownParagraph,
  emails: InlineEmailList,
  email: InlineEmailCard,
  "email-detail": InlineEmailDetail,
  "rule-suggestions": InlineRuleSuggestions,
  "rule-suggestion": InlineRuleSuggestionCard,
};
const literalTagContent = ["email", "email-detail", "rule-suggestion"];
function AssistantMarkdownParagraph({
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return createElement("div", props, children);
}

export const AssistantInlineEmailResponse = memo(
  ({ className, children, ...props }: AssistantInlineEmailResponseProps) =>
    createElement(
      Streamdown,
      {
        className: cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          "[&_[data-streamdown='heading-1']]:!mt-8",
          "[&_[data-streamdown='heading-2']]:!mt-8",
          "[&_[data-streamdown='heading-3']]:!mt-7",
          "[&_a]:!text-inherit [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80",
          className,
        ),
        allowedTags,
        components,
        literalTagContent,
        normalizeHtmlIndentation: true,
        ...props,
      },
      normalizeAllowedTagBlocks(normalizeSelfClosingAllowedTags(children)),
    ),
);

AssistantInlineEmailResponse.displayName = "AssistantInlineEmailResponse";

const selfClosingAllowedTagPattern = new RegExp(
  `<(${Object.keys(allowedTags).join("|")})(\\s(?:[^"'<>]|"[^"]*"|'[^']*')*)?\\s*/>`,
  "gi",
);

function normalizeSelfClosingAllowedTags(
  children: AssistantInlineEmailResponseProps["children"],
) {
  if (typeof children !== "string" || !children.includes("/>")) return children;

  return children.replace(
    selfClosingAllowedTagPattern,
    (_match, tagName: string, attributes = "") =>
      `<${tagName}${attributes}></${tagName}>`,
  );
}

const allowedTagPatternSource = Object.keys(allowedTags)
  .sort((a, b) => b.length - a.length)
  .join("|");
const blockAllowedTagPattern = new RegExp(
  `(<(${allowedTagPatternSource})(?:\\s(?:[^"'<>]|"[^"]*"|'[^']*')*)?>[\\s\\S]*?<\\/\\2>)`,
  "gi",
);

function normalizeAllowedTagBlocks(
  children: AssistantInlineEmailResponseProps["children"],
) {
  if (typeof children !== "string") return children;

  return children.replace(blockAllowedTagPattern, "\n\n$1\n\n");
}
