import React from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground border-primary hover:bg-primary/90 font-bold",
  outline: "border-border bg-background hover:bg-accent hover:text-foreground text-foreground",
  secondary: "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80",
  ghost: "border-border/60 hover:bg-muted hover:text-foreground text-muted-foreground",
  destructive: "bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive hover:text-white",
  link: "text-primary underline-offset-4 hover:underline border-transparent",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-9 gap-2 px-3.5 text-sm",
  xs: "h-6 gap-1 px-2 text-xs",
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  lg: "h-11 gap-2.5 px-5 text-base font-semibold",
  icon: "size-9 p-0",
  "icon-xs": "size-6 p-0",
  "icon-sm": "size-7 p-0",
  "icon-lg": "size-10 p-0",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: React.ReactNode;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "pop-3d inline-flex shrink-0 items-center justify-center border font-medium whitespace-nowrap transition-all outline-none select-none cursor-pointer disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
