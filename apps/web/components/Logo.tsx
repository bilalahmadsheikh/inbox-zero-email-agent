import Image from "next/image";
import { BRAND_LOGO_URL, BRAND_NAME } from "@/utils/branding";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  if (BRAND_LOGO_URL) {
    return (
      <Image
        src={BRAND_LOGO_URL}
        alt={`${BRAND_NAME} logo`}
        width={200}
        height={60}
        className={className}
        unoptimized
      />
    );
  }

  // Width tracks the brand name so the SVG box has no invisible trailing
  // space (which inflates layout width wherever the logo is height-scaled).
  const viewBoxWidth = BRAND_NAME.length * 16 + 8;

  return (
    <svg
      viewBox={`0 0 ${viewBoxWidth} 36`}
      fill="none"
      className={className}
      role="img"
    >
      <title>{BRAND_NAME}</title>
      <text
        x="0"
        y="27"
        fill="currentColor"
        fontFamily="var(--font-title, Geist, Arial, sans-serif)"
        fontSize="27"
        fontWeight="600"
        letterSpacing="-0.3"
      >
        Zynbox
      </text>
    </svg>
  );
}
