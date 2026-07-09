import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import { processScheduledEmails } from "./executor";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");

const logger = createScopedLogger("scheduled-send-test");

const sendEmailWithHtml = vi.fn();

function dueEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: "se1",
    emailAccountId: "ea1",
    to: "someone@example.com",
    cc: null,
    bcc: null,
    replyTo: null,
    subject: "Hello",
    messageHtml: "<p>Hi</p>",
    replyToEmail: null,
    threadId: null,
    repeatEveryMinutes: null,
    maxOccurrences: null,
    occurrence: 1,
    attempts: 0,
    emailAccount: { account: { provider: "google" } },
    ...overrides,
  };
}

describe("processScheduledEmails", () => {
  beforeEach(() => {
    sendEmailWithHtml.mockReset();
    vi.mocked(createEmailProvider).mockResolvedValue({
      sendEmailWithHtml,
      // biome-ignore lint/suspicious/noExplicitAny: partial provider mock
    } as any);
  });

  it("does nothing when no emails are due", async () => {
    prisma.scheduledEmail.findMany.mockResolvedValue([]);
    const result = await processScheduledEmails(logger);
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, total: 0 });
    expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();
  });

  it("claims, sends, and marks a due email as SENT", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    prisma.scheduledEmail.findMany.mockResolvedValue([dueEmail() as any]);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    sendEmailWithHtml.mockResolvedValue({ messageId: "m1", threadId: "t1" });

    const result = await processScheduledEmails(logger);

    expect(result).toMatchObject({ sent: 1, failed: 0, skipped: 0 });
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "se1", status: "PENDING" },
      }),
    );
    expect(sendEmailWithHtml).toHaveBeenCalledWith(
      expect.objectContaining({ to: "someone@example.com", subject: "Hello" }),
    );
    expect(prisma.scheduledEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SENT",
          sentMessageId: "m1",
          sentThreadId: "t1",
        }),
      }),
    );
  });

  it("queues the next occurrence after sending a recurring email", async () => {
    prisma.scheduledEmail.findMany.mockResolvedValue([
      dueEmail({
        threadId: "t1",
        repeatEveryMinutes: 5,
        maxOccurrences: 3,
        occurrence: 1,
        // biome-ignore lint/suspicious/noExplicitAny: partial row mock
      }) as any,
    ]);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    prisma.scheduledEmail.create.mockResolvedValue({ id: "se2" } as any);
    sendEmailWithHtml.mockResolvedValue({ messageId: "m1", threadId: "t1" });

    await processScheduledEmails(logger);

    expect(prisma.scheduledEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailAccountId: "ea1",
        to: "someone@example.com",
        threadId: "t1",
        repeatEveryMinutes: 5,
        maxOccurrences: 3,
        occurrence: 2,
        sendAt: expect.any(Date),
      }),
    });
    const nextSendAt =
      prisma.scheduledEmail.create.mock.calls[0][0].data.sendAt;
    expect(
      Math.abs((nextSendAt as Date).getTime() - (Date.now() + 5 * 60_000)),
    ).toBeLessThan(5000);
  });

  it("does not queue another occurrence once the chain is complete", async () => {
    prisma.scheduledEmail.findMany.mockResolvedValue([
      dueEmail({
        repeatEveryMinutes: 5,
        maxOccurrences: 3,
        occurrence: 3,
        // biome-ignore lint/suspicious/noExplicitAny: partial row mock
      }) as any,
    ]);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    sendEmailWithHtml.mockResolvedValue({ messageId: "m1", threadId: "t1" });

    await processScheduledEmails(logger);

    expect(prisma.scheduledEmail.create).not.toHaveBeenCalled();
  });

  it("does not queue occurrences after a failed send", async () => {
    prisma.scheduledEmail.findMany.mockResolvedValue([
      dueEmail({
        repeatEveryMinutes: 5,
        maxOccurrences: 3,
        occurrence: 1,
        attempts: 2,
        // biome-ignore lint/suspicious/noExplicitAny: partial row mock
      }) as any,
    ]);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    sendEmailWithHtml.mockRejectedValue(new Error("provider down"));

    await processScheduledEmails(logger);

    expect(prisma.scheduledEmail.create).not.toHaveBeenCalled();
  });

  it("skips emails another sweep already claimed", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    prisma.scheduledEmail.findMany.mockResolvedValue([dueEmail() as any]);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 0 });

    const result = await processScheduledEmails(logger);

    expect(result).toMatchObject({ sent: 0, failed: 0, skipped: 1 });
    expect(sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("returns a failed send to PENDING for retry", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    prisma.scheduledEmail.findMany.mockResolvedValue([dueEmail() as any]);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    sendEmailWithHtml.mockRejectedValue(new Error("provider down"));

    const result = await processScheduledEmails(logger);

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(prisma.scheduledEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          error: "provider down",
        }),
      }),
    );
  });

  it("marks FAILED once max attempts are exhausted", async () => {
    prisma.scheduledEmail.findMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: partial row mock
      dueEmail({ attempts: 2 }) as any,
    ]);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    sendEmailWithHtml.mockRejectedValue(new Error("provider down"));

    await processScheduledEmails(logger);

    expect(prisma.scheduledEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("fails an email whose account has no provider", async () => {
    prisma.scheduledEmail.findMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: partial row mock
      dueEmail({ emailAccount: { account: null }, attempts: 2 }) as any,
    ]);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

    const result = await processScheduledEmails(logger);

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(sendEmailWithHtml).not.toHaveBeenCalled();
  });
});
