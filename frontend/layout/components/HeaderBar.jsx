import React, { memo } from "react";

function HeaderBar({ merchantId, merchants, isMerchantsLoading, onMerchantChange }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-emerald-900">Playto Pay</p>
        <h1 className="font-display text-5xl text-[#18211c]">Payout command center</h1>
      </div>
      <select
        className="rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 shadow-sm"
        value={merchantId}
        onChange={(event) => onMerchantChange(event.target.value)}
        disabled={isMerchantsLoading || merchants.length === 0}
      >
        {merchants.length === 0 && <option value="">No merchants available</option>}
        {merchants.map((merchant) => (
          <option key={merchant.id} value={merchant.id}>
            {merchant.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default memo(HeaderBar);
