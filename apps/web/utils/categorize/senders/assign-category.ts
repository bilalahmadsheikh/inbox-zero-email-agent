import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";
import { updateCategoryForSender } from "@/utils/categorize/senders/categorize";
import type { Logger } from "@/utils/logger";

export type AssignSendersToCategoryResult =
  | {
      status: "category_not_found";
      requestedCategory: string;
      availableCategories: string[];
    }
  | {
      status: "assigned";
      categoryName: string;
      categoryCreated: boolean;
      assigned: string[];
    };

/**
 * Puts senders into a sender category, creating the category when asked to.
 *
 * Senders that have never emailed the account are still assignable: the
 * underlying record is upserted, so a category can be set up ahead of the first
 * message from someone.
 */
export async function assignSendersToCategory({
  emailAccountId,
  senders,
  categoryName,
  createIfMissing = false,
  logger,
}: {
  emailAccountId: string;
  senders: string[];
  categoryName: string;
  createIfMissing?: boolean;
  logger: Logger;
}): Promise<AssignSendersToCategoryResult> {
  const existing = await prisma.category.findFirst({
    where: {
      emailAccountId,
      name: { equals: categoryName, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });

  let category = existing;
  let categoryCreated = false;

  if (!category) {
    if (!createIfMissing) {
      const available = await prisma.category.findMany({
        where: { emailAccountId },
        select: { name: true },
        orderBy: { name: "asc" },
      });

      return {
        status: "category_not_found",
        requestedCategory: categoryName,
        availableCategories: available.map((c) => c.name),
      };
    }

    const created = await prisma.category.create({
      data: { emailAccountId, name: categoryName },
      select: { id: true, name: true },
    });
    category = created;
    categoryCreated = true;
    logger.info("Created sender category from chat", { name: created.name });
  }

  const addresses = [
    ...new Set(
      senders
        .map((sender) => extractEmailAddress(sender) || sender)
        .map((address) => address.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  for (const address of addresses) {
    await updateCategoryForSender({
      emailAccountId,
      sender: address,
      categoryId: category.id,
    });
  }

  return {
    status: "assigned",
    categoryName: category.name,
    categoryCreated,
    assigned: addresses,
  };
}
