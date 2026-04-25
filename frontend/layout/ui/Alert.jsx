import React, { memo } from "react";

function Alert({ kind = "error", children, actionLabel, onAction }) {
  const className =
    kind === "error"
      ? "border-rose-300 bg-rose-50 text-rose-900"
      : "border-emerald-300 bg-emerald-50 text-emerald-900";

  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${className}`}>
      <p>{children}</p>
      {actionLabel && onAction && (
        <button
          className="shrink-0 rounded-lg border border-current px-3 py-1 text-xs font-semibold"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default memo(Alert);
