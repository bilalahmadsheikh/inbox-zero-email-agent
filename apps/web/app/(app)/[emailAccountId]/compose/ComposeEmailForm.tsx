"use client";

import { useHotkeys } from "react-hotkeys-hook";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { CheckCircleIcon, ClockIcon, TrashIcon, XIcon } from "lucide-react";
import {
  addDays,
  addHours,
  format,
  nextMonday,
  setHours,
  setMinutes,
} from "date-fns";
import { useCallback, useRef, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { env } from "@/env";
import { extractNameFromEmail } from "@/utils/email";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { scheduleSendAction, sendEmailAction } from "@/utils/actions/mail";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ContactsResponse } from "@/app/api/google/contacts/route";
import type { SendEmailBody } from "@/utils/gmail/mail";
import { CommandShortcut } from "@/components/ui/command";
import { useModifierKey } from "@/hooks/useModifierKey";
import { useAccount } from "@/providers/EmailAccountProvider";

export type ReplyingToEmail = {
  threadId?: string;
  headerMessageId?: string;
  messageId?: string;
  references?: string;
  subject: string;
  to: string;
  cc?: string;
  bcc?: string;
  draftHtml?: string | undefined; // The part being written/edited
  quotedContentHtml?: string | undefined; // The part being quoted/replied to
  date?: string; // The date of the original email
};

