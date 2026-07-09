import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  cancelScheduledEmailsToSender,
  releaseScheduledEmailsToSender,
} from "./rule-actions";

vi.mock("@/utils/prisma");

const logger = createScopedLogger("scheduled-send-rule-actions-test");

describe("scheduled email rule actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("cancelScheduledEmailsToSender", () => {
    it("cancels sender-scoped and same-thread scheduled emails", async () => {
      prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 2 });

      const result = await cancelScheduledEmailsToSender({
        emailAccountId: "ea1",
        from: "Bob Smith <bob@example.com>",
        threadId: "thread-1",
        logger,
      });

      expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: "ea1",
          status: "PENDING",
          OR: [
            { threadId: "thread-1" },
            {
              threadId: null,
              to: { contains: "bob@example.com", mode: "insensitive" },
            },
          ],
        },
        data: { status: "CANCELLED" },
      });
      expect(result).toEqual({ cancelledCount: 2 });
    });

    it("still cancels thread-scoped emails when the sender address cannot be extracted", async () => {
      prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

      const result = await cancelScheduledEmailsToSender({
        emailAccountId: "ea1",
        from: "no address here",
        threadId: "thread-1",
        logger,
      });

      expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: "ea1",
          status: "PENDING",
          OR: [{ threadId: "thread-1" }],
        },
        data: { status: "CANCELLED" },
      });
      expect(result).toEqual({ cancelledCount: 1 });
    });

    it("does nothing when there is no sender address and no thread", async () => {
      const result = await cancelScheduledEmailsToSender({
        emailAccountId: "ea1",
        from: "no address here",
        threadId: null,
        logger,
      });

      expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ cancelledCount: 0 });
    });
  });

  describe("releaseScheduledEmailsToSender", () => {
    it("moves matching pending scheduled emails up to now", async () => {
      prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

      const result = await releaseScheduledEmailsToSender({
        emailAccountId: "ea1",
        from: "bob@example.com",
        threadId: null,
        logger,
      });

      expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: "ea1",
          status: "PENDING",
          OR: [
            {
              threadId: null,
              to: { contains: "bob@example.com", mode: "insensitive" },
            },
          ],
        },
        data: { sendAt: expect.any(Date) },
      });
      const sendAt =
        prisma.scheduledEmail.updateMany.mock.calls[0][0].data.sendAt;
      expect(Math.abs((sendAt as Date).getTime() - Date.now())).toBeLessThan(
        5000,
      );
      expect(result).toEqual({ releasedCount: 1 });
    });

    it("does nothing when there is no sender address and no thread", async () => {
      const result = await releaseScheduledEmailsToSender({
        emailAccountId: "ea1",
        from: "",
        threadId: null,
        logger,
      });

      expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ releasedCount: 0 });
    });
  });
});
