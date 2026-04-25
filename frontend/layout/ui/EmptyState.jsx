import React, { memo } from "react";

function EmptyState({ title, description }) {
  return (
    <div className="rounded-3xl bg-white/70 p-6 shadow-xl">
      <h3 className="font-display text-3xl text-[#18211c]">{title}</h3>
      <p className="mt-2 text-stone-600">{description}</p>
    </div>
  );
}

export default memo(EmptyState);
