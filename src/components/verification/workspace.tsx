"use client";

import { useCallback, useEffect, useState } from "react";

type PendingOrder = {
  id: string;
  orderNo: string;
  targetQuantity: number;
  fabricRollId: string;
  createdAt: string;
  recipe: { recipeCode: string; name: string; category: string };
  createdBy: { fullName: string };
};

type Component = {
  id: string;
  componentName: string;
  piecesPerGarment: number;
  expectedQuantity: number;
  actualQuantity: number | null;
  status: "GREEN" | "YELLOW" | "RED" | null;
};

type Details = {
  id: string;
  orderNo: string;
  targetQuantity: number;
  fabricRollId: string;
  actualFabricYards: string;
  recipe: {
    name: string;
    recipeCode: string;
    standardFabricYards: string;
    wastageCap: string;
    components: Component[];
  };
};

const inputClass = "w-full rounded-lg border border-[#7b8e83] bg-white px-3 py-2.5 text-sm text-[#14231f] shadow-sm focus:border-[#287256] focus:outline-none focus:ring-2 focus:ring-[#287256]/20";
const badgeStyle: Record<string, string> = {
  GREEN: "bg-[#e7f5eb] text-[#205b3b]",
  YELLOW: "bg-[#fff5df] text-[#805b13]",
  RED: "bg-[#fff1ef] text-[#8f2e27]",
  UNCOUNTED: "bg-[#edf0ee] text-[#53645d]",
};

function getStatus(actual: string, expected: number) {
  if (actual.trim() === "") return "UNCOUNTED";
  const count = Number(actual);
  if (!Number.isInteger(count) || count < 0) return "INVALID";
  if (count < expected) return "RED";
  if (count > expected) return "YELLOW";
  return "GREEN";
}

