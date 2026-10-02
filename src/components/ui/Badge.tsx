import React from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "secondary" | "outline" | "active";
  onRemove?: () => void;
  children: React.ReactNode;
}

export function Badge({
  className,
  variant = "default",
  onRemove,
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-muted text-muted-foreground border-border hover:bg-accent hover:text-foreground",
    primary: "bg-primary/15 text-primary border-primary/40 font-bold",
    secondary: "bg-secondary text-secondary-foreground border-border",
    outline: "bg-transparent text-foreground border-border",
    active: "bg-primary text-primary-foreground border-primary font-bold shadow-sm",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs uppercase tracking-wider font-semibold border transition-all select-none",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:text-destructive ml-0.5 cursor-pointer text-xs"
        >
          ×
        </button>
      )}
    </span>
  );
}
