import { ActionType } from "@/generated/prisma/enums";

export const DRAFT_REPLY_ACTION_TYPES = [
  ActionType.DRAFT_EMAIL,
  ActionType.DRAFT_MESSAGING_CHANNEL,
  ActionType.REPLY,
] as const;

// Actions that create a saved draft and never send. Used where we dedupe draft
// generation across multiple matched rules: a REPLY sends, so it must never be
// treated as a limitable/strippable draft there or the send would be dropped.
export const DRAFT_CREATION_ACTION_TYPES = [
  ActionType.DRAFT_EMAIL,
  ActionType.DRAFT_MESSAGING_CHANNEL,
] as const;

export const MESSAGING_CHANNEL_ACTION_TYPES = [
  ActionType.NOTIFY_MESSAGING_CHANNEL,
  ActionType.DRAFT_MESSAGING_CHANNEL,
] as const;

export function isDraftReplyActionType(type: ActionType) {
  return DRAFT_REPLY_ACTION_TYPES.includes(
    type as (typeof DRAFT_REPLY_ACTION_TYPES)[number],
  );
}

export function isDraftCreationActionType(type: ActionType) {
  return DRAFT_CREATION_ACTION_TYPES.includes(
    type as (typeof DRAFT_CREATION_ACTION_TYPES)[number],
  );
}

export function isMessagingDraftActionType(type: ActionType) {
  return type === ActionType.DRAFT_MESSAGING_CHANNEL;
}

export function isMessagingChannelActionType(type: ActionType) {
  return MESSAGING_CHANNEL_ACTION_TYPES.includes(
    type as (typeof MESSAGING_CHANNEL_ACTION_TYPES)[number],
  );
}
