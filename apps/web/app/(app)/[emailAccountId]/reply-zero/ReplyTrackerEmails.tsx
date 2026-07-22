"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import sortBy from "lodash/sortBy";
import { useState, useCallback, type RefCallback } from "react";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import type { ThreadTracker } from "@/generated/prisma/client";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { Button } from "@/components/ui/button";
import {
  CheckCircleIcon,
  CircleXIcon,
  HandIcon,
  RefreshCwIcon,
  ReplyIcon,
  XIcon,
} from "lucide-react";
import { useThreadsByIds } from "@/hooks/useThreadsByIds";
import { resolveThreadTrackerAction } from "@/utils/actions/reply-tracking";
import { toastError, toastSuccess } from "@/components/Toast";
import { Loading } from "@/components/Loading";
import { TablePagination } from "@/components/TablePagination";
import {
  ResizableHandle,
  ResizablePanelGroup,
  ResizablePanel,
} from "@/components/ui/resizable";
import { formatShortDate, internalDateToDate } from "@/utils/date";
import { cn } from "@/utils";
import { CommandShortcut } from "@/components/ui/command";
import { useTableKeyboardNavigation } from "@/hooks/useTableKeyboardNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { MutedText } from "@/components/Typography";

// The rich email viewer is heavy and only needed once a thread's split view is
// opened. Loading it lazily keeps the Reply Zero list route light so it renders
// quickly instead of waiting on the whole viewer graph to compile/bundle.
const ThreadContent = dynamic(
  () => import("@/components/EmailViewer").then((mod) => mod.ThreadContent),
  { ssr: false, loading: () => <Loading /> },
);

// The list only needs the latest message's counterparty/subject/snippet/date.
// Both the DB fast path and the provider-fetch fallback normalize into this.
type DisplayRow = {
  threadId: string;
  messageId: string;
  sender: string;
  subject: string;
  snippet: string;
  date: Date;
  labelIds?: string[];
};

