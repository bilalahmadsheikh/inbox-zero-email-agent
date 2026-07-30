import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import type { DriveProvider } from "@/utils/drive/types";
import { searchDriveFilesTool } from "./chat-drive-tools";

vi.mock("@/utils/prisma");
vi.mock("@/utils/drive/provider");

const logger = createTestLogger();

describe("searchDriveFilesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches only connected drives for the current email account", async () => {
    prisma.driveConnection.findMany.mockResolvedValue([
      {
        id: "drive-1",
        provider: "google",
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: null,
      },
    ] as any);
    const searchFilesByName = vi.fn().mockResolvedValue([
      {
        id: "file-1",
        name: "Acme signed contract.pdf",
        mimeType: "application/pdf",
        folderId: "folder-1",
        modifiedAt: new Date("2026-07-20T12:00:00.000Z"),
      },
    ]);
    vi.mocked(createDriveProviderWithRefresh).mockResolvedValue({
      searchFilesByName,
      getFolder: vi.fn(async () => ({ id: "folder-1", name: "Contracts" })),
    } as unknown as DriveProvider);

    const driveTool = searchDriveFilesTool({
      emailAccountId: "account-1",
      logger,
    });
    const result = await (driveTool.execute as any)({ query: "acme contract" });

    expect(prisma.driveConnection.findMany).toHaveBeenCalledWith({
      where: { emailAccountId: "account-1", isConnected: true },
      select: expect.any(Object),
    });
    // One provider-side query, not a folder walk.
    expect(searchFilesByName).toHaveBeenCalledTimes(1);
    expect(result.files).toEqual([
      expect.objectContaining({
        driveConnectionId: "drive-1",
        fileId: "file-1",
        filename: "Acme signed contract.pdf",
        path: "Contracts/Acme signed contract.pdf",
      }),
    ]);
  });

  it("drops provider matches whose filename lacks a search term", async () => {
    prisma.driveConnection.findMany.mockResolvedValue([
      { id: "drive-1", provider: "microsoft" },
    ] as any);
    // OneDrive search also matches file content, so a result can come back
    // without the terms appearing in its name at all.
    vi.mocked(createDriveProviderWithRefresh).mockResolvedValue({
      searchFilesByName: vi.fn().mockResolvedValue([
        {
          id: "file-1",
          name: "Acme contract.pdf",
          mimeType: "application/pdf",
        },
        {
          id: "file-2",
          name: "Unrelated notes.docx",
          mimeType: "application/vnd.openxmlformats",
        },
      ]),
      getFolder: vi.fn(async () => null),
    } as unknown as DriveProvider);

    const driveTool = searchDriveFilesTool({
      emailAccountId: "account-1",
      logger,
    });
    const result = await (driveTool.execute as any)({ query: "acme contract" });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].filename).toBe("Acme contract.pdf");
  });

  it("still returns files when a folder name cannot be resolved", async () => {
    prisma.driveConnection.findMany.mockResolvedValue([
      { id: "drive-1", provider: "google" },
    ] as any);
    vi.mocked(createDriveProviderWithRefresh).mockResolvedValue({
      searchFilesByName: vi.fn().mockResolvedValue([
        {
          id: "file-1",
          name: "Acme contract.pdf",
          mimeType: "application/pdf",
          folderId: "folder-1",
        },
      ]),
      getFolder: vi.fn().mockRejectedValue(new Error("no access")),
    } as unknown as DriveProvider);

    const driveTool = searchDriveFilesTool({
      emailAccountId: "account-1",
      logger,
    });
    const result = await (driveTool.execute as any)({ query: "acme contract" });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("Acme contract.pdf");
    expect(result.error).toBeUndefined();
  });

  it("returns a connection prompt when no drive is connected", async () => {
    prisma.driveConnection.findMany.mockResolvedValue([]);

    const driveTool = searchDriveFilesTool({
      emailAccountId: "account-1",
      logger,
    });
    const result = await (driveTool.execute as any)({ query: "invoice" });

    expect(result).toEqual({
      error: "No cloud storage is connected. Connect Drive first.",
      files: [],
    });
    expect(createDriveProviderWithRefresh).not.toHaveBeenCalled();
  });

  it("warns that results are incomplete when only some drives fail", async () => {
    prisma.driveConnection.findMany.mockResolvedValue([
      { id: "drive-1", provider: "google" },
      { id: "drive-2", provider: "microsoft" },
    ] as any);
    vi.mocked(createDriveProviderWithRefresh)
      .mockResolvedValueOnce({
        searchFilesByName: vi.fn().mockResolvedValue([
          {
            id: "file-1",
            name: "Acme contract.pdf",
            mimeType: "application/pdf",
          },
        ]),
        getFolder: vi.fn(async () => null),
      } as unknown as DriveProvider)
      .mockRejectedValueOnce(new Error("token revoked"));

    const driveTool = searchDriveFilesTool({
      emailAccountId: "account-1",
      logger,
    });
    const result = await (driveTool.execute as any)({ query: "acme contract" });

    // The reachable drive's file must still come back, and the model must be
    // told the picture is partial so it doesn't report a confident "not found".
    expect(result.files).toHaveLength(1);
    expect(result.error).toBeUndefined();
    expect(result.warning).toContain("1 of 2");
  });

  it("only reports truncation when more matches exist than are returned", async () => {
    const buildFiles = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `file-${index}`,
        name: `Acme contract ${index}.pdf`,
        mimeType: "application/pdf",
      }));

    prisma.driveConnection.findMany.mockResolvedValue([
      { id: "drive-1", provider: "google" },
    ] as any);
    vi.mocked(createDriveProviderWithRefresh).mockResolvedValue({
      searchFilesByName: vi.fn().mockResolvedValue(buildFiles(10)),
      getFolder: vi.fn(async () => null),
    } as unknown as DriveProvider);

    const driveTool = searchDriveFilesTool({
      emailAccountId: "account-1",
      logger,
    });
    const result = await (driveTool.execute as any)({ query: "acme contract" });

    expect(result.files).toHaveLength(10);
    expect(result.truncated).toBe(false);
  });
});
