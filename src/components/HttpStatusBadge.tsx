import { ShieldCheck, ShieldAlert, AlertCircle, HelpCircle, ArrowUpRight } from "lucide-react";

interface HttpStatusBadgeProps {
  status?: number;
  statusText?: string;
  className?: string;
}

export function HttpStatusBadge({ status, statusText, className = "" }: HttpStatusBadgeProps) {
  if (status === undefined || status === null) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-muted/50 text-muted-foreground border border-border select-none ${className}`}
        title="HTTP status not checked yet"
      >
        <HelpCircle className="w-3 h-3 text-muted-foreground/60" />
        <span>Unchecked</span>
      </span>
    );
  }

  if (status >= 200 && status < 300) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-green-500/15 text-green-500 border border-green-500/40 select-none ${className}`}
        title={`Status: ${status} ${statusText || "OK"}`}
      >
        <ShieldCheck className="w-3 h-3" />
        <span>{status} OK</span>
      </span>
    );
  }

  if (status >= 300 && status < 400) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-amber-500/15 text-amber-500 border border-amber-500/40 select-none ${className}`}
        title={`Redirect: ${status} ${statusText || "Moved"}`}
      >
        <ArrowUpRight className="w-3 h-3" />
        <span>{status} Redirect</span>
      </span>
    );
  }

  if (status >= 400 && status < 500) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-red-500/15 text-red-500 border border-red-500/40 select-none ${className}`}
        title={`Client Error: ${status} ${statusText || "Not Found"}`}
      >
        <ShieldAlert className="w-3 h-3" />
        <span>{status} {status === 404 ? "Not Found" : "Error"}</span>
      </span>
    );
  }

  // 500+ or 0 (network error)
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-destructive/15 text-destructive border border-destructive/40 select-none ${className}`}
      title={`Server/Network Error: ${status || "Failed"} ${statusText || ""}`}
    >
      <AlertCircle className="w-3 h-3" />
      <span>{status ? `${status} Fail` : "Net Err"}</span>
    </span>
  );
}