export function ReplyTrackerEmails({
  trackers,
  emailAccountId,
  userEmail,
  type,
  isResolved,
  totalPages,
  isAnalyzing,
}: {
  trackers: ThreadTracker[];
  emailAccountId: string;
  userEmail: string;
  type?: ThreadTrackerType;
  isResolved?: boolean;
  totalPages: number;
  isAnalyzing: boolean;
}) {
  const [selectedEmail, setSelectedEmail] = useState<{
    threadId: string;
    messageId: string;
  } | null>(null);
  const [resolvingThreads, setResolvingThreads] = useState<Set<string>>(
    new Set(),
  );
  // When we send an email, it takes some time to process so we want to hide those from the "To Reply" UI
  // This will reshow on page refresh, but it's good enough for now.
  const [recentlySentThreads, setRecentlySentThreads] = useState<Set<string>>(
    new Set(),
  );

  // Fast path: when every tracker carries denormalized display fields, render
  // straight from the DB with no per-thread provider fetch. Older trackers
  // (null fields) fall back to fetching the threads from the provider.
  const canRenderFromDb =
    trackers.length > 0 && trackers.every((t) => t.sender !== null);

  const { data, isLoading } = useThreadsByIds(
    { threadIds: canRenderFromDb ? [] : trackers.map((t) => t.threadId) },
    { keepPreviousData: true },
  );

  const rows: DisplayRow[] = canRenderFromDb
    ? trackers.map((t) => ({
        threadId: t.threadId,
        messageId: t.messageId,
        sender: t.sender ?? "",
        subject: t.subject ?? "",
        snippet: t.snippet ?? "",
        date: t.sentAt,
      }))
    : (data?.threads ?? []).flatMap((thread) => {
        const message = thread.messages.at(-1);
        if (!message) return [];
        return [
          {
            threadId: thread.id,
            messageId: message.id,
            sender: message.labelIds?.includes("SENT")
              ? message.headers.to
              : message.headers.from,
            subject: message.headers.subject,
            snippet: message.snippet,
            date: internalDateToDate(message.internalDate),
            labelIds: message.labelIds,
          },
        ];
      });

  const sortedRows = sortBy(
    rows.filter((r) => !recentlySentThreads.has(r.threadId)),
    (r) => -r.date.getTime(),
  );

  const handleResolve = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (resolvingThreads.has(threadId)) return;

      setResolvingThreads((prev) => {
        const next = new Set(prev);
        next.add(threadId);
        return next;
      });

      const result = await resolveThreadTrackerAction(emailAccountId, {
        threadId,
        resolved,
      });

      if (result?.serverError) {
        toastError({
          title: "Error",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          title: "Success",
          description: resolved ? "Marked as done!" : "Marked as not done!",
        });
      }

      setResolvingThreads((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });

      if (selectedEmail?.threadId === threadId) {
        setSelectedEmail(null);
      }
    },
    [resolvingThreads, selectedEmail, emailAccountId],
  );

  const handleAction = useCallback(
    async (index: number, action: "reply" | "resolve" | "unresolve") => {
      const row = sortedRows[index];
      if (!row) return;

      if (action === "reply") {
        setSelectedEmail({ threadId: row.threadId, messageId: row.messageId });
      } else if (action === "resolve") {
        await handleResolve(row.threadId, true);
      } else if (action === "unresolve") {
        await handleResolve(row.threadId, false);
      }
    },
    [sortedRows, handleResolve],
  );

  const { selectedIndex, setSelectedIndex, getRefCallback } =
    useReplyTrackerKeyboardNav(sortedRows, handleAction);

  const onSendSuccess = useCallback(
    async (_messageId: string, threadId: string) => {
      // If this is a "To Reply" thread
      // add it to recently sent threads to hide it immediately
      if (type === ThreadTrackerType.NEEDS_REPLY) {
        setRecentlySentThreads((prev) => {
          const next = new Set(prev);
          next.add(threadId);
          return next;
        });

        // Remove from recently sent after 3 minutes
        const timeout = 3 * 60 * 1000;
        setTimeout(() => {
          setRecentlySentThreads((prev) => {
            const next = new Set(prev);
            next.delete(threadId);
            return next;
          });
        }, timeout);
      }
    },
    [type],
  );

  const isMobile = useIsMobile();

  if (isLoading && !data) {
    return <Loading />;
  }

  if (!sortedRows.length) {
    return (
      <div className="mt-2">
        <EmptyState message="No emails yet!" isAnalyzing={isAnalyzing} />
      </div>
    );
  }

  const listView = (
    <>
      <Table>
        <TableBody>
          {sortedRows.map((row, index) => (
            <Row
              key={row.threadId}
              row={row}
              userEmail={userEmail}
              isResolved={isResolved}
              type={type}
              setSelectedEmail={setSelectedEmail}
              isSplitViewOpen={!!selectedEmail}
              isSelected={index === selectedIndex}
              onResolve={handleResolve}
              isResolving={resolvingThreads.has(row.threadId)}
              onSelect={() => setSelectedIndex(index)}
              rowRef={getRefCallback(index)}
            />
          ))}
        </TableBody>
      </Table>
      <TablePagination totalPages={totalPages} />
    </>
  );

  if (!selectedEmail) {
    return listView;
  }

  return (
    // hacky. this will break if other parts of the layout change
    <div className="h-[calc(100vh-7.5rem)]">
      <ResizablePanelGroup
        direction={isMobile ? "vertical" : "horizontal"}
        className="h-full"
      >
        <ResizablePanel defaultSize={35} minSize={0}>
          <div className="h-full overflow-y-auto">{listView}</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={65} minSize={0} className="bg-secondary">
          <div className="h-full overflow-y-auto">
            <ThreadContent
              threadId={selectedEmail.threadId}
              showReplyButton={true}
              autoOpenReplyForMessageId={selectedEmail.messageId}
              onSendSuccess={
                type === ThreadTrackerType.NEEDS_REPLY
                  ? onSendSuccess
                  : undefined
              }
              topRightComponent={
                <div className="flex items-center gap-1">
                  {trackers.find((t) => t.threadId === selectedEmail.threadId)
                    ?.resolved ? (
                    <UnresolveButton
                      threadId={selectedEmail.threadId}
                      onResolve={handleResolve}
                      isLoading={resolvingThreads.has(selectedEmail.threadId)}
                      showShortcut={false}
                    />
                  ) : (
                    <ResolveButton
                      threadId={selectedEmail.threadId}
                      onResolve={handleResolve}
                      isLoading={resolvingThreads.has(selectedEmail.threadId)}
                      showShortcut={false}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedEmail(null)}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              }
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function Row({
  row,
  userEmail,
  isResolved,
  type,
  setSelectedEmail,
  isSplitViewOpen,
  isSelected,
  onResolve,
  isResolving,
  onSelect,
  rowRef,
}: {
  row: DisplayRow;
  userEmail: string;
  isResolved?: boolean;
  type?: ThreadTrackerType;
  setSelectedEmail: (email: { threadId: string; messageId: string }) => void;
  isSplitViewOpen: boolean;
  isSelected: boolean;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isResolving: boolean;
  onSelect: () => void;
  rowRef: RefCallback<HTMLTableRowElement>;
}) {
  const openSplitView = useCallback(() => {
    setSelectedEmail({
      threadId: row.threadId,
      messageId: row.messageId,
    });
  }, [row.messageId, row.threadId, setSelectedEmail]);

  return (
    <TableRow
      ref={rowRef}
      className={cn(
        "transition-colors duration-100 hover:bg-background",
        isSelected &&
          "bg-blue-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-800",
      )}
      onMouseEnter={onSelect}
    >
      <TableCell onClick={openSplitView} className="py-8 pl-8 pr-6">
        <div className="flex items-center justify-between">
          <EmailMessageCell
            sender={row.sender}
            subject={row.subject}
            snippet={row.snippet}
            userEmail={userEmail}
            threadId={row.threadId}
            messageId={row.messageId}
            hideViewEmailButton
            labelIds={row.labelIds}
            filterReplyTrackerLabels
          />

          {/* biome-ignore lint/a11y/useKeyWithClickEvents: buttons inside handle keyboard events */}
          <div
            className={cn(
              "ml-4 flex items-center gap-1.5",
              isSplitViewOpen && "flex-col",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MutedText className="mr-4 text-nowrap">
              {formatShortDate(row.date)}
            </MutedText>

            {isResolved ? (
              <UnresolveButton
                threadId={row.threadId}
                onResolve={onResolve}
                isLoading={isResolving}
                showShortcut
              />
            ) : (
              <>
                {!!type && <NudgeButton type={type} onClick={openSplitView} />}
                <ResolveButton
                  threadId={row.threadId}
                  onResolve={onResolve}
                  isLoading={isResolving}
                  showShortcut
                />
              </>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NudgeButton({
  type,
  onClick,
}: {
  type: ThreadTrackerType;
  onClick: () => void;
}) {
  const showNudge = type === ThreadTrackerType.AWAITING;

  return (
    <Button
      className="w-full"
      Icon={showNudge ? HandIcon : ReplyIcon}
      onClick={onClick}
    >
      {showNudge ? "Nudge" : "Reply"}
      <CommandShortcut className="ml-2">R</CommandShortcut>
    </Button>
  );
}

function ResolveButton({
  threadId,
  onResolve,
  isLoading,
  showShortcut,
}: {
  threadId: string;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isLoading: boolean;
  showShortcut: boolean;
}) {
  return (
    <Button
      className="w-full"
      variant="outline"
      Icon={CheckCircleIcon}
      loading={isLoading}
      onClick={() => onResolve(threadId, true)}
    >
      Mark Done
      {showShortcut && <CommandShortcut className="ml-2">D</CommandShortcut>}
    </Button>
  );
}

function UnresolveButton({
  threadId,
  onResolve,
  isLoading,
  showShortcut,
}: {
  threadId: string;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isLoading: boolean;
  showShortcut: boolean;
}) {
  return (
    <Button
      className="w-full"
      variant="outline"
      Icon={CircleXIcon}
      loading={isLoading}
      onClick={() => onResolve(threadId, false)}
    >
      Not Done
      {showShortcut && <CommandShortcut className="ml-2">N</CommandShortcut>}
    </Button>
  );
}

function EmptyState({
  message,
  isAnalyzing,
}: {
  message: string;
  isAnalyzing: boolean;
}) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  return (
    <div className="content-container">
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed bg-muted p-8 text-center animate-in fade-in-50">
        {isAnalyzing ? (
          <>
            <MutedText>Analyzing your emails...</MutedText>
            <Button
              className="mt-4"
              variant="outline"
              Icon={RefreshCwIcon}
              loading={isRefreshing}
              onClick={async () => {
                setIsRefreshing(true);
                router.refresh();
                // Reset loading after a short delay
                setTimeout(() => setIsRefreshing(false), 1000);
              }}
            >
              Refresh
            </Button>
          </>
        ) : (
          <MutedText>{message}</MutedText>
        )}
      </div>
    </div>
  );
}

function useReplyTrackerKeyboardNav(
  items: readonly unknown[],
  onAction: (
    index: number,
    action: "reply" | "resolve" | "unresolve",
  ) => Promise<void>,
) {
  const handleKeyAction = useCallback(
    (index: number, key: string) => {
      if (key === "r") onAction(index, "reply");
      else if (key === "d") onAction(index, "resolve");
      else if (key === "n") onAction(index, "unresolve");
    },
    [onAction],
  );

  const { selectedIndex, setSelectedIndex, getRefCallback } =
    useTableKeyboardNavigation({
      items,
      onKeyAction: handleKeyAction,
    });

  return { selectedIndex, setSelectedIndex, getRefCallback };
}
