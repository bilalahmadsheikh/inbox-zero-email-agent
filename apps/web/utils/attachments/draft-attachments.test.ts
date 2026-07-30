import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@/utils/drive/provider");
vi.mock("@/utils/premium/server", () => ({
  checkHasAccess: vi.fn(async () => true),
}));

import prisma from "@/utils/__mocks__/prisma";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import type { DriveProvider } from "@/utils/drive/types";
import {
  describeUnresolvedAttachments,
  resolveCloudAttachmentsForOutgoingEmail,
} from "./draft-attachments";

const logger = createTestLogger();
const MB = 1024 * 1024;

const SELECTED = [
  {
    driveConnectionId: "drive-1",
    fileId: "file-1",
    filename: "Contract.pdf",
    mimeType: "application/pdf",
  },
];

function mockDrive({
  size,
  contentBytes,
}: {
  size?: number;
  contentBytes: number;
}) {
  const downloadFile = vi.fn(async () => ({
    file: {
      id: "file-1",
      name: "Contract.pdf",
      mimeType: "application/pdf",
      size,
    },
    content: Buffer.alloc(contentBytes),
  }));

  vi.mocked(createDriveProviderWithRefresh).mockResolvedValue({
    getFile: vi.fn(async () => ({
      id: "file-1",
      name: "Contract.pdf",
      mimeType: "application/pdf",
      size,
    })),
    downloadFile,
  } as unknown as DriveProvider);

  return { downloadFile };
}

describe("resolveCloudAttachmentsForOutgoingEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      prisma.emailAccount.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ userId: "u1" });
    prisma.driveConnection.findMany.mockResolvedValue([
      { id: "drive-1", provider: "google", isConnected: true },
    ] as never);
  });

  it("attaches a file within the size budget", async () => {
    mockDrive({ size: 2 * MB, contentBytes: 2 * MB });

    const result = await resolveCloudAttachmentsForOutgoingEmail({
      emailAccountId: "ea_1",
      selectedAttachments: SELECTED,
      logger,
    });

    expect(result).toEqual({
      attachments: [expect.objectContaining({ filename: "Contract.pdf" })],
    });
  });

  it("refuses an oversized file without downloading it", async () => {
    const { downloadFile } = mockDrive({
      size: 200 * MB,
      contentBytes: 1024,
    });

    const result = await resolveCloudAttachmentsForOutgoingEmail({
      emailAccountId: "ea_1",
      selectedAttachments: SELECTED,
      logger,
    });

    // Downloading first would buffer the whole file into memory, which is the
    // failure mode the pre-download size check exists to prevent.
    expect(downloadFile).not.toHaveBeenCalled();
    expect("error" in result).toBe(true);
  });

  it("refuses a file whose real bytes exceed the cap despite a missing size", async () => {
    // Google-native exports report no size until converted, so the only
    // reliable check for them is against what actually downloaded.
    mockDrive({ size: undefined, contentBytes: 40 * MB });

    const result = await resolveCloudAttachmentsForOutgoingEmail({
      emailAccountId: "ea_1",
      selectedAttachments: SELECTED,
      logger,
    });

    expect("error" in result).toBe(true);
  });

  it("returns an error rather than a partial set when a file is unavailable", async () => {
    vi.mocked(createDriveProviderWithRefresh).mockResolvedValue({
      getFile: vi.fn(async () => null),
      downloadFile: vi.fn(async () => null),
    } as unknown as DriveProvider);

    const result = await resolveCloudAttachmentsForOutgoingEmail({
      emailAccountId: "ea_1",
      selectedAttachments: SELECTED,
      logger,
    });

    expect(result).toEqual({ error: expect.stringContaining("1 of 1") });
  });

  it("needs no lookups when nothing was selected", async () => {
    const result = await resolveCloudAttachmentsForOutgoingEmail({
      emailAccountId: "ea_1",
      selectedAttachments: [],
      logger,
    });

    expect(result).toEqual({ attachments: [] });
    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
  });
});

describe("describeUnresolvedAttachments", () => {
  it("reports how many of the requested files failed", () => {
    expect(
      describeUnresolvedAttachments({ requestedCount: 3, resolvedCount: 1 }),
    ).toContain("2 of 3");
  });

  it("names size as a possible cause so the message is actionable", () => {
    expect(
      describeUnresolvedAttachments({ requestedCount: 1, resolvedCount: 0 }),
    ).toMatch(/MB attachment limit/);
  });
});
