import React, { memo } from "react";

function ErrorToast({ message, visible, onClose }) {
  if (!visible || !message) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 w-[min(92vw,420px)]">
      <div className="pointer-events-auto rounded-2xl border border-rose-300 bg-rose-50/95 px-4 py-3 text-rose-900 shadow-xl backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
          <p className="flex-1 text-sm font-medium">{message}</p>
          <button
            className="shrink-0 rounded-md border border-rose-300 px-2 py-0.5 text-xs font-semibold text-rose-800"
            type="button"
            onClick={onClose}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ErrorToast);
