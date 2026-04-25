import React, { memo } from "react";

function PayoutForm({
  amount,
  bankAccountId,
  bankAccounts,
  isSubmitting,
  message,
  messageKind,
  onAmountChange,
  onBankAccountChange,
  onSubmit,
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-3xl bg-[#18211c] p-6 text-white shadow-xl">
      <h2 className="font-display text-3xl">Request payout</h2>

      <label className="mt-5 block text-sm font-semibold">Amount in INR</label>
      <input
        className="mt-2 w-full rounded-2xl border-0 px-4 py-3 text-stone-950"
        value={amount}
        onChange={(event) => onAmountChange(event.target.value)}
        type="number"
        min="0"
        step="0.01"
        placeholder="6000"
        required
      />

      <label className="mt-4 block text-sm font-semibold">Bank account</label>
      <select
        className="mt-2 w-full rounded-2xl border-0 px-4 py-3 text-stone-950"
        value={bankAccountId}
        onChange={(event) => onBankAccountChange(event.target.value)}
        disabled={!bankAccounts.length}
      >
        {!bankAccounts.length && <option value="">No bank account available</option>}
        {bankAccounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.bank_name} ****{account.last4}
          </option>
        ))}
      </select>

      <button
        className="mt-5 w-full rounded-2xl bg-[#f7d87c] px-5 py-3 font-bold text-[#18211c] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting || !bankAccounts.length}
      >
        {isSubmitting ? "Submitting..." : "Hold funds and create payout"}
      </button>

      {message && (
        <p
          className={`mt-4 text-sm ${
            messageKind === "error"
              ? "text-rose-300"
              : messageKind === "success"
                ? "text-emerald-300"
                : "text-[#f7d87c]"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}

export default memo(PayoutForm);
