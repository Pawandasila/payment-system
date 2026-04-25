import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./main.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

function formatMoney(paise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
}

function statusClass(status) {
  return {
    pending: "bg-amber-100 text-amber-900",
    processing: "bg-sky-100 text-sky-900",
    completed: "bg-emerald-100 text-emerald-900",
    failed: "bg-rose-100 text-rose-900",
  }[status] || "bg-stone-100 text-stone-900";
}

function App() {
  const [merchants, setMerchants] = useState([]);
  const [merchantId, setMerchantId] = useState(localStorage.getItem("merchantId") || "");
  const [dashboard, setDashboard] = useState(null);
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API}/merchants`)
      .then((r) => r.json())
      .then((data) => {
        setMerchants(data);
        if (!merchantId && data[0]) {
          setMerchantId(data[0].id);
          localStorage.setItem("merchantId", data[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!merchantId) return;
    localStorage.setItem("merchantId", merchantId);
    let alive = true;
    const load = () => {
      fetch(`${API}/dashboard`, { headers: { "X-Merchant-Id": merchantId } })
        .then((r) => r.json())
        .then((data) => {
          if (!alive) return;
          setDashboard(data);
          if (!bankAccountId && data.bank_accounts?.[0]) setBankAccountId(data.bank_accounts[0].id);
        });
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [merchantId]);

  async function requestPayout(event) {
    event.preventDefault();
    setMessage("");
    const amountPaise = Math.round(Number(amount) * 100);
    const response = await fetch(`${API}/payouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": merchantId,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ amount_paise: amountPaise, bank_account_id: bankAccountId }),
    });
    const data = await response.json();
    setMessage(response.ok ? `Payout ${data.id} created.` : data.detail || "Payout failed.");
    setAmount("");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,#f7d87c,transparent_28%),linear-gradient(135deg,#f4efe5,#dce8d2)] px-5 py-8">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-emerald-900">Playto Pay</p>
            <h1 className="font-display text-5xl text-[#18211c]">Payout command center</h1>
          </div>
          <select
            className="rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 shadow-sm"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
          >
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>
                {merchant.name}
              </option>
            ))}
          </select>
        </div>

        {dashboard && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card title="Available" value={formatMoney(dashboard.balance.available_paise)} />
              <Card title="Held" value={formatMoney(dashboard.balance.held_paise)} />
              <Card title="Recent payouts" value={dashboard.payouts.length} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
              <form onSubmit={requestPayout} className="rounded-3xl bg-[#18211c] p-6 text-white shadow-xl">
                <h2 className="font-display text-3xl">Request payout</h2>
                <label className="mt-5 block text-sm font-semibold">Amount in INR</label>
                <input
                  className="mt-2 w-full rounded-2xl border-0 px-4 py-3 text-stone-950"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="6000"
                  required
                />
                <label className="mt-4 block text-sm font-semibold">Bank account</label>
                <select
                  className="mt-2 w-full rounded-2xl border-0 px-4 py-3 text-stone-950"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                >
                  {dashboard.bank_accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.bank_name} ****{account.last4}
                    </option>
                  ))}
                </select>
                <button className="mt-5 w-full rounded-2xl bg-[#f7d87c] px-5 py-3 font-bold text-[#18211c]">
                  Hold funds and create payout
                </button>
                {message && <p className="mt-4 text-sm text-[#f7d87c]">{message}</p>}
              </form>

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
                      {dashboard.payouts.map((payout) => (
                        <tr key={payout.id} className="border-t border-stone-200">
                          <td className="py-3 font-bold">{formatMoney(payout.amount_paise)}</td>
                          <td>
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(payout.status)}`}>
                              {payout.status}
                            </span>
                          </td>
                          <td>{payout.attempts}</td>
                          <td>{payout.bank_account.bank_name} ****{payout.bank_account.last4}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-white/70 p-6 shadow-xl">
              <h2 className="mb-4 font-display text-3xl">Recent ledger</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {dashboard.ledger_entries.map((entry) => (
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
          </>
        )}
      </section>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <div className="rounded-3xl bg-white/75 p-6 shadow-xl backdrop-blur">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500">{title}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
