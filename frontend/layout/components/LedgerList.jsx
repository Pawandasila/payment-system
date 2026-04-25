import React, { memo } from "react";
import { formatMoney } from "../../lib/utils";

function LedgerList({ entries }) {
  return (
    <div className="mt-6 rounded-3xl bg-white/70 p-6 shadow-xl">
      <h2 className="mb-4 font-display text-3xl">Recent ledger</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {entries.length === 0 && <p className="text-stone-600">No ledger entries yet.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <div className="flex justify-between">
              <span className="font-bold capitalize">{entry.kind}</span>
              <span>{formatMoney(entry.amount_paise)}</span>
            </div>
            <p className="text-sm text-stone-500">{entry.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(LedgerList);
