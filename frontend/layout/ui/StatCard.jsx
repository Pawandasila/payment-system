import React, { memo } from "react";

function StatCard({ title, value }) {
  return (
    <div className="rounded-3xl bg-white/75 p-6 shadow-xl backdrop-blur">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500">{title}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
    </div>
  );
}

export default memo(StatCard);
