import { cva } from "class-variance-authority";

interface CardWrapperProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "xs" | "xs-2" | "sm" | "md";
  rounded?: "none" | "xs" | "sm" | "md" | "full";
  variant?: "default" | "dark-border";
}

export function CardWrapper({
  children,
  variant = "default",
  padding = "md",
  rounded = "md",
  className,
}: CardWrapperProps) {
  const cardWrapperStyles = cva(
    "text-left border bg-gradient-to-b from-[var(--landing-wrapper-from)] to-[var(--landing-wrapper-to)] shadow-[var(--landing-wrapper-shadow)] transition-colors",
    {
      variants: {
        padding: {
          none: "",
          xs: "p-1.5",
          "xs-2": "p-2",
          sm: "p-3",
          md: "p-5",
        },
        rounded: {
          none: "",
          xs: "rounded-[19px]",
          sm: "rounded-[38px]",
          md: "rounded-[52px]",
          full: "rounded-full",
        },
        variant: {
          default: "border-[var(--landing-border-soft)]",
          "dark-border": "border-[var(--landing-border)]",
        },
      },
    },
  );

  return (
    <div
      className={cardWrapperStyles({ padding, rounded, variant, className })}
    >
      {children}
    </div>
  );
}
