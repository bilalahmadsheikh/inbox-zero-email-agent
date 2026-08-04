"use client";

import { useHotkeys } from "react-hotkeys-hook";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import {
  CheckCircleIcon,
  ClockIcon,
  PaperclipIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
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
import type { Attachment } from "@/utils/types/mail";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { scheduleSendAction, sendEmailAction } from "@/utils/actions/mail";
import { generateNewEmailAction } from "@/utils/actions/generate-reply";
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

// Matches the per-file ceiling used elsewhere for outgoing mail. Base64
// inflates the payload by roughly a third, so this is the pre-encoding size.
const MAX_ATTACHMENT_MB = 10;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

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
  const [showCcBcc, setShowCcBcc] = useState(
    Boolean(replyingToEmail?.cc || replyingToEmail?.bcc),
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilesSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      // Let the same file be picked again after being removed.
      event.target.value = "";
      if (!files.length) return;

      const oversized = files.filter(
        (file) => file.size > MAX_ATTACHMENT_BYTES,
      );
      if (oversized.length) {
        toastError({
          description: `${oversized.map((file) => file.name).join(", ")} exceeds the ${MAX_ATTACHMENT_MB}MB limit.`,
        });
      }

      const withinLimit = files.filter(
        (file) => file.size <= MAX_ATTACHMENT_BYTES,
      );
      if (!withinLimit.length) return;

      try {
        const encoded = await Promise.all(withinLimit.map(fileToAttachment));
        setAttachments((previous) => [...previous, ...encoded]);
      } catch (error) {
        console.error(error);
        toastError({ description: "Could not read one of those files." });
      }
    },
    [],
  );

  const [instruction, setInstruction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const generateDraft = useCallback(async () => {
    const trimmed = instruction.trim();
    if (!trimmed) return;

    setIsGenerating(true);
    try {
      const result = await generateNewEmailAction(emailAccountId, {
        instruction: trimmed,
        to: watch("to") || undefined,
        subject: watch("subject") || undefined,
      });

      if (result?.serverError || !result?.data?.text) {
        toastError({
          description:
            result?.serverError ?? "Could not write that draft. Try again.",
        });
        return;
      }

      // Appended rather than replacing, so anything already typed survives.
      editorRef.current?.appendContent(result.data.text);
      setValue(
        "messageHtml",
        `${watch("messageHtml") || ""}${result.data.text}`,
      );
      setInstruction("");
    } catch (error) {
      console.error(error);
      toastError({ description: "Could not write that draft. Try again." });
    } finally {
      setIsGenerating(false);
    }
  }, [instruction, emailAccountId, watch, setValue]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((previous) => previous.filter((_, i) => i !== index));
  }, []);

  const enrichData = useCallback(
    (data: SendEmailBody) => ({
      ...data,
      replyToEmail: getReplyToEmailPayload(data.replyToEmail),
      attachments,
      messageHtml: showFullContent
        ? data.messageHtml || ""
        : `${data.messageHtml || ""}<br>${replyingToEmail?.quotedContentHtml || ""}`,
    }),
    [showFullContent, replyingToEmail, attachments],
  );

  const scheduleSend = useCallback(
    (sendAt: Date) =>
      handleSubmit(async (data) => {
        // Scheduled sends hold their content in the database until send time,
        // so scheduleSendBody omits attachments. Say so rather than dropping
        // the files silently, which is what used to happen.
        if (attachments.length) {
          toastError({
            description:
              "Attachments can't be scheduled. Send now, or remove them to schedule.",
          });
          return;
        }

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
    [handleSubmit, enrichData, emailAccountId, onSuccess, refetch, attachments],
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

          {showCcBcc ? (
            <>
              <Input
                type="text"
                name="cc"
                registerProps={register("cc")}
                error={errors.cc}
                placeholder="Cc"
                className="border border-input bg-background focus:border-slate-200 focus:ring-0 focus:ring-slate-200"
              />
              <Input
                type="text"
                name="bcc"
                registerProps={register("bcc")}
                error={errors.bcc}
                placeholder="Bcc"
                className="border border-input bg-background focus:border-slate-200 focus:ring-0 focus:ring-slate-200"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="self-start text-muted-foreground text-sm hover:text-foreground"
            >
              Cc / Bcc
            </button>
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

      {/* Replies have their own Generate box in the thread view, where the
          conversation supplies the context. Only new emails need this. */}
      {!replyingToEmail && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            name="aiInstruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isGenerating) {
                event.preventDefault();
                generateDraft();
              }
            }}
            disabled={isGenerating}
            placeholder="Tell the AI what to write, then Generate…"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isGenerating || !instruction.trim()}
            onClick={generateDraft}
          >
            {isGenerating ? (
              <ButtonLoader />
            ) : (
              <SparklesIcon className="mr-2 size-4" />
            )}
            Generate
          </Button>
        </div>
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

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <span
              key={`${attachment.filename}-${index}`}
              className="flex items-center gap-1 rounded border border-border bg-muted/40 py-1 pr-1 pl-2 text-sm"
            >
              <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="max-w-48 truncate">{attachment.filename}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() => removeAttachment(index)}
                aria-label={`Remove ${attachment.filename}`}
              >
                <XIcon className="size-3" />
              </Button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSubmitting || isScheduling}>
            {isSubmitting && <ButtonLoader />}
            Send
            <CommandShortcut className="ml-2">{symbol}+Enter</CommandShortcut>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFilesSelected}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={isSubmitting || isScheduling}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
          >
            <PaperclipIcon className="size-4" />
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

async function fileToAttachment(file: File): Promise<Attachment> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  // Chunked so a large file cannot blow the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }

  return {
    filename: file.name,
    content: btoa(binary),
    contentType: file.type || "application/octet-stream",
  };
}
