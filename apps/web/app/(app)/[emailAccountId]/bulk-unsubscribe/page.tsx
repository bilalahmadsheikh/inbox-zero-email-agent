import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { BulkUnsubscribe } from "./BulkUnsubscribeSection";

// Bulk archive/trash-by-sender runs inline; give those server actions the full
// window so large cleanups complete in one request.
export const maxDuration = 300;

export default async function BulkUnsubscribePage() {
  return (
    <>
      <PermissionsCheck />
      <BulkUnsubscribe />
    </>
  );
}
