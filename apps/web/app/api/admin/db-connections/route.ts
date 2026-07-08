import { NextResponse } from "next/server";
import { getDbConnectionSnapshot } from "@/utils/db-connections";
import { withAdmin } from "@/utils/middleware";

export type GetAdminDbConnectionsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAdmin("admin/db-connections", async () => {
  const result = await getData();
  return NextResponse.json(result);
});

async function getData() {
  return getDbConnectionSnapshot();
}
