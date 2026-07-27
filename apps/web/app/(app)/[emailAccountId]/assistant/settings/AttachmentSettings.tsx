"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { MutedText } from "@/components/Typography";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { updateAttachmentSettingsAction } from "@/utils/actions/settings";
import {
  ATTACHMENT_FILE_TYPES,
  type AttachmentFileType,
  type ResolvedAttachmentSettings,
  resolveAttachmentSettings,
} from "@/utils/attachments/settings";

const FILE_TYPE_LABELS: Record<AttachmentFileType, string> = {
  pdf: "PDF",
  word: "Word (.docx)",
  text: "Text (.txt)",
};

export function AttachmentSettings() {
  const { data, isLoading, error } = useEmailAccountFull();
  const [open, setOpen] = useState(false);

  return (
    <SettingCard
      title="Attachment reading controls"
      description="Choose which file types the AI reads, cap file size, and always/never read attachments from specific senders."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-24" />}
        >
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Attachment reading controls</DialogTitle>
                <DialogDescription>
                  These apply wherever the AI reads incoming documents to draft
                  or reply.
                </DialogDescription>
              </DialogHeader>
              {data && (
                <AttachmentSettingsForm
                  initial={resolveAttachmentSettings(data.attachmentSettings)}
                  onSaved={() => setOpen(false)}
                />
              )}
            </DialogContent>
          </Dialog>
        </LoadingContent>
      }
    />
  );
}

function AttachmentSettingsForm({
  initial,
  onSaved,
}: {
  initial: ResolvedAttachmentSettings;
  onSaved: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { mutate } = useEmailAccountFull();
  const { data: rules } = useRules();

  const attachmentRules = (rules ?? []).filter((rule) =>
    rule.actions.some((action) => action.readAttachments),
  );

  const [fileTypes, setFileTypes] = useState<AttachmentFileType[]>(
    initial.fileTypes,
  );
  const [maxSizeMb, setMaxSizeMb] = useState(
    String(Math.round(initial.maxSizeBytes / (1024 * 1024))),
  );
  const [allowSenders, setAllowSenders] = useState(
    initial.allowSenders.join("\n"),
  );
  const [denySenders, setDenySenders] = useState(
    initial.denySenders.join("\n"),
  );
  const [nameExclusions, setNameExclusions] = useState(
    initial.nameExclusions.join("\n"),
  );

  const { execute, isExecuting } = useAction(
    updateAttachmentSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Attachment settings saved" });
        mutate();
        onSaved();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const toggleType = (type: AttachmentFileType) => {
    setFileTypes((prev) =>
      prev.includes(type)
        ? prev.filter((value) => value !== type)
        : [...prev, type],
    );
  };

  const onSubmit = () => {
    const parsedSize = Number.parseInt(maxSizeMb, 10);
    execute({
      fileTypes,
      maxSizeMb: Number.isFinite(parsedSize)
        ? Math.min(Math.max(parsedSize, 1), 50)
        : undefined,
      allowSenders: linesToList(allowSenders),
      denySenders: linesToList(denySenders),
      nameExclusions: linesToList(nameExclusions),
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>File types to read</Label>
        <MutedText>
          Only these document types are read. Unchecking all means no
          attachments are read.
        </MutedText>
        <div className="flex flex-wrap gap-4 pt-1">
          {ATTACHMENT_FILE_TYPES.map((type) => (
            <label
              key={type}
              className="flex items-center gap-2 text-sm"
              htmlFor={`attachment-type-${type}`}
            >
              <Checkbox
                id={`attachment-type-${type}`}
                checked={fileTypes.includes(type)}
                onCheckedChange={() => toggleType(type)}
              />
              {FILE_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="attachment-max-size">Maximum file size (MB)</Label>
        <MutedText>Attachments larger than this are skipped (1–50).</MutedText>
        <Input
          id="attachment-max-size"
          type="number"
          min={1}
          max={50}
          value={maxSizeMb}
          onChange={(event) => setMaxSizeMb(event.target.value)}
          className="w-28"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="attachment-allow">Always read from</Label>
        <MutedText>
          One sender email or domain per line (e.g. accountant@firm.com or
          firm.com). Attachments from these are always read.
        </MutedText>
        <Textarea
          id="attachment-allow"
          rows={3}
          value={allowSenders}
          onChange={(event) => setAllowSenders(event.target.value)}
          placeholder={"accountant@firm.com\nlegal.example.com"}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="attachment-deny">Never read from</Label>
        <MutedText>
          One sender email or domain per line. Attachments from these are never
          read, even when reading is on.
        </MutedText>
        <Textarea
          id="attachment-deny"
          rows={3}
          value={denySenders}
          onChange={(event) => setDenySenders(event.target.value)}
          placeholder={"newsletters@promo.com\nmarketing.example.com"}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="attachment-exclusions">
          Skip files whose name contains
        </Label>
        <MutedText>
          One word per line (e.g. medical, passport, salary). Matching
          attachments are never read.
        </MutedText>
        <Textarea
          id="attachment-exclusions"
          rows={3}
          value={nameExclusions}
          onChange={(event) => setNameExclusions(event.target.value)}
          placeholder={"medical\npassport"}
        />
      </div>

      {attachmentRules.length > 0 && (
        <div className="space-y-2 rounded-md border p-3">
          <Label>Rules that also read attachments</Label>
          <MutedText>
            These automation rules turn on attachment reading for the emails
            they match. They still follow the file type, size, and never-read
            settings above.
          </MutedText>
          <ul className="mt-1 space-y-0.5 text-sm">
            {attachmentRules.map((rule) => (
              <li key={rule.id}>{rule.name}</li>
            ))}
          </ul>
          <Link
            href={prefixPath(emailAccountId, "/automation?tab=rules")}
            className="text-sm text-blue-600 hover:underline"
          >
            Manage in Rules →
          </Link>
        </div>
      )}

      <DialogFooter>
        <Button onClick={onSubmit} loading={isExecuting}>
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

function linesToList(value: string): string[] {
  return [
    ...new Set(
      value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ];
}
