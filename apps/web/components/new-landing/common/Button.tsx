import { cn } from "@/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

export type ButtonVariant = "primary" | "secondary" | "secondary-two";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  auto?: boolean;
  children: React.ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl";
  variant?: ButtonVariant;
}

export function Button({
  auto = false,
  children,
  variant = "primary",
  className,
  size = "md",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const type = props.type ?? "button";

  const buttonVariants = cva(
    [
      "rounded-[13px] font-medium transition-all will-change-transform",
      "flex items-center justify-center gap-2",
      variant === "primary" ? "" : "hover:scale-[1.04]",
    ],
    {
      variants: {
        variant: {
          primary: [
            "bg-gradient-to-b from-[var(--landing-button-from)] to-[var(--landing-button-to)] text-[var(--landing-accent-contrast)] button-gradient-border shadow-[var(--landing-button-shadow)] hover:shadow-[var(--landing-button-shadow-hover)]",
            "relative overflow-hidden z-10",
            "before:absolute before:inset-0 before:bg-gradient-to-b before:from-[var(--landing-button-hover-from)] before:to-[var(--landing-button-hover-to)] before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-200 before:z-0",
          ],
          secondary:
            "bg-[var(--landing-surface)] hover:bg-[var(--landing-surface-hover)] border border-[var(--landing-border)] text-[var(--landing-text)] shadow-[var(--landing-shadow-soft)]",
          "secondary-two":
            "bg-[var(--landing-surface)] hover:bg-[var(--landing-surface-hover)] border border-[var(--landing-border)] text-[var(--landing-muted)] shadow-[var(--landing-shadow-soft)] hover:text-[var(--landing-text)] hover:shadow-[var(--landing-shadow)] [&>svg]:text-[var(--landing-accent)]",
        },
        size: {
          md: "text-sm py-2 px-4",
          lg: "text-sm py-[10.5px] px-[18px]",
          xl: "text-[16px] py-[11.7px] px-[22px]",
        },
        auto: {
          true: "w-full",
        },
      },
    },
  );

  // For primary variant with gradient border wrapper
  if (variant === "primary") {
    return (
      <div
        className={cn(
          "hover:scale-[1.04] transition-all duration-200 will-change-transform",
          "rounded-[14px] p-[1px] bg-gradient-to-b",
          "from-[var(--landing-gold)] to-[var(--landing-button-to)] hover:from-[var(--landing-gold-strong)] hover:to-[var(--landing-button-hover-to)]",
          auto ? "w-full" : "w-fit",
        )}
      >
        <Comp
          type={type}
          className={buttonVariants({
            variant,
            size,
            className,
            auto,
          })}
          {...props}
        >
          {asChild ? (
            children
          ) : (
            <span className="relative z-10">{children}</span>
          )}
        </Comp>
      </div>
    );
  }

  // For secondary variants - simpler, no wrapper
  return (
    <Comp
      type={type}
      className={buttonVariants({ variant, size, className, auto })}
      {...props}
    >
      {children}
    </Comp>
  );
}
