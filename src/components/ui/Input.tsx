import React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", icon, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {icon && (
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            "w-full bg-background border border-input px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50",
            icon && "pl-10",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full bg-background border border-input px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 min-h-[80px] resize-y",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
