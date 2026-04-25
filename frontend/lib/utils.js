export function formatMoney(paise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
}

export function statusClass(status) {
  return (
    {
      pending: "bg-amber-100 text-amber-900",
      processing: "bg-sky-100 text-sky-900",
      completed: "bg-emerald-100 text-emerald-900",
      failed: "bg-rose-100 text-rose-900",
    }[status] || "bg-stone-100 text-stone-900"
  );
}