export const ComposeEmailForm = ({
  replyingToEmail,
  refetch,
  onSuccess,
  onDiscard,
}: {
  replyingToEmail?: ReplyingToEmail;
  refetch?: () => void;
  onSuccess?: (messageId: string, threadId: string) => void;
  onDiscard?: () => void;
}) => {
  const { emailAccountId } = useAccount();
  const [showFullContent, setShowFullContent] = useState(false);
  const { symbol } = useModifierKey();
  const formRef = useRef<HTMLFormElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<SendEmailBody>({
    defaultValues: {
      replyToEmail: getReplyToEmailPayload(replyingToEmail),
      subject: replyingToEmail?.subject,
      to: replyingToEmail?.to,
      cc: replyingToEmail?.cc,
      messageHtml: replyingToEmail?.draftHtml,
    },
  });

  const [isScheduling, setIsScheduling] = useState(false);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [customSendAt, setCustomSendAt] = useState("");

  const enrichData = useCallback(
    (data: SendEmailBody) => ({
      ...data,
      replyToEmail: getReplyToEmailPayload(data.replyToEmail),
      messageHtml: showFullContent
        ? data.messageHtml || ""
        : `${data.messageHtml || ""}<br>${replyingToEmail?.quotedContentHtml || ""}`,
    }),
    [showFullContent, replyingToEmail],
  );

  const scheduleSend = useCallback(
    (sendAt: Date) =>
      handleSubmit(async (data) => {
        setIsScheduling(true);
        try {
          const { attachments: _attachments, ...email } = enrichData(data);
          const res = await scheduleSendAction(emailAccountId, {
            ...email,
            sendAt,
          });
          if (res?.serverError || res?.validationErrors) {
            toastError({
              description:
                res?.serverError ??
                "There was an error scheduling the email :(",
            });
          } else if (res?.data) {
            toastSuccess({
              description: `Scheduled — will send ${format(sendAt, "EEE, MMM d 'at' h:mm a")}`,
            });
            setCustomPickerOpen(false);
            onSuccess?.("", "");
          }
        } catch (error) {
          console.error(error);
          toastError({
            description: "There was an error scheduling the email :(",
          });
        } finally {
          setIsScheduling(false);
        }
        refetch?.();
      })(),
    [handleSubmit, enrichData, emailAccountId, onSuccess, refetch],
  );

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(
    async (data) => {
      const enrichedData = enrichData(data);

      try {
        const res = await sendEmailAction(emailAccountId, enrichedData);
        if (res?.serverError) {
          toastError({
            description: "There was an error sending the email :(",
          });
        } else if (res?.data) {
          toastSuccess({ description: "Email sent!" });
          onSuccess?.(res.data.messageId ?? "", res.data.threadId ?? "");
        }
      } catch (error) {
        console.error(error);
        toastError({ description: "There was an error sending the email :(" });
      }

      refetch?.();
    },
    [refetch, onSuccess, enrichData, emailAccountId],
  );

  useHotkeys(
    "mod+enter",
    (e) => {
      e.preventDefault();
      if (!isSubmitting) {
        formRef.current?.requestSubmit();
      }
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
  );

  const [searchQuery, setSearchQuery] = useState("");
  const { data } = useSWR<ContactsResponse, { error: string }>(
    env.NEXT_PUBLIC_CONTACTS_ENABLED
      ? `/api/google/contacts?query=${searchQuery}`
      : null,
    {
      keepPreviousData: true,
    },
  );

  // TODO not in love with how this was implemented
  const selectedEmailAddressses = watch("to", "").split(",").filter(Boolean);

  const onRemoveSelectedEmail = (emailAddress: string) => {
    const filteredEmailAddresses = selectedEmailAddressses.filter(
      (email) => email !== emailAddress,
    );
    setValue("to", filteredEmailAddresses.join(","));
  };

  const handleComboboxOnChange = (values: string[]) => {
    // this assumes last value given by combobox is user typed value
    const lastValue = values[values.length - 1];

    const { success } = z.string().email().safeParse(lastValue);
    if (success) {
      setValue("to", values.join(","));
      setSearchQuery("");
    }
  };

  const [editReply, setEditReply] = useState(false);

  const handleEditorChange = useCallback(
    (html: string) => {
      setValue("messageHtml", html);
    },
    [setValue],
  );

  const editorRef = useRef<TiptapHandle>(null);

  const showExpandedContent = useCallback(() => {
    if (!showFullContent) {
      try {
        editorRef.current?.appendContent(
          replyingToEmail?.quotedContentHtml ?? "",
        );
      } catch (error) {
        console.error("Failed to append content:", error);
        toastError({ description: "Failed to show full content" });
        return; // Don't set showFullContent to true if append failed
      }
    }
    setShowFullContent(true);
  }, [showFullContent, replyingToEmail?.quotedContentHtml]);

  return (
    <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      {replyingToEmail?.to && !editReply ? (
        <button
          type="button"
          className="flex gap-1 text-left"
          onClick={() => setEditReply(true)}
        >
          <span className="text-green-500">Draft</span>{" "}
          <span className="max-w-md break-words text-foreground">
            to {extractNameFromEmail(replyingToEmail.to)}
          </span>
        </button>
      ) : (
        <>
          {env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
            <div className="flex space-x-2">
              <div className="mt-2">
                <Label name="to" label="To" />
              </div>
              <Combobox
                value={selectedEmailAddressses}
                onChange={handleComboboxOnChange}
                multiple
              >
                <div className="flex min-h-10 w-full flex-1 flex-wrap items-center gap-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground">
                  {selectedEmailAddressses.map((emailAddress) => (
                    <Badge
                      key={emailAddress}
                      variant="secondary"
                      className="cursor-pointer rounded-md"
                      onClick={() => {
                        onRemoveSelectedEmail(emailAddress);
                        setSearchQuery(emailAddress);
                      }}
                    >
                      {extractNameFromEmail(emailAddress)}

                      <button
                        type="button"
                        onClick={() => onRemoveSelectedEmail(emailAddress)}
                      >
                        <XIcon className="ml-1.5 size-3" />
                      </button>
                    </Badge>
                  ))}

                  <div className="relative flex-1">
                    <ComboboxInput
                      value={searchQuery}
                      className="w-full border-none bg-background p-0 text-sm focus:border-none focus:ring-0"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyUp={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          setValue(
                            "to",
                            [...selectedEmailAddressses, searchQuery].join(","),
                          );
                          setSearchQuery("");
                        }
                      }}
                    />

                    {!!data?.result?.length && (
                      <ComboboxOptions
                        className={
                          "absolute z-10 mt-1 max-h-60 overflow-auto rounded-md bg-popover py-1 text-base shadow-lg ring-1 ring-border focus:outline-none sm:text-sm"
                        }
                      >
                        <ComboboxOption
                          className="h-0 w-0 overflow-hidden"
                          value={searchQuery}
                        />
                        {data?.result.map((contact) => {
                          const person = {
                            emailAddress:
                              contact.person?.emailAddresses?.[0].value,
                            name: contact.person?.names?.[0].displayName,
                            profilePictureUrl: contact.person?.photos?.[0].url,
                          };

                          return (
                            <ComboboxOption
                              className={({ focus }) =>
                                `cursor-default select-none px-4 py-1 text-foreground ${
                                  focus && "bg-accent"
                                }`
                              }
                              key={person.emailAddress}
                              value={person.emailAddress}
                            >
                              {({ selected }: { selected: boolean }) => (
                                <div className="my-2 flex items-center">
                                  {selected ? (
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full">
                                      <CheckCircleIcon className="h-6 w-6" />
                                    </div>
                                  ) : (
                                    <Avatar>
                                      <AvatarImage
                                        src={person.profilePictureUrl!}
                                        alt={
                                          person.emailAddress ||
                                          "Profile picture"
                                        }
                                      />
                                      <AvatarFallback>
                                        {person.emailAddress?.[0] || "A"}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                  <div className="ml-4 flex flex-col justify-center">
                                    <div className="text-foreground">
                                      {person.name}
                                    </div>
                                    <div className="text-sm font-semibold text-muted-foreground">
                                      {person.emailAddress}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </ComboboxOption>
                          );
                        })}
                      </ComboboxOptions>
                    )}
                  </div>
                </div>
              </Combobox>
            </div>
          ) : (
            <Input
              type="text"
              name="to"
              label="To"
              registerProps={register("to", { required: true })}
              error={errors.to}
            />
          )}

          <Input
            type="text"
            name="subject"
            registerProps={register("subject", { required: true })}
            error={errors.subject}
            placeholder="Subject"
            className="border border-input bg-background focus:border-slate-200 focus:ring-0 focus:ring-slate-200"
          />
        </>
      )}

      <Tiptap
        ref={editorRef}
        initialContent={replyingToEmail?.draftHtml}
        onChange={handleEditorChange}
        className="min-h-[200px]"
        onMoreClick={
          !replyingToEmail?.quotedContentHtml || showFullContent
            ? undefined
            : showExpandedContent
        }
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSubmitting || isScheduling}>
            {isSubmitting && <ButtonLoader />}
            Send
            <CommandShortcut className="ml-2">{symbol}+Enter</CommandShortcut>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting || isScheduling}
              >
                {isScheduling ? (
                  <ButtonLoader />
                ) : (
                  <ClockIcon className="mr-2 h-4 w-4" />
                )}
                Send later
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => scheduleSend(addHours(new Date(), 1))}
              >
                In 1 hour
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  scheduleSend(
                    setMinutes(setHours(addDays(new Date(), 1), 8), 0),
                  )
                }
              >
                Tomorrow 8:00 AM
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  scheduleSend(
                    setMinutes(setHours(nextMonday(new Date()), 8), 0),
                  )
                }
              >
                Monday 8:00 AM
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setCustomPickerOpen(true);
                }}
              >
                Custom time…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover open={customPickerOpen} onOpenChange={setCustomPickerOpen}>
            <PopoverTrigger asChild>
              <span />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <span className="block text-sm font-medium">Send at</span>
                  <input
                    type="datetime-local"
                    className="block rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    value={customSendAt}
                    min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                    onChange={(event) => setCustomSendAt(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  disabled={!customSendAt || isScheduling}
                  onClick={() => scheduleSend(new Date(customSendAt))}
                >
                  Schedule
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {onDiscard && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            disabled={isSubmitting}
            onClick={onDiscard}
          >
            <TrashIcon className="h-4 w-4" />
            <span className="sr-only">Discard</span>
          </Button>
        )}
      </div>
    </form>
  );
};

function getReplyToEmailPayload(
  replyingToEmail:
    | Pick<
        ReplyingToEmail,
        "threadId" | "headerMessageId" | "references" | "messageId"
      >
    | undefined,
): SendEmailBody["replyToEmail"] | undefined {
  const threadId = replyingToEmail?.threadId?.trim();
  const headerMessageId = replyingToEmail?.headerMessageId?.trim();

  if (!threadId || !headerMessageId) return;

  return {
    threadId,
    headerMessageId,
    ...(replyingToEmail?.references
      ? { references: replyingToEmail.references }
      : {}),
    ...(replyingToEmail?.messageId
      ? { messageId: replyingToEmail.messageId }
      : {}),
  };
}
