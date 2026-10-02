import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../../lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = "max-w-2xl",
  children,
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full bg-card border-2 border-border shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200",
          maxWidth
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-muted/30">
          <div>
            <h2 className="text-lg font-bold uppercase tracking-wide text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
