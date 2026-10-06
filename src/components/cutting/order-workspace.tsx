"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type Recipe = {
  id: string;
  recipeCode: string;
  name: string;
  category: string;
  standardFabricYards: string;
  wastageCap: string;
  components: { componentName: string; piecesPerGarment: number }[];
};

type CuttingOrder = {
  id: string;
  orderNo: string;
  targetQuantity: number;
  fabricRollId: string;
  actualFabricYards: string;
  status: string;
  createdAt: string;
  recipe: { recipeCode: string; name: string; category?: string };
  verificationLogs?: { rejectionNote: string | null; createdAt: string; verifier: { fullName: string } }[];
  _count?: { verificationItems: number };
};

const fieldClass = "mt-2 w-full rounded-lg border border-[#aab8b0] bg-white px-3 py-3 text-sm text-[#14231f] shadow-sm focus:border-[#287256] focus:outline-none focus:ring-2 focus:ring-[#287256]/20";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CuttingOrderWorkspace() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [orders, setOrders] = useState<CuttingOrder[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [fabricRollId, setFabricRollId] = useState("");
  const [actualFabricYards, setActualFabricYards] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recutInputs, setRecutInputs] = useState<Record<string, { fabricRollId: string; actualFabricYards: string }>>({});
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const recipe = recipes.find((item) => item.id === recipeId);
  const quantity = Number(targetQuantity);
  const expectedFabric = recipe && Number.isInteger(quantity) && quantity > 0
    ? Number(recipe.standardFabricYards) * quantity
    : null;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/recipes", { cache: "no-store" }),
      fetch("/api/cutting-orders", { cache: "no-store" }),
    ])
      .then(async ([recipeResponse, orderResponse]) => {
        if (!recipeResponse.ok || !orderResponse.ok) throw new Error("Unable to load production data. Please refresh or sign in again.");
        return Promise.all([recipeResponse.json(), orderResponse.json()]);
      })
      .then(([recipeData, orderData]) => {
        if (!active) return;
        setRecipes(recipeData as Recipe[]);
        setOrders(orderData as CuttingOrder[]);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load production data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const componentPreview = useMemo(() => {
    if (!recipe || !Number.isInteger(quantity) || quantity < 1) return [];
    return recipe.components.map((component) => ({
      ...component,
      expected: component.piecesPerGarment * quantity,
    }));
  }, [recipe, quantity]);

  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const parsedQuantity = Number(targetQuantity);
    const fabricYards = Number(actualFabricYards);
    if (!recipeId) return setError("Choose a production recipe.");
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 100_000) return setError("Target quantity must be a whole number between 1 and 100,000.");
    if (!fabricRollId.trim()) return setError("Enter the fabric roll ID.");
    if (!Number.isFinite(fabricYards) || fabricYards <= 0) return setError("Actual fabric used must be a positive number of yards.");

    startTransition(async () => {
      try {
        const response = await fetch("/api/cutting-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId, targetQuantity: parsedQuantity, fabricRollId: fabricRollId.trim(), actualFabricYards: fabricYards }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not create this order.");
        setOrders((current) => [payload as CuttingOrder, ...current]);
        setSuccess(`Order ${payload.orderNo} was sent to verification.`);
        setTargetQuantity("");
        setFabricRollId("");
        setActualFabricYards("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not create this order.");
      }
    });
  }

  function beginOrderRecut(event: React.FormEvent<HTMLFormElement>, order: CuttingOrder) {
    event.preventDefault();
    const values = recutInputs[order.id] ?? { fabricRollId: order.fabricRollId, actualFabricYards: order.actualFabricYards };
    const yards = Number(values.actualFabricYards);
    if (!values.fabricRollId.trim() || !Number.isFinite(yards) || yards <= 0) {
      setError("Enter a fabric roll ID and positive actual fabric quantity for the re-cut.");
      return;
    }
    setError(""); setSuccess("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/cutting-orders/${encodeURIComponent(order.id)}/recut`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fabricRollId: values.fabricRollId.trim(), actualFabricYards: yards }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not start re-cutting.");
        setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: payload.status, fabricRollId: values.fabricRollId.trim(), actualFabricYards: String(yards) } : item));
        setSuccess(`${order.orderNo} returned to cutting. Submit it for verification when the re-cut is complete.`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start re-cutting."); }
    });
  }

  function submitCompletedRecut(order: CuttingOrder) {
    setError(""); setSuccess("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/cutting-orders/${encodeURIComponent(order.id)}/submit`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not submit the re-cut batch.");
        setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: payload.status } : item));
        setSuccess(`${order.orderNo} was sent back to verification.`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit the re-cut batch."); }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-2xl border border-[#dce4df] bg-white p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-xl font-semibold">Create cutting order</h2>
          <p className="mt-1 text-sm text-[#64726c]">Recipe quantities are derived on the server.</p>
        </div>
        <form onSubmit={submitOrder} className="mt-6 space-y-4">
          <div>
            <label htmlFor="recipe" className="text-sm font-semibold">Production recipe</label>
            <select id="recipe" value={recipeId} onChange={(event) => setRecipeId(event.target.value)} className={fieldClass} required>
              <option value="">Select a recipe</option>
              {recipes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.recipeCode}</option>)}
            </select>
          </div>
          {recipe && <div className="rounded-lg bg-[#f4f6f5] p-3 text-xs leading-5 text-[#53645d]">
            <div className="flex justify-between gap-4"><span>Standard fabric per piece</span><strong>{recipe.standardFabricYards} yds</strong></div>
            <div className="mt-1 flex justify-between gap-4"><span>Wastage cap</span><strong>{recipe.wastageCap}%</strong></div>
            {expectedFabric !== null && <div className="mt-1 flex justify-between gap-4 border-t border-[#dce4df] pt-1"><span>Expected fabric for batch</span><strong>{expectedFabric.toFixed(2)} yds</strong></div>}
          </div>}
          <div>
            <label htmlFor="quantity" className="text-sm font-semibold">Target batch quantity <span className="font-normal text-[#718079]">(garments)</span></label>
            <input id="quantity" type="number" inputMode="numeric" min="1" max="100000" step="1" value={targetQuantity} onChange={(event) => setTargetQuantity(event.target.value)} className={fieldClass} required />
          </div>
          <div>
            <label htmlFor="roll" className="text-sm font-semibold">Fabric roll ID</label>
            <input id="roll" type="text" maxLength={80} value={fabricRollId} onChange={(event) => setFabricRollId(event.target.value)} className={fieldClass} placeholder="e.g. FAB-ROLL-882" required />
          </div>
          <div>
            <label htmlFor="yards" className="text-sm font-semibold">Actual fabric used <span className="font-normal text-[#718079]">(yards)</span></label>
            <input id="yards" type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" value={actualFabricYards} onChange={(event) => setActualFabricYards(event.target.value)} className={fieldClass} required />
          </div>
          {componentPreview.length > 0 && <div className="rounded-lg border border-[#dce4df] p-3">
            <p className="text-xs font-bold tracking-wide text-[#53645d]">SERVER CALCULATED COMPONENT PLAN</p>
            <ul className="mt-2 space-y-1.5 text-xs text-[#53645d]">
              {componentPreview.map((component) => <li key={component.componentName} className="flex justify-between gap-3"><span>{component.componentName} · {component.piecesPerGarment}/garment</span><strong>{component.expected}</strong></li>)}
            </ul>
          </div>}
          {error && <p role="alert" className="rounded-lg border border-[#e9b7b2] bg-[#fff1ef] px-3 py-2 text-sm font-medium text-[#8f2e27]">{error}</p>}
          {success && <p role="status" className="rounded-lg border border-[#a7ceb8] bg-[#edf8f0] px-3 py-2 text-sm font-medium text-[#205b3b]">{success}</p>}
          <button type="submit" disabled={pending || loading || recipes.length === 0} className="w-full rounded-lg bg-[#164e3b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#103d2e] disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? "Creating order…" : "Create and send to verification"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[#dce4df] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold">My cutting orders</h2><p className="mt-1 text-sm text-[#64726c]">Orders persist in the production database.</p></div>
          <span className="rounded-full bg-[#edf4ef] px-3 py-1.5 text-xs font-bold text-[#287256]">{orders.length} orders</span>
        </div>
        {loading ? <p className="mt-8 text-sm text-[#64726c]">Loading cutting orders…</p> : orders.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-[#cbd7d0] px-5 py-12 text-center">
            <p className="font-semibold">No orders yet</p><p className="mt-1 text-sm text-[#64726c]">Create an order to send a batch to verification.</p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-[#e8eeea]">
            {orders.map((order) => <li key={order.id} className="py-4 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold">{order.orderNo}</p><p className="mt-1 text-sm text-[#64726c]">{order.recipe.name} · {order.recipe.recipeCode}</p></div>
                <span className="rounded-full bg-[#fff5df] px-2.5 py-1 text-[11px] font-bold text-[#805b13]">{order.status.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#64726c] sm:grid-cols-3">
                <span>Batch <strong className="text-[#34453e]">{order.targetQuantity}</strong></span>
                <span>Fabric roll <strong className="text-[#34453e]">{order.fabricRollId}</strong></span>
                <span>{order.actualFabricYards} yds</span>
              </div>
              <p className="mt-2 text-[11px] text-[#8a9891]">Created {formatDate(order.createdAt)}</p>
              {order.status === "REJECTED" && order.verificationLogs?.[0] && <p className="mt-3 rounded-lg border border-[#e9b7b2] bg-[#fff1ef] px-3 py-2 text-xs leading-5 text-[#8f2e27]"><strong>Verifier feedback ({order.verificationLogs[0].verifier.fullName}):</strong> {order.verificationLogs[0].rejectionNote}</p>}
              {order.status === "REJECTED" && <form onSubmit={(event) => beginOrderRecut(event, order)} className="mt-4 rounded-xl border border-[#f0d596] bg-[#fff9e9] p-4">
                <p className="text-sm font-semibold text-[#70520f]">Returned for re-cutting</p>
                <p className="mt-1 text-xs text-[#70520f]">The rejection audit is retained. Enter fabric usage for the re-cut.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor={`recut-roll-${order.id}`} className="text-xs font-semibold">Fabric roll ID</label><input id={`recut-roll-${order.id}`} required maxLength={80} value={(recutInputs[order.id] ?? { fabricRollId: order.fabricRollId, actualFabricYards: order.actualFabricYards }).fabricRollId} onChange={(event) => setRecutInputs((current) => ({ ...current, [order.id]: { ...(current[order.id] ?? { fabricRollId: order.fabricRollId, actualFabricYards: order.actualFabricYards }), fabricRollId: event.target.value } }))} className={fieldClass} /></div>
                  <div><label htmlFor={`recut-yards-${order.id}`} className="text-xs font-semibold">Actual fabric used (yards)</label><input id={`recut-yards-${order.id}`} type="number" required min="0.001" max="1000000" step="0.001" value={(recutInputs[order.id] ?? { fabricRollId: order.fabricRollId, actualFabricYards: order.actualFabricYards }).actualFabricYards} onChange={(event) => setRecutInputs((current) => ({ ...current, [order.id]: { ...(current[order.id] ?? { fabricRollId: order.fabricRollId, actualFabricYards: order.actualFabricYards }), actualFabricYards: event.target.value } }))} className={fieldClass} /></div>
                </div>
                <button type="submit" disabled={pending} className="mt-3 rounded-lg border border-[#805b13] px-3 py-2 text-xs font-semibold text-[#70520f] hover:bg-[#fff1cf] disabled:opacity-50">Begin re-cutting</button>
              </form>}
              {order.status === "CUTTING_IN_PROGRESS" && <div className="mt-4 rounded-xl border border-[#dce4df] bg-[#f4f6f5] p-4"><p className="text-sm font-semibold">Re-cut in progress</p><p className="mt-1 text-xs text-[#64726c]">After the replacement bundle is complete, return it to the verifier.</p><button type="button" disabled={pending} onClick={() => submitCompletedRecut(order)} className="mt-3 rounded-lg bg-[#164e3b] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Submit re-cut to verification</button></div>}
            </li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
