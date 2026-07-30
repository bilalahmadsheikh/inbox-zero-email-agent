import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const sendEmailWithHtmlMock = vi.hoisted(() => vi.fn());
const resolveCloudAttachmentsMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => ({
    sendEmailWithHtml: sendEmailWithHtmlMock,
  })),
}));
// Only the resolution step is stubbed; how the confirmation reacts to a failed
// resolve is what these tests are about. The wording of the failure itself is
// covered where it lives, in draft-attachments.test.ts.
vi.mock("@/utils/attachments/draft-attachments", () => ({
  resolveCloudAttachmentsForOutgoingEmail: resolveCloudAttachmentsMock,
}));
vi.mock("@/utils/email/get-formatted-sender-address", () => ({
  getFormattedSenderAddress: vi.fn(async () => "Owner <owner@example.com>"),
}));

import prisma from "@/utils/__mocks__/prisma";
import { confirmAssistantEmailActionForAccount } from "@/utils/actions/assistant-chat-confirmation";

const SELECTED_ATTACHMENTS = [
  {
    driveConnectionId: "drive-1",
    fileId: "file-1",
    filename: "Acme contract.pdf",
    mimeType: "application/pdf",
  },
  {
    driveConnectionId: "drive-1",
    fileId: "file-2",
    filename: "Acme invoice.pdf",
    mimeType: "application/pdf",
  },
];

function buildPendingSendEmailPart({
  attachments = SELECTED_ATTACHMENTS,
  sendAt = null,
}: {
  attachments?: unknown[];
  sendAt?: string | null;
} = {}) {
  return {
    type: "tool-sendEmail",
    toolCallId: "tool-send-1",
    state: "output-available",
    output: {
      success: true,
      actionType: "send_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        to: "client@example.com",
        cc: null,
        bcc: null,
        subject: "Contract",
        messageHtml: "<p>Attached.</p>",
        sendAt,
        attachments,
      },
    },
  };
}

function mockChatMessageWith(part: { output: { confirmationState: string } }) {
  const message = {
    id: "assistant-message-1",
    chatId: "chat-1",
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
  };

  prisma.chatMessage.findMany.mockResolvedValue([
    { ...message, parts: [part] },
  ] as never);
  prisma.chatMessage.findFirst
    // The reservation reads the card as pending and claims it...
    .mockResolvedValueOnce({ ...message, parts: [part] } as never)
    // ...so every later read sees it mid-flight, which is the state the
    // failure path has to reset before the user can confirm again.
    .mockResolvedValue({
      ...message,
      parts: [
        {
          ...part,
          output: { ...part.output, confirmationState: "processing" },
        },
      ],
    } as never);
  prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as never);
}

function confirmSend(overrides: Record<string, unknown> = {}) {
  return confirmAssistantEmailActionForAccount({
    chatId: "chat-1",
    chatMessageId: "assistant-message-1",
    toolCallId: "tool-send-1",
    actionType: "send_email",
    emailAccountId: "ea_1",
    provider: "google",
    logger: createTestLogger(),
    ...overrides,
  });
}

describe("confirming a chat email with cloud attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      prisma.emailAccount.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ userId: "u1" });
    sendEmailWithHtmlMock.mockResolvedValue({
      messageId: "sent-1",
      threadId: "thread-1",
    });
  });

  it("refuses to schedule a send that carries cloud attachments", async () => {
    mockChatMessageWith(buildPendingSendEmailPart());

    await expect(
      confirmSend({ sendAtOverride: "2026-08-01T09:00:00.000Z" }),
    ).rejects.toThrow(/attachments are not supported for scheduled emails/i);

    // The guard must hold on the server: the card's time picker is disabled for
    // attachments, but a schedule can still arrive via sendAtOverride.
    expect(prisma.scheduledEmail.create).not.toHaveBeenCalled();
    expect(sendEmailWithHtmlMock).not.toHaveBeenCalled();
  });

  it("sends nothing and explains the retry when a file cannot be attached", async () => {
    mockChatMessageWith(buildPendingSendEmailPart());
    // One of the two selected files fails to download.
    resolveCloudAttachmentsMock.mockResolvedValue({
      error: "1 of 2 cloud files could not be attached.",
    });

    await expect(confirmSend()).rejects.toThrow(
      /1 of 2 cloud files could not be attached/i,
    );

    // A partial attach would send the user's email without the file they
    // believed was on it, so nothing may go out.
    expect(sendEmailWithHtmlMock).not.toHaveBeenCalled();
  });

  it("tells the user why the send failed instead of a generic message", async () => {
    mockChatMessageWith(buildPendingSendEmailPart());
    resolveCloudAttachmentsMock.mockResolvedValue({
      error: "Something specific went wrong.",
    });

    // The confirmation owns the "nothing was sent, you can retry" framing, and
    // must not flatten the specific reason into "Failed to send email".
    const error = await confirmSend().catch((thrown) => thrown as Error);
    expect(error.message).toContain("Something specific went wrong.");
    expect(error.message).toContain("Nothing was sent");
    expect(error.message).toContain("Confirm again to retry");
  });

  it("releases the confirmation lease so the user can retry", async () => {
    mockChatMessageWith(
      buildPendingSendEmailPart({
        attachments: SELECTED_ATTACHMENTS,
      }),
    );
    resolveCloudAttachmentsMock.mockResolvedValue({ error: "Boom." });

    await expect(confirmSend()).rejects.toThrow();

    // Written back as "pending" rather than left "processing", otherwise the
    // card stays stuck until the 5 minute lease expires.
    const rewrittenParts = (
      prisma.chatMessage.updateMany as ReturnType<typeof vi.fn>
    ).mock.calls.at(-1)?.[0]?.data?.parts as Array<{
      output: { confirmationState: string };
    }>;
    expect(rewrittenParts[0].output.confirmationState).toBe("pending");
  });

  it("sends with attachments when every file resolves", async () => {
    mockChatMessageWith(buildPendingSendEmailPart());
    resolveCloudAttachmentsMock.mockResolvedValue({
      attachments: [
        { filename: "Acme contract.pdf", content: Buffer.from("pdf") },
        { filename: "Acme invoice.pdf", content: Buffer.from("pdf") },
      ],
    });

    const result = await confirmSend();

    expect(result.success).toBe(true);
    expect(sendEmailWithHtmlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        attachments: [
          expect.objectContaining({ filename: "Acme contract.pdf" }),
          expect.objectContaining({ filename: "Acme invoice.pdf" }),
        ],
      }),
    );
  });
});
