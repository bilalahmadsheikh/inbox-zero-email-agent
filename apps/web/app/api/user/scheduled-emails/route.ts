import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ScheduledEmailStatus } from "@/generated/prisma/enums";

const HISTORY_LIMIT = 20;

export type GetScheduledEmailsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "user/scheduled-emails",
  async (request) => {
    const { emailAccountId } = request.auth;

    const result = await getData({ emailAccountId });
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const select = {
    id: true,
    to: true,
    subject: true,
    sendAt: true,
    status: true,
    error: true,
    sentMessageId: true,
    createdAt: true,
    threadId: true,
    repeatEveryMinutes: true,
    maxOccurrences: true,
    occurrence: true,
    cancelOnReply: true,
  } as const;

  const [upcoming, history] = await Promise.all([
    prisma.scheduledEmail.findMany({
      where: { emailAccountId, status: ScheduledEmailStatus.PENDING },
      orderBy: { sendAt: "asc" },
      select,
    }),
    prisma.scheduledEmail.findMany({
      where: {
        emailAccountId,
        status: { not: ScheduledEmailStatus.PENDING },
      },
      orderBy: { updatedAt: "desc" },
      take: HISTORY_LIMIT,
      select,
    }),
  ]);

  return { upcoming, history };
}
