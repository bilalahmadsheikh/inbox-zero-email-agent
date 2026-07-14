"use client";

import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import { ClockIcon, Trash2Icon } from "lucide-react";
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
import {
  cancelScheduledEmailAction,
  deleteScheduledEmailAction,
} from "@/utils/actions/mail";
import { getActionErrorMessage } from "@/utils/error";
import { useAccount } from "@/providers/EmailAccountProvider";

type ScheduledEmailRow = GetScheduledEmailsResponse["upcoming"][number];

const REFRESH_INTERVAL_MS = 15_000;

export function ScheduledEmails() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<GetScheduledEmailsResponse>(
    "/api/user/scheduled-emails",
    { refreshInterval: REFRESH_INTERVAL_MS },
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
        mutate();
      },
    },
  );

  const { execute: deleteEmail, isExecuting: isDeleting } = useAction(
    deleteScheduledEmailAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "History entry deleted." });
        mutate();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
        mutate();
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
            a minute of their scheduled time. Cancelling a recurring email stops
            all of its remaining sends.
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
                  isBusy={isCancelling}
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
            <ScheduledEmailsTable
              emails={data.history}
              onDelete={(id) => deleteEmail({ id })}
              isBusy={isDeleting}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScheduledEmailsTable({
  emails,
  onCancel,
  onDelete,
  isBusy,
}: {
  emails: ScheduledEmailRow[];
  onCancel?: (id: string) => void;
  onDelete?: (id: string) => void;
  isBusy?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>To</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Send at</TableHead>
          <TableHead>Status</TableHead>
          {(onCancel || onDelete) && <TableHead className="w-24" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {emails.map((email) => (
          <TableRow key={email.id}>
            <TableCell className="max-w-48 truncate">{email.to}</TableCell>
            <TableCell className="max-w-64 truncate">{email.subject}</TableCell>
            <TableCell>
              <ScheduleTypeBadges email={email} />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {formatSendAt(email.sendAt)}
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                <ScheduledEmailStatusBadge status={email.status} />
                {email.status === "FAILED" && email.error && (
                  <div
                    className="max-w-56 truncate text-xs text-muted-foreground"
                    title={email.error}
                  >
                    {email.error}
                  </div>
                )}
              </div>
            </TableCell>
            {onCancel && (
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  title={
                    email.repeatEveryMinutes
                      ? "Stops this and all remaining repeats"
                      : undefined
                  }
                  onClick={() => onCancel(email.id)}
                >
                  Cancel
                </Button>
              </TableCell>
            )}
            {onDelete && (
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isBusy}
                  aria-label="Delete history entry"
                  onClick={() => onDelete(email.id)}
                >
                  <Trash2Icon className="size-4 text-muted-foreground" />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ScheduleTypeBadges({ email }: { email: ScheduledEmailRow }) {
  const badges: React.ReactNode[] = [];

  if (email.repeatEveryMinutes && email.maxOccurrences) {
    badges.push(
      <Badge key="recurring" variant="secondary" className="whitespace-nowrap">
        Recurring · every {email.repeatEveryMinutes} min ({email.occurrence}/
        {email.maxOccurrences})
      </Badge>,
    );
  }

  if (email.threadId) {
    badges.push(
      <Badge key="thread" variant="outline" className="whitespace-nowrap">
        Thread reply
      </Badge>,
    );
  }

  if (badges.length === 0) {
    badges.push(
      <Badge key="one-time" variant="outline" className="whitespace-nowrap">
        One-time
      </Badge>,
    );
  }

  return <div className="flex flex-wrap gap-1">{badges}</div>;
}

function ScheduledEmailStatusBadge({
  status,
}: {
  status: ScheduledEmailRow["status"];
}) {
  if (status === "PENDING") return <Badge variant="secondary">Scheduled</Badge>;
  if (status === "SENDING") return <Badge variant="secondary">Sending…</Badge>;
  if (status === "SENT") return <Badge variant="green">Sent</Badge>;
  if (status === "CANCELLED") return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
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
