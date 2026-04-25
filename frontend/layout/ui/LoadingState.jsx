import React, { memo } from "react";

function LoadingState() {
  return (
    <div className="rounded-3xl bg-white/70 p-6 shadow-xl">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500">Loading</p>
      <p className="mt-2 text-stone-700">Fetching merchant dashboard...</p>
    </div>
  );
}

export default memo(LoadingState);
