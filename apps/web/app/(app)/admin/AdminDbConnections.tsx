"use client";

import { Activity, RefreshCw, Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import type { GetAdminDbConnectionsResponse } from "@/app/api/admin/db-connections/route";
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
import { adminTerminateIdleDbConnectionsAction } from "@/utils/actions/admin";
import { getActionErrorMessage } from "@/utils/error";

export function AdminDbConnections() {
  const { data, error, isLoading, mutate, isValidating } =
    useSWR<GetAdminDbConnectionsResponse>("/api/admin/db-connections", {
      refreshInterval: 2000,
    });

  const { execute, isExecuting } = useAction(
    adminTerminateIdleDbConnectionsAction,
    {
      onSuccess: (result) => {
        toastSuccess({
          title: "Idle connections terminated",
          description: `${result.data?.terminatedCount ?? 0} idle sessions closed.`,
        });
        mutate();
      },
      onError: (actionError) => {
        toastError({
          title: "Failed to terminate idle connections",
          description: getActionErrorMessage(actionError.error),
        });
      },
    },
  );

  const limits = data?.limits;
  const usagePercent = limits
    ? Math.round((limits.totalConnections / limits.maxConnections) * 100)
    : 0;

  return (
    <Card className="max-w-7xl">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              DB Connections
            </CardTitle>
            <CardDescription>
              Live pg_stat_activity monitor. Auto-refreshes every 2 seconds.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => mutate()}
              disabled={isValidating}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={isExecuting}
              onClick={() => execute({ minIdleSeconds: 0 })}
            >
              <Trash2 className="size-4" />
              Kill idle
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <LoadingContent loading={isLoading} error={error}>
          {data && limits && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label="Total" value={limits.totalConnections} />
                <Metric label="Active" value={limits.activeConnections} />
                <Metric label="Idle" value={limits.idleConnections} />
                <Metric
                  label="Idle in tx"
                  value={limits.idleInTransactionConnections}
                />
                <Metric label="Max" value={limits.maxConnections} />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={usagePercent >= 80 ? "red" : "secondary"}>
                  {usagePercent}% used
                </Badge>
                <span className="text-muted-foreground">
                  Captured {new Date(data.capturedAt).toLocaleTimeString()}
                </span>
                {limits.reservedConnections !== null && (
                  <span className="text-muted-foreground">
                    Reserved: {limits.reservedConnections}
                  </span>
                )}
                {limits.superuserReservedConnections !== null && (
                  <span className="text-muted-foreground">
                    Superuser reserved: {limits.superuserReservedConnections}
                  </span>
                )}
              </div>

              <section className="space-y-3">
                <h3 className="font-medium text-sm">Grouped Connections</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Count</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>App</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Oldest state</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.grouped.map((group) => (
                      <TableRow
                        key={`${group.applicationName}:${group.clientAddress}:${group.state}:${group.userName}`}
                      >
                        <TableCell>{group.connectionCount}</TableCell>
                        <TableCell>
                          <StateBadge state={group.state} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {group.applicationName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {group.clientAddress}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {group.userName ?? "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDuration(group.oldestStateAgeSeconds)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              <section className="space-y-3">
                <h3 className="font-medium text-sm">Sessions</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PID</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>App</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">State age</TableHead>
                      <TableHead className="text-right">Query age</TableHead>
                      <TableHead>Wait</TableHead>
                      <TableHead>Query</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.sessions.map((session) => (
                      <TableRow key={session.pid}>
                        <TableCell className="font-mono text-xs">
                          {session.pid}
                        </TableCell>
                        <TableCell>
                          <StateBadge state={session.state} />
                        </TableCell>
                        <TableCell className="max-w-52 truncate font-mono text-xs">
                          {session.applicationName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {session.clientAddress}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDuration(session.stateAgeSeconds)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDuration(session.queryAgeSeconds)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatWait(session.waitEventType, session.waitEvent)}
                        </TableCell>
                        <TableCell className="max-w-xl truncate font-mono text-xs">
                          {session.querySnippet || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            </div>
          )}
        </LoadingContent>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-semibold text-2xl tabular-nums">{value}</div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  if (state === "active") return <Badge variant="green">active</Badge>;
  if (state === "idle") return <Badge variant="secondary">idle</Badge>;
  if (state === "idle in transaction") {
    return <Badge variant="red">idle in tx</Badge>;
  }
  return <Badge variant="outline">{state}</Badge>;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatWait(waitEventType: string | null, waitEvent: string | null) {
  if (!waitEventType && !waitEvent) return "-";
  if (!waitEvent) return waitEventType ?? "-";
  if (!waitEventType) return waitEvent;
  return `${waitEventType}/${waitEvent}`;
}
