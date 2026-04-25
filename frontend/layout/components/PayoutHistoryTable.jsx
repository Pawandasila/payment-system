import React, { memo } from "react";
import { formatMoney, statusClass } from "../../lib/utils";

function PayoutHistoryTable({ payouts }) {
  return (
    <div className="rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
      <h2 className="mb-4 font-display text-3xl">Payout history</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-stone-500">
            <tr>
              <th className="py-2">Amount</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Bank</th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 && (
              <tr>
                <td className="py-4 text-stone-500" colSpan={4}>
                  No payouts yet.
                </td>
              </tr>
            )}
            {payouts.map((payout) => (
              <tr key={payout.id} className="border-t border-stone-200">
                <td className="py-3 font-bold">{formatMoney(payout.amount_paise)}</td>
                <td>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(payout.status)}`}>
                    {payout.status}
                  </span>
                </td>
                <td>{payout.attempts}</td>
                <td>
                  {payout.bank_account.bank_name} ****{payout.bank_account.last4}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(PayoutHistoryTable);
