import useSWR from "swr";
import type { EmailAccountFullResponse } from "@/app/api/user/email-account/route";
import { processSWRResponse } from "@/utils/swr"; // Import the generic helper
import { useAccount } from "@/providers/EmailAccountProvider";

export function useEmailAccountFull() {
  const { emailAccountId } = useAccount();
  const swrResult = useSWR<EmailAccountFullResponse | { error: string }>(
    emailAccountId ? "/api/user/email-account" : null,
  );
  return processSWRResponse<EmailAccountFullResponse>(swrResult);
}
