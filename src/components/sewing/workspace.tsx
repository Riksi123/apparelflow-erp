"use client";

import { useCallback, useEffect, useState } from "react";

type QueueOrder = {
  id: string;
  orderNo: string;
  targetQuantity: number;
  fabricRollId: string;
  actualFabricYards: string;
  createdAt: string;
  updatedAt: string;
  recipe: { recipeCode: string; name: string; category: string; standardFabricYards: string; wastageCap: string };
  createdBy: { fullName: string };
  verificationItems: {
    expectedQuantity: number;
    actualQuantity: number | null;
    status: string | null;
    component: { componentName: string; piecesPerGarment: number };
  }[];
  verificationLogs: {
    id: string;
    verifierId: string;
    decision: string;
    componentVariances: unknown;
    wastagePercent: string | null;
    createdAt: string;
    verifier: { fullName: string; email: string };
  }[];
};

type Variance = { componentId: string; expectedQuantity: number; actualQuantity: number; variance: number; status: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function readVariances(value: unknown): Variance[] {
  return Array.isArray(value) ? value as Variance[] : [];
}

export function SewingWorkspace() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/sewing/queue", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not load the verified sewing queue.");
    setOrders(payload as QueueOrder[]);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/sewing/queue", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load the verified sewing queue.");
        return payload as QueueOrder[];
      })
      .then((payload) => { if (active) setOrders(payload); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load queue."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selected = orders.find((order) => order.id === selectedId) ?? null;

  async function beginSewing(order: QueueOrder) {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/sewing/${encodeURIComponent(order.id)}/start`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not start sewing.");
      setNotice(`${payload.orderNo} started sewing assembly.`);
      setSelectedId("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start sewing."); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {error && <p role="alert" className="mb-5 rounded-lg border border-[#e9b7b2] bg-[#fff1ef] px-3 py-2 text-sm font-medium text-[#8f2e27]">{error}</p>}
      {notice && <p role="status" className="mb-5 rounded-lg border border-[#a7ceb8] bg-[#edf8f0] px-3 py-2 text-sm font-medium text-[#205b3b]">{notice}</p>}
      {loading ? <div className="rounded-2xl border border-[#dce4df] bg-white p-8 text-sm text-[#64726c]">Loading verified batches…</div> : orders.length === 0 ? (
        <div className="rounded-2xl border border-[#dce4df] bg-white px-6 py-16 text-center shadow-sm"><p className="text-lg font-semibold">The queue is clear</p><p className="mt-2 text-sm text-[#64726c]">Approved batches will appear here after verifier sign-off.</p></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-[#dce4df] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Ready for sewing</h2><p className="mt-1 text-sm text-[#64726c]">Verified batches only</p></div><span className="rounded-full bg-[#e7f5eb] px-3 py-1.5 text-xs font-bold text-[#205b3b]">{orders.length} VERIFIED</span></div>
            <ul className="mt-5 space-y-3">{orders.map((order) => <li key={order.id}>
              <button type="button" onClick={() => { setSelectedId(order.id); setError(""); setNotice(""); }} className={`w-full rounded-xl border p-4 text-left transition ${selectedId === order.id ? "border-[#287256] bg-[#edf4ef]" : "border-[#dce4df] hover:border-[#97b5a5]"}`}>
                <span className="flex items-center justify-between gap-2"><strong>{order.orderNo}</strong><span className="rounded-full bg-[#e7f5eb] px-2.5 py-1 text-[10px] font-bold text-[#205b3b]">VERIFIED</span></span>
                <span className="mt-2 block text-sm">{order.recipe.name} · {order.recipe.recipeCode}</span>
                <span className="mt-1 block text-xs text-[#64726c]">{order.targetQuantity} garments · Roll {order.fabricRollId}</span>
              </button>
            </li>)}</ul>
          </section>

          <section className="rounded-2xl border border-[#dce4df] bg-white p-5 shadow-sm sm:p-7">
            {!selected ? <div className="grid min-h-72 place-items-center text-center"><div><p className="font-semibold">Select a verified batch</p><p className="mt-1 text-sm text-[#64726c]">Review its component counts and approval audit.</p></div></div> : <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-bold tracking-[0.16em] text-[#718079]">{selected.recipe.recipeCode} · {selected.recipe.category}</p><h2 className="mt-2 text-2xl font-semibold">{selected.orderNo}</h2><p className="mt-1 text-sm text-[#64726c]">{selected.recipe.name} · {selected.targetQuantity} garments</p></div>
                <span className="rounded-full bg-[#e7f5eb] px-3 py-1.5 text-xs font-bold text-[#205b3b]">VERIFIED</span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-[#f4f6f5] p-4"><p className="text-[10px] font-bold tracking-wide text-[#718079]">FABRIC ROLL</p><p className="mt-1 text-sm font-semibold">{selected.fabricRollId}</p></div>
                <div className="rounded-lg bg-[#f4f6f5] p-4"><p className="text-[10px] font-bold tracking-wide text-[#718079]">FABRIC USAGE</p><p className="mt-1 text-sm font-semibold">{selected.actualFabricYards} yds actual</p><p className="text-xs text-[#64726c]">{(selected.targetQuantity * Number(selected.recipe.standardFabricYards)).toFixed(2)} yds expected</p></div>
              </div>

              <div className="mt-6"><h3 className="text-sm font-semibold">Verified component counts</h3><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[430px] text-left text-sm"><thead><tr className="text-xs uppercase tracking-wide text-[#718079]"><th className="border-b border-[#dce4df] py-2 pr-3">Component</th><th className="border-b border-[#dce4df] px-3 py-2">Expected</th><th className="border-b border-[#dce4df] px-3 py-2">Counted</th><th className="border-b border-[#dce4df] px-3 py-2">Result</th></tr></thead><tbody>{selected.verificationItems.map((item) => <tr key={item.component.componentName}><th className="border-b border-[#e8eeea] py-3 pr-3 font-medium">{item.component.componentName}</th><td className="border-b border-[#e8eeea] px-3 py-3 tabular-nums">{item.expectedQuantity}</td><td className="border-b border-[#e8eeea] px-3 py-3 tabular-nums">{item.actualQuantity}</td><td className="border-b border-[#e8eeea] px-3 py-3"><span className="rounded-full bg-[#e7f5eb] px-2 py-1 text-[10px] font-bold text-[#205b3b]">{item.status}</span></td></tr>)}</tbody></table></div></div>

              <div className="mt-6 rounded-xl border border-[#dce4df] p-4">
                <h3 className="text-sm font-semibold">Verification audit</h3>
                {selected.verificationLogs[0] ? (() => {
                  const audit = selected.verificationLogs[0];
                  const wastage = Number(audit.wastagePercent ?? 0);
                  const variances = readVariances(audit.componentVariances);
                  return <div className="mt-3 text-sm"><p>Verified by <strong>{audit.verifier.fullName}</strong></p><p className="mt-1 text-xs text-[#64726c]">{audit.verifier.email} · {formatDate(audit.createdAt)}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-[#f4f6f5] p-3"><p className="text-[10px] font-bold tracking-wide text-[#718079]">FABRIC WASTAGE</p><p className="mt-1 text-lg font-semibold tabular-nums">{wastage.toFixed(2)}%</p><p className="text-xs text-[#64726c]">Recipe cap {selected.recipe.wastageCap}%</p></div><div className="rounded-lg bg-[#f4f6f5] p-3"><p className="text-[10px] font-bold tracking-wide text-[#718079]">AUDIT VARIANCES</p><p className="mt-1 text-sm font-semibold">{variances.filter((entry) => entry.variance !== 0).length} components with variance</p></div></div></div>;
                })() : <p className="mt-2 text-sm text-[#8f2e27]">Approval audit unavailable. Contact an administrator.</p>}
              </div>

              <button type="button" disabled={saving || selected.verificationLogs.length === 0} onClick={() => void beginSewing(selected)} className="mt-6 rounded-lg bg-[#164e3b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#103d2e] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Starting assembly…" : "Start sewing assembly"}</button>
            </>}
          </section>
        </div>
      )}
    </div>
  );
}
