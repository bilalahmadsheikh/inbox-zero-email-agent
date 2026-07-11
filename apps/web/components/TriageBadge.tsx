import { Badge, type Color } from "@/components/Badge";
import { HoverCard } from "@/components/HoverCard";
import type { TriageTier } from "@/generated/prisma/enums";

const TIER_CONFIG: Record<TriageTier, { label: string; color: Color }> = {
  URGENT: { label: "Urgent", color: "red" },
  IMPORTANT: { label: "Important", color: "yellow" },
  FYI: { label: "FYI", color: "gray" },
};

// Priority tier chip with the one-line AI reason on hover.
export function TriageBadge({
  tier,
  reason,
}: {
  tier?: TriageTier | null;
  reason?: string | null;
}) {
  if (!tier) return null;

  const config = TIER_CONFIG[tier];
  const badge = <Badge color={config.color}>{config.label}</Badge>;

  if (!reason) return badge;

  return (
    <HoverCard
      className="w-80"
      content={
        <div className="max-w-full whitespace-pre-wrap text-sm">{reason}</div>
      }
    >
      {badge}
    </HoverCard>
  );
}
