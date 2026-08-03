import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { assignSendersToCategory } from "./assign-category";
import { updateCategoryForSender } from "@/utils/categorize/senders/categorize";

vi.mock("@/utils/prisma");
vi.mock("@/utils/categorize/senders/categorize", () => ({
  updateCategoryForSender: vi.fn(),
}));

const logger = createTestLogger();

describe("assignSendersToCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns senders to an existing category", async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: "category-1",
      name: "Family",
    } as never);

    const result = await assignSendersToCategory({
      emailAccountId: "account-1",
      senders: ["mbodla04@gmail.com", "darabodla26@gmail.com"],
      categoryName: "family",
      logger,
    });

    expect(result).toMatchObject({
      status: "assigned",
      categoryName: "Family",
      categoryCreated: false,
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(vi.mocked(updateCategoryForSender)).toHaveBeenCalledTimes(2);
  });

  it("asks rather than inventing a category from a typo", async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { name: "Family" },
      { name: "Marketing" },
    ] as never);

    const result = await assignSendersToCategory({
      emailAccountId: "account-1",
      senders: ["someone@example.com"],
      categoryName: "Familiy",
      logger,
    });

    expect(result).toEqual({
      status: "category_not_found",
      requestedCategory: "Familiy",
      availableCategories: ["Family", "Marketing"],
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(vi.mocked(updateCategoryForSender)).not.toHaveBeenCalled();
  });

  it("creates the category when explicitly asked", async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.category.create).mockResolvedValue({
      id: "category-new",
      name: "Family",
    } as never);

    const result = await assignSendersToCategory({
      emailAccountId: "account-1",
      senders: ["mbodla04@gmail.com"],
      categoryName: "Family",
      createIfMissing: true,
      logger,
    });

    expect(result).toMatchObject({
      status: "assigned",
      categoryCreated: true,
    });
    expect(vi.mocked(updateCategoryForSender)).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "category-new" }),
    );
  });

  it("normalizes and deduplicates the addresses given", async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: "category-1",
      name: "Family",
    } as never);

    const result = await assignSendersToCategory({
      emailAccountId: "account-1",
      senders: [
        "Mehru Bodla <MBodla04@gmail.com>",
        "mbodla04@gmail.com",
        "  darabodla26@gmail.com  ",
      ],
      categoryName: "Family",
      logger,
    });

    expect(result).toMatchObject({
      assigned: ["mbodla04@gmail.com", "darabodla26@gmail.com"],
    });
    expect(vi.mocked(updateCategoryForSender)).toHaveBeenCalledTimes(2);
  });
});
