import { type InferUITool, tool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import type { DriveProvider } from "@/utils/drive/types";

const MAX_RESULTS = 10;
// Provider-side search is ordered by recency, not by how well the name fits, so
// pull a wider candidate set than we return and rank it here.
const MAX_CANDIDATES = 100;

const searchDriveFilesInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Words from the desired cloud file name, such as a customer name, document type, project, or version.",
      ),
  })
  .strict();

export type DriveFileReference = {
  driveConnectionId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  folderId: string | null;
  path: string;
  modifiedAt: string | null;
  size: number | null;
  webUrl: string | null;
};

export const searchDriveFilesTool = ({
  emailAccountId,
  logger,
  markDriveFileSurfaced,
}: {
  emailAccountId: string;
  logger: Logger;
  // Records which files the user's own search actually returned, so the email
  // tools can refuse to attach anything this conversation never found.
  markDriveFileSurfaced?: (key: string) => void;
}) =>
  tool({
    description:
      "Search files visible through the user's connected Google Drive or OneDrive account. Use this before adding cloud files to draftEmail or sendEmail. Search only returns files from connected storage owned by this email account, and does not send or modify anything. Pass the returned driveConnectionId, fileId, filename, and mimeType unchanged into the email tool's attachments field. If several files look plausible, ask the user which one they want before creating or sending the email.",
    inputSchema: searchDriveFilesInputSchema,
    execute: async ({ query }) => {
      const connections = await prisma.driveConnection.findMany({
        where: { emailAccountId, isConnected: true },
        select: {
          id: true,
          provider: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
        },
      });

      if (connections.length === 0) {
        return {
          error: "No cloud storage is connected. Connect Drive first.",
          files: [],
        };
      }

      const files: DriveFileReference[] = [];
      const connectionErrors: string[] = [];
      const providers = new Map<string, DriveProvider>();

      // Connections are searched in parallel: each is one provider-side query,
      // and a slow or unreachable drive shouldn't hold up the others.
      await Promise.all(
        connections.map(async (connection) => {
          try {
            const provider = await createDriveProviderWithRefresh(
              connection,
              logger,
            );
            providers.set(connection.id, provider);
            const discovered = await searchProviderFiles({ provider, query });
            files.push(
              ...discovered.map((file) => ({
                driveConnectionId: connection.id,
                fileId: file.id,
                filename: file.name,
                mimeType: file.mimeType,
                folderId: file.folderId ?? null,
                path: file.name,
                modifiedAt: file.modifiedAt?.toISOString() ?? null,
                size: file.size ?? null,
                webUrl: file.webUrl ?? null,
              })),
            );
          } catch (error) {
            logger.warn("Failed to search connected drive", {
              driveConnectionId: connection.id,
              error,
            });
            connectionErrors.push(connection.id);
          }
        }),
      );

      const ranked = rankDriveFiles(files, query);
      const topResults = ranked.slice(0, MAX_RESULTS);
      await resolveFolderPaths({ files: topResults, providers, logger });

      for (const file of topResults) {
        markDriveFileSurfaced?.(`${file.driveConnectionId}:${file.fileId}`);
      }

      const failedCount = connectionErrors.length;
      const allConnectionsFailed = failedCount === connections.length;

      return {
        files: topResults,
        truncated: ranked.length > MAX_RESULTS,
        ...(allConnectionsFailed
          ? { error: "Connected cloud storage could not be searched." }
          : {}),
        // Reported as a warning rather than an error: the chat UI replaces the
        // result with an error card, which would hide the files we did find,
        // and the model still needs to know these results are incomplete
        // before it tells the user nothing matched.
        ...(failedCount > 0 && !allConnectionsFailed
          ? {
              warning: `${failedCount} of ${connections.length} connected drives could not be searched, so these results may be incomplete.`,
            }
          : {}),
      };
    },
  });

export type SearchDriveFilesTool = InferUITool<
  ReturnType<typeof searchDriveFilesTool>
>;

async function searchProviderFiles({
  provider,
  query,
}: {
  provider: DriveProvider;
  query: string;
}) {
  const terms = normalizeSearchTerms(query);
  if (terms.length === 0) return [];

  const candidates = await provider.searchFilesByName(query, {
    limit: MAX_CANDIDATES,
  });

  // Each provider decides what its own search matches — Google on word starts,
  // OneDrive partly on file content — so re-apply the contract this tool
  // promises the model: every search term appears in the filename.
  return candidates.filter((file) => matchesSearch(file.name, terms));
}

// Folder names are a separate lookup on both providers, so resolve them only
// for the handful of files actually returned, and never fail the search over a
// missing folder name.
async function resolveFolderPaths({
  files,
  providers,
  logger,
}: {
  files: DriveFileReference[];
  providers: Map<string, DriveProvider>;
  logger: Logger;
}) {
  const pending = new Map<string, { connectionId: string; folderId: string }>();
  for (const file of files) {
    if (!file.folderId) continue;
    pending.set(`${file.driveConnectionId}:${file.folderId}`, {
      connectionId: file.driveConnectionId,
      folderId: file.folderId,
    });
  }
  if (pending.size === 0) return;

  const folderNames = new Map<string, string>();
  await Promise.all(
    [...pending].map(async ([key, { connectionId, folderId }]) => {
      try {
        const folder = await providers.get(connectionId)?.getFolder(folderId);
        if (folder?.name) folderNames.set(key, folder.name);
      } catch (error) {
        logger.warn("Failed to resolve drive folder name", {
          driveConnectionId: connectionId,
          error,
        });
      }
    }),
  );

  for (const file of files) {
    const folderName = folderNames.get(
      `${file.driveConnectionId}:${file.folderId}`,
    );
    if (folderName) file.path = `${folderName}/${file.filename}`;
  }
}

function rankDriveFiles(files: DriveFileReference[], query: string) {
  // Every match already contains every search term, so the contiguous phrase
  // is the useful tiebreaker. Collapse the query's spacing so "acme  contract"
  // still matches "Acme contract.pdf".
  const normalizedQuery = normalizeSearchTerms(query).join(" ");
  return [...files].sort((a, b) => {
    const aExact = a.filename.toLocaleLowerCase().includes(normalizedQuery);
    const bExact = b.filename.toLocaleLowerCase().includes(normalizedQuery);
    if (aExact !== bExact) return aExact ? -1 : 1;

    return (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? "");
  });
}

function normalizeSearchTerms(query: string) {
  return query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
}

function matchesSearch(filename: string, terms: string[]) {
  const normalizedName = filename.toLocaleLowerCase();
  return terms.every((term) => normalizedName.includes(term));
}
