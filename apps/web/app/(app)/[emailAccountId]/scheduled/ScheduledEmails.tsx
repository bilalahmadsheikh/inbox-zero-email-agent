"use client";

import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import { ClockIcon } from "lucide-react";
import type { GetScheduledEmailsResponse } from "@/app/api/user/scheduled-emails/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cancelScheduledEmailAction } from "@/utils/actions/mail";
import { getActionErrorMessage } from "@/utils/error";
import { useAccount } from "@/providers/EmailAccountProvider";

type ScheduledEmailRow = GetScheduledEmailsResponse["upcoming"][number];

export function ScheduledEmails() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<GetScheduledEmailsResponse>(
    "/api/user/scheduled-emails",
  );

  const { execute: cancelEmail, isExecuting: isCancelling } = useAction(
    cancelScheduledEmailAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Scheduled email cancelled." });
        mutate();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="size-5" />
            Scheduled emails
          </CardTitle>
          <CardDescription>
            Emails queued to send later. They are delivered automatically within
            a minute of their scheduled time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoadingContent loading={isLoading} error={error}>
            {data && data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing scheduled. Use "Send later" in the compose window, or
                ask the assistant to schedule an email for you.
              </p>
            ) : (
              data && (
                <ScheduledEmailsTable
                  emails={data.upcoming}
                  onCancel={(id) => cancelEmail({ id })}
                  isCancelling={isCancelling}
                />
              )
            )}
          </LoadingContent>
        </CardContent>
      </Card>

      {data && data.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>
              Recently sent, cancelled, or failed scheduled emails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduledEmailsTable emails={data.history} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScheduledEmailsTable({
  emails,
  onCancel,
  isCancelling,
}: {
  emails: ScheduledEmailRow[];
  onCancel?: (id: string) => void;
  isCancelling?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>To</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Send at</TableHead>
          <TableHead>Status</TableHead>
          {onCancel && <TableHead className="w-24" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {emails.map((email) => (
          <TableRow key={email.id}>
            <TableCell className="max-w-48 truncate">{email.to}</TableCell>
            <TableCell className="max-w-64 truncate">{email.subject}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatSendAt(email.sendAt)}
              {formatRepeatInfo(email)}
            </TableCell>
            <TableCell>
              <ScheduledEmailStatusBadge
                status={email.status}
                error={email.error}
              />
            </TableCell>
            {onCancel && (
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isCancelling}
                  onClick={() => onCancel(email.id)}
                >
                  Cancel
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ScheduledEmailStatusBadge({
  status,
  error,
}: {
  status: ScheduledEmailRow["status"];
  error: string | null;
}) {
  if (status === "PENDING") return <Badge variant="secondary">Scheduled</Badge>;
  if (status === "SENDING") return <Badge variant="secondary">Sending…</Badge>;
  if (status === "SENT") return <Badge variant="green">Sent</Badge>;
  if (status === "CANCELLED") return <Badge variant="outline">Cancelled</Badge>;
  return (
    <Badge variant="destructive" title={error ?? undefined}>
      Failed
    </Badge>
  );
}

function formatSendAt(sendAt: string | Date) {
  return new Date(sendAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRepeatInfo(email: {
  repeatEveryMinutes: number | null;
  maxOccurrences: number | null;
  occurrence: number;
  threadId: string | null;
}) {
  const parts: string[] = [];
  if (email.repeatEveryMinutes && email.maxOccurrences) {
    parts.push(
      `every ${email.repeatEveryMinutes} min (${email.occurrence}/${email.maxOccurrences})`,
    );
  }
  if (email.threadId) {
    parts.push("in thread");
  }
  if (parts.length === 0) return null;

  return (
    <span className="ml-1 text-xs text-muted-foreground">
      · {parts.join(" · ")}
    </span>
  );
}
