import prisma from "@/utils/prisma";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";
import { getDateFilter, type TimeRange } from "./date-filter";
import { Prisma, type ThreadTracker } from "@/generated/prisma/client";

const PAGE_SIZE = 20;

export async function Resolved({
  emailAccountId,
  userEmail,
  page,
  timeRange,
}: {
  emailAccountId: string;
  userEmail: string;
  page: number;
  timeRange: TimeRange;
}) {
  const skip = (page - 1) * PAGE_SIZE;
  const dateFilter = getDateFilter(timeRange);

  // The filter is applied to a date value, as the other tabs do. It used to
  // pass the whole { lte } object into SQL and read a field out of it there,
  // which Postgres rejects, so any time range other than "all" failed.
  const dateClause = dateFilter
    ? Prisma.sql`AND "sentAt" <= ${dateFilter.lte}`
    : Prisma.empty;

  // A thread is done when every tracker on it is resolved; its newest tracker
  // represents it. Rows are fetched in the same query that picks them, rather
  // than picking ids and then looking them up in a second round trip.
  const [trackers, total] = await Promise.all([
    prisma.$queryRaw<ThreadTracker[]>`
      SELECT *
      FROM "ThreadTracker"
      WHERE id IN (
        SELECT MAX(id)
        FROM "ThreadTracker"
        WHERE "emailAccountId" = ${emailAccountId}
        ${dateClause}
        GROUP BY "threadId"
        HAVING bool_and(resolved) = true
        ORDER BY MAX(id) DESC
        LIMIT ${PAGE_SIZE}
        OFFSET ${skip}
      )
      ORDER BY "createdAt" DESC
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM (
        SELECT 1
        FROM "ThreadTracker"
        WHERE "emailAccountId" = ${emailAccountId}
        ${dateClause}
        GROUP BY "threadId"
        HAVING bool_and(resolved) = true
      ) t
    `,
  ]);

  const totalPages = Math.ceil(Number(total?.[0]?.count) / PAGE_SIZE);

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      emailAccountId={emailAccountId}
      userEmail={userEmail}
      totalPages={totalPages}
      isResolved
      isAnalyzing={false}
    />
  );
}
