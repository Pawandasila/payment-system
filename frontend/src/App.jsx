import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./main.css";

import LedgerList from "../layout/components/LedgerList.jsx";
import HeaderBar from "../layout/components/HeaderBar.jsx";
import PayoutForm from "../layout/components/PayoutForm.jsx";
import PayoutHistoryTable from "../layout/components/PayoutHistoryTable.jsx";
import Alert from "../layout/ui/Alert.jsx";
import EmptyState from "../layout/ui/EmptyState.jsx";
import ErrorToast from "../layout/ui/ErrorToast.jsx";
import LoadingState from "../layout/ui/LoadingState.jsx";
import StatCard from "../layout/ui/StatCard.jsx";
import { extractErrorMessage, safeJson } from "../lib/http.js";
import { formatMoney } from "../lib/utils.js";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

function App() {
  const [merchants, setMerchants] = useState([]);
  const [merchantId, setMerchantId] = useState(localStorage.getItem("merchantId") || "");
  const [isMerchantsLoading, setIsMerchantsLoading] = useState(false);
  const [merchantsError, setMerchantsError] = useState("");

  const [dashboard, setDashboard] = useState(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [isDashboardRefreshing, setIsDashboardRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState("info");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [errorToast, setErrorToast] = useState({ visible: false, message: "", id: 0 });

  const bankAccounts = useMemo(() => dashboard?.bank_accounts || [], [dashboard]);
  const payouts = useMemo(() => dashboard?.payouts || [], [dashboard]);
  const ledgerEntries = useMemo(() => dashboard?.ledger_entries || [], [dashboard]);
  const availablePaise = useMemo(() => dashboard?.balance?.available_paise ?? 0, [dashboard]);

  const loadMerchants = useCallback(async () => {
    setIsMerchantsLoading(true);
    setMerchantsError("");

    try {
      const response = await fetch(`${API}/merchants`);
      const payload = await safeJson(response);
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, `Could not load merchants (${response.status}).`));
      }

      const list = Array.isArray(payload) ? payload : [];
      setMerchants(list);
      setMerchantId((current) => {
        if (current) return current;
        if (list[0]?.id) {
          localStorage.setItem("merchantId", list[0].id);
          return list[0].id;
        }
        return "";
      });
    } catch (error) {
      setMerchantsError(error.message || "Could not load merchants.");
    } finally {
      setIsMerchantsLoading(false);
    }
  }, []);

  const triggerDashboardRefresh = useCallback(() => {
    setDashboardRefreshKey((value) => value + 1);
  }, []);

  const showErrorToast = useCallback((nextMessage) => {
    if (!nextMessage) return;
    setErrorToast({ visible: true, message: nextMessage, id: Date.now() });
  }, []);

  const dismissErrorToast = useCallback(() => {
    setErrorToast((current) => ({ ...current, visible: false }));
  }, []);

  const handleMerchantChange = useCallback((nextMerchantId) => {
    setMerchantId(nextMerchantId);
    setMessage("");
    setDashboard(null);
    setBankAccountId("");
  }, []);

  useEffect(() => {
    loadMerchants();
  }, [loadMerchants]);

  useEffect(() => {
    if (merchantsError) showErrorToast(merchantsError);
  }, [merchantsError, showErrorToast]);

  useEffect(() => {
    if (dashboardError) showErrorToast(dashboardError);
  }, [dashboardError, showErrorToast]);

  useEffect(() => {
    if (messageKind === "error" && message) showErrorToast(message);
  }, [message, messageKind, showErrorToast]);

  useEffect(() => {
    if (!errorToast.visible) return;
    const timer = setTimeout(() => {
      setErrorToast((current) => ({ ...current, visible: false }));
    }, 4500);
    return () => clearTimeout(timer);
  }, [errorToast.id, errorToast.visible]);

  useEffect(() => {
    if (!merchantId) return;
    localStorage.setItem("merchantId", merchantId);
  }, [merchantId]);

  useEffect(() => {
    if (!merchantId) {
      setDashboard(null);
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const loadDashboard = async ({ silent = false } = {}) => {
      if (cancelled || inFlight) return;
      inFlight = true;

      if (silent) {
        setIsDashboardRefreshing(true);
      } else {
        setIsDashboardLoading(true);
      }

      try {
        const response = await fetch(`${API}/dashboard`, {
          headers: { "X-Merchant-Id": merchantId },
        });
        const payload = await safeJson(response);
        if (!response.ok) {
          throw new Error(extractErrorMessage(payload, `Could not load dashboard (${response.status}).`));
        }

        if (cancelled) return;

        setDashboard(payload);
        setDashboardError("");
        setLastUpdatedAt(new Date());
        setBankAccountId((current) => current || payload?.bank_accounts?.[0]?.id || "");
      } catch (error) {
        if (cancelled) return;
        setDashboardError(error.message || "Could not load dashboard.");
      } finally {
        if (!cancelled) {
          setIsDashboardLoading(false);
          setIsDashboardRefreshing(false);
        }
        inFlight = false;
      }
    };

    loadDashboard();
    const timer = setInterval(() => loadDashboard({ silent: true }), 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [merchantId, dashboardRefreshKey]);

  const requestPayout = useCallback(
    async (event) => {
      event.preventDefault();
      setMessage("");
      setMessageKind("info");

      if (!merchantId) {
        setMessageKind("error");
        setMessage("Choose a merchant before requesting a payout.");
        return;
      }

      if (!bankAccountId) {
        setMessageKind("error");
        setMessage("Choose a bank account before requesting a payout.");
        return;
      }

      const amountNumber = Number(amount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        setMessageKind("error");
        setMessage("Enter a valid amount greater than 0.");
        return;
      }

      const amountPaise = Math.round(amountNumber * 100);
      if (amountPaise > availablePaise) {
        setMessageKind("error");
        setMessage("Insufficient available balance.");
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await fetch(`${API}/payouts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Merchant-Id": merchantId,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            amount_paise: amountPaise,
            bank_account_id: bankAccountId,
          }),
        });

        const data = await safeJson(response);

        if (response.ok) {
          setMessageKind("success");
          setMessage(`Payout ${data?.id || ""} created.`.trim());
          setAmount("");
          triggerDashboardRefresh();
          return;
        }

        setMessageKind("error");
        setMessage(extractErrorMessage(data, `Payout failed (${response.status}).`));
      } catch {
        setMessageKind("error");
        setMessage("Could not reach the payout API. Check backend status and network/CORS settings.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [amount, availablePaise, bankAccountId, merchantId, triggerDashboardRefresh],
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,#f7d87c,transparent_28%),linear-gradient(135deg,#f4efe5,#dce8d2)] px-5 py-8">
      <ErrorToast message={errorToast.message} visible={errorToast.visible} onClose={dismissErrorToast} />
      <section className="mx-auto max-w-6xl">
        <HeaderBar
          merchantId={merchantId}
          merchants={merchants}
          isMerchantsLoading={isMerchantsLoading}
          onMerchantChange={handleMerchantChange}
        />

        {merchantsError && (
          <Alert kind="error" actionLabel="Retry" onAction={loadMerchants}>
            {merchantsError}
          </Alert>
        )}

        {dashboardError && (
          <div className="mb-5">
            <Alert kind="error" actionLabel="Retry" onAction={triggerDashboardRefresh}>
              {dashboardError}
            </Alert>
          </div>
        )}

        {isDashboardLoading && !dashboard && <LoadingState />}

        {!isDashboardLoading && !dashboard && !dashboardError && (
          <EmptyState
            title="No dashboard data yet"
            description="Choose a merchant to load balances, payouts, and ledger entries."
          />
        )}

        {dashboard && (
          <>
            <div className="mb-4 flex items-center justify-end gap-2 text-xs text-stone-600">
              {isDashboardRefreshing && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-600" />}
              {lastUpdatedAt && <span>Updated at {lastUpdatedAt.toLocaleTimeString()}</span>}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <StatCard title="Available" value={formatMoney(dashboard.balance.available_paise)} />
              <StatCard title="Held" value={formatMoney(dashboard.balance.held_paise)} />
              <StatCard title="Recent payouts" value={payouts.length} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
              <PayoutForm
                amount={amount}
                bankAccountId={bankAccountId}
                bankAccounts={bankAccounts}
                isSubmitting={isSubmitting}
                message={message}
                messageKind={messageKind}
                onAmountChange={setAmount}
                onBankAccountChange={setBankAccountId}
                onSubmit={requestPayout}
              />

              <PayoutHistoryTable payouts={payouts} />
            </div>

            <LedgerList entries={ledgerEntries} />
          </>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