export function VerificationWorkspace() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [details, setDetails] = useState<Details | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refreshOrders = useCallback(async () => {
    const response = await fetch("/api/verification/pending", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not load pending orders.");
    setOrders(payload as PendingOrder[]);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/verification/pending", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load pending orders.");
        return payload as PendingOrder[];
      })
      .then((payload) => { if (active) setOrders(payload); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load pending orders."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    fetch(`/api/verification/${encodeURIComponent(selectedId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load verification details.");
        return payload as Details;
      })
      .then((payload) => {
        if (!active) return;
        setDetails(payload);
        setCounts(Object.fromEntries(payload.recipe.components.map((component) => [component.id, component.actualQuantity === null ? "" : String(component.actualQuantity)])));
        setError("");
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load verification details."); });
    return () => { active = false; };
  }, [selectedId]);

  const componentStatuses = details?.recipe.components.map((component) => ({ component, status: getStatus(counts[component.id] ?? "", component.expectedQuantity) })) ?? [];
  const canApprove = componentStatuses.length > 0 && componentStatuses.every(({ status }) => status === "GREEN" || status === "YELLOW");
  const redCount = componentStatuses.filter(({ status }) => status === "RED").length;
  const invalidCount = componentStatuses.filter(({ status }) => status === "INVALID").length;
  const missingCount = componentStatuses.filter(({ status }) => status === "UNCOUNTED").length;

  async function submitCounts() {
    if (!details) return;
    const body = { counts: componentStatuses.filter(({ status }) => status !== "UNCOUNTED" && status !== "INVALID").map(({ component }) => ({ componentId: component.id, actualQuantity: Number(counts[component.id]) })) };
    const response = await fetch(`/api/verification/${encodeURIComponent(details.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not save component counts.");
  }

  async function approve() {
    if (!details || !canApprove) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await submitCounts();
      const response = await fetch(`/api/verification/${encodeURIComponent(details.id)}/approve`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Approval was blocked.");
      setNotice(`${payload.orderNo} approved. Fabric wastage: ${Number(payload.wastagePercent).toFixed(2)}%.`);
      setSelectedId(""); setDetails(null); setCounts({});
      await refreshOrders();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval was blocked."); }
    finally { setSaving(false); }
  }

  async function reject() {
    if (!details || !reason.trim()) { setError("Enter a rejection reason before rejecting this batch."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await submitCounts();
      const response = await fetch(`/api/verification/${encodeURIComponent(details.id)}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not reject this batch.");
      setNotice(`${payload.orderNo} rejected and returned for re-cutting.`);
      setShowReject(false); setReason(""); setSelectedId(""); setDetails(null); setCounts({});
      await refreshOrders();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reject this batch."); }
    finally { setSaving(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[330px_1fr]">
      <section className="rounded-2xl border border-[#dce4df] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Pending verification</h2>
        <p className="mt-1 text-sm text-[#64726c]">Orders waiting at the QC station.</p>
        {loading ? <p className="mt-6 text-sm text-[#64726c]">Loading orders…</p> : orders.length === 0 ? <p className="mt-6 rounded-lg bg-[#f4f6f5] p-4 text-sm text-[#64726c]">No batches are waiting for verification.</p> : (
          <ul className="mt-4 space-y-2">
            {orders.map((order) => <li key={order.id}>
              <button type="button" onClick={() => { setSelectedId(order.id); setDetails(null); setCounts({}); setError(""); setNotice(""); }} className={`w-full rounded-xl border p-4 text-left transition ${selectedId === order.id ? "border-[#287256] bg-[#edf4ef]" : "border-[#dce4df] hover:border-[#97b5a5]"}`}>
                <span className="flex items-center justify-between gap-2"><strong className="text-sm">{order.orderNo}</strong><span className="rounded-full bg-[#fff5df] px-2 py-1 text-[10px] font-bold text-[#805b13]">PENDING</span></span>
                <span className="mt-2 block text-sm">{order.recipe.name}</span>
                <span className="mt-1 block text-xs text-[#64726c]">{order.targetQuantity} garments · {order.createdBy.fullName}</span>
              </button>
            </li>)}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#dce4df] bg-white p-5 shadow-sm sm:p-7">
        {notice && <p role="status" className="mb-5 rounded-lg border border-[#a7ceb8] bg-[#edf8f0] px-3 py-2 text-sm font-medium text-[#205b3b]">{notice}</p>}
        {error && <p role="alert" className="mb-5 rounded-lg border border-[#e9b7b2] bg-[#fff1ef] px-3 py-2 text-sm font-medium text-[#8f2e27]">{error}</p>}
        {!details ? <div className="grid min-h-80 place-items-center text-center"><div><p className="font-semibold">Select a pending batch</p><p className="mt-1 text-sm text-[#64726c]">Recipe components and counts will appear here.</p></div></div> : <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-bold tracking-[0.16em] text-[#65736c]">{details.recipe.recipeCode} · {details.recipe.name}</p><h2 className="mt-2 text-2xl font-semibold">{details.orderNo}</h2><p className="mt-1 text-sm text-[#64726c]">{details.targetQuantity} garments · Roll {details.fabricRollId}</p></div>
            <div className="rounded-lg bg-[#f4f6f5] px-3 py-2 text-right"><p className="text-[10px] font-bold tracking-wide text-[#65736c]">FABRIC USED</p><p className="mt-1 text-sm font-semibold">{details.actualFabricYards} yds</p></div>
          </div>

          <div className="mt-7 overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-sm">
              <thead><tr className="text-xs font-bold uppercase tracking-wide text-[#65736c]"><th className="border-b border-[#dce4df] py-3 pr-4">Recipe component</th><th className="border-b border-[#dce4df] px-3 py-3">Expected</th><th className="border-b border-[#dce4df] px-3 py-3">Physical count</th><th className="border-b border-[#dce4df] px-3 py-3">Status</th></tr></thead>
              <tbody>{componentStatuses.map(({ component, status }) => <tr key={component.id}>
                <th scope="row" className="border-b border-[#e8eeea] py-4 pr-4 font-semibold">{component.componentName}<span className="mt-1 block text-xs font-normal text-[#65736c]">{component.piecesPerGarment} per garment</span></th>
                <td className="border-b border-[#e8eeea] px-3 py-4 font-semibold tabular-nums">{component.expectedQuantity}</td>
                <td className="border-b border-[#e8eeea] px-3 py-4"><input aria-label={`${component.componentName} physical count`} type="number" min="0" step="1" max="10000000" inputMode="numeric" value={counts[component.id] ?? ""} onChange={(event) => setCounts((current) => ({ ...current, [component.id]: event.target.value }))} className={`${inputClass} max-w-36`} /></td>
                <td className="border-b border-[#e8eeea] px-3 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeStyle[status] ?? "bg-[#fff1ef] text-[#8f2e27]"}`}>{status === "UNCOUNTED" ? "NOT COUNTED" : status}</span></td>
              </tr>)}</tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[#e7f5eb] px-3 py-1.5 font-semibold text-[#205b3b]">{componentStatuses.filter(({ status }) => status === "GREEN").length} GREEN</span>
            <span className="rounded-full bg-[#fff5df] px-3 py-1.5 font-semibold text-[#805b13]">{componentStatuses.filter(({ status }) => status === "YELLOW").length} YELLOW</span>
            <span className="rounded-full bg-[#fff1ef] px-3 py-1.5 font-semibold text-[#8f2e27]">{redCount} RED</span>
            {missingCount > 0 && <span className="rounded-full bg-[#edf0ee] px-3 py-1.5 font-semibold text-[#53645d]">{missingCount} NOT COUNTED</span>}
            {invalidCount > 0 && <span className="rounded-full bg-[#fff1ef] px-3 py-1.5 font-semibold text-[#8f2e27]">{invalidCount} INVALID COUNT</span>}
          </div>
          {(redCount > 0 || missingCount > 0 || invalidCount > 0) && <p className="mt-4 rounded-lg border border-[#f0d596] bg-[#fff9e9] px-3 py-2 text-sm text-[#70520f]">Approval is disabled until every component is counted with a valid quantity and no shortages remain.</p>}

          <div className="mt-6 flex flex-wrap gap-3 border-t border-[#e8eeea] pt-5">
            <button type="button" disabled={!canApprove || saving} onClick={() => void approve()} className="rounded-lg bg-[#164e3b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#103d2e] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Processing…" : "Approve batch"}</button>
            <button type="button" disabled={saving} onClick={() => { setShowReject(true); setError(""); }} className="rounded-lg border border-[#a5473f] px-5 py-3 text-sm font-semibold text-[#8f2e27] hover:bg-[#fff1ef] disabled:cursor-not-allowed disabled:opacity-50">Reject batch</button>
          </div>
        </>}
      </section>

      {showReject && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10211b]/55 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="reject-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <h2 id="reject-title" className="text-xl font-semibold">Reject batch</h2>
          <p className="mt-2 text-sm leading-6 text-[#64726c]">A clear reason is required and will be recorded in the verification audit.</p>
          <label htmlFor="reason" className="mt-5 block text-sm font-semibold">Rejection reason</label>
          <textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} className={`${inputClass} resize-y`} placeholder="Describe the shortage or defect" />
          <div className="mt-5 flex justify-end gap-3"><button type="button" disabled={saving} onClick={() => setShowReject(false)} className="rounded-lg border border-[#b9c7bf] px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" disabled={saving || !reason.trim()} onClick={() => void reject()} className="rounded-lg bg-[#8f2e27] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Rejecting…" : "Confirm rejection"}</button></div>
        </section>
      </div>}
    </div>
  );
}
