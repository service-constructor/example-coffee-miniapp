import { useCallback, useEffect, useRef, useState } from "react";
import { WalletBridge } from "./bridge/WalletBridge";
import {
  createQuote,
  decryptUser,
  fetchMenu,
  fetchOrders,
  fetchOrderStatus,
  fetchScenarios,
  type Order,
  type Product,
  type Scenario,
} from "./api";

type Status =
  | { kind: "idle" }
  | { kind: "buying"; productId: string }
  | { kind: "error"; message: string }
  | { kind: "cancelled" }
  | { kind: "bought"; orderId: string; state: string };

interface TrackedOrder {
  orderId: string;
  title: string;
  scenario: string;
  status: string; // DONE | PENDING | NOT_DONE | UNKNOWN
}

export function App() {
  const [bridge, setBridge] = useState<WalletBridge | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [menu, setMenu] = useState<Product[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState<string>("sync-success");
  const [orders, setOrders] = useState<Order[]>([]);
  const [tracked, setTracked] = useState<TrackedOrder[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [booting, setBooting] = useState(true);
  const pollRef = useRef<number | null>(null);

  const refreshOrders = useCallback(async (uid: string) => {
    try {
      setOrders(await fetchOrders(uid));
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const b = await WalletBridge.init();
        const context = b.getContext();
        setBridge(b);
        const trusted = await decryptUser(context.encUserId);
        setUserId(trusted);
        setMenu(await fetchMenu());
        try {
          const sc = await fetchScenarios();
          setScenarios(sc.scenarios);
          setScenario(sc.default);
        } catch {
          /* scenarios optional */
        }
        await refreshOrders(trusted);
      } catch (err) {
        setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        setBooting(false);
      }
    })();
  }, [refreshOrders]);

  useEffect(() => {
    const hasPending = tracked.some((t) => t.status === "PENDING");
    if (!hasPending) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      const updated = await Promise.all(
        tracked.map(async (t) => {
          if (t.status !== "PENDING") return t;
          const s = await fetchOrderStatus(t.orderId);
          return s ? { ...t, status: s.status } : t;
        }),
      );
      setTracked(updated);
      if (userId) refreshOrders(userId);
    }, 1500);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [tracked, userId, refreshOrders]);

  const buy = async (product: Product) => {
    if (!bridge || !userId) return;
    setStatus({ kind: "buying", productId: product.id });
    try {
      const quote = await createQuote(userId, product.id, scenario);
      const result = await bridge.pay(quote);
      if (result === null) {
        setStatus({ kind: "cancelled" });
        return;
      }
      const state = result.state ?? "unknown";
      setStatus({ kind: "bought", orderId: result.orderId, state });
      setTracked((prev) => [
        { orderId: result.orderId, title: product.title, scenario, status: state === "ORDER_STATE_COMPLETED" ? "DONE" : "PENDING" },
        ...prev.filter((t) => t.orderId !== result.orderId),
      ].slice(0, 8));
      await refreshOrders(userId);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (booting) return <div className="center muted">Connecting to wallet…</div>;

  const activeScenarioTitle = scenarios.find((s) => s.id === scenario)?.title ?? scenario;

  return (
    <div className="app">
      <header className="appbar">
        <span className="brand">☕ Coffee Shop</span>
        {userId && <span className="muted">user: {userId}</span>}
      </header>

      <main className="content">
        {status.kind === "error" && <div className="error">{status.message}</div>}
        {status.kind === "cancelled" && <div className="muted">Payment cancelled.</div>}
        {status.kind === "bought" && (
          <div className="ok">
            Order {status.orderId.slice(0, 14)}… → {prettyState(status.state)}
          </div>
        )}

        {scenarios.length > 0 && (
          <section className="card scenario-box">
            <label className="strong" htmlFor="scenario">Saga scenario</label>
            <select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <p className="muted small">{scenarioHint(scenario)}</p>
          </section>
        )}

        <section>
          <h2>Menu</h2>
          <p className="muted small">Scenario: <strong>{activeScenarioTitle}</strong></p>
          <div className="catalog">
            {menu.map((p) => (
              <div key={p.id} className="card product">
                <div className="thumb">{p.emoji}</div>
                <div className="strong">{p.title}</div>
                <div className="mono muted">{p.price}</div>
                <button disabled={status.kind === "buying"} onClick={() => buy(p)}>
                  {status.kind === "buying" && status.productId === p.id ? "Paying…" : `Buy · ${p.price}`}
                </button>
              </div>
            ))}
          </div>
        </section>

        {tracked.length > 0 && (
          <section>
            <h2>Order tracker</h2>
            <div className="tracker">
              {tracked.map((t) => (
                <div key={t.orderId} className="card track-row">
                  <span className={`badge ${badgeClass(t.status)}`}>{t.status}</span>
                  <span className="strong">{t.title}</span>
                  <span className="small muted">{t.scenario}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="toolbar">
            <h2>Your orders ({orders.length})</h2>
            {userId && (
              <button className="ghost" onClick={() => refreshOrders(userId)}>Refresh</button>
            )}
          </div>
          {orders.length === 0 ? (
            <p className="muted">No orders yet. Buy a coffee above.</p>
          ) : (
            <ul className="orders">
              {orders.map((o) => (
                <li key={o.orderId} className="card orderrow">
                  <span className="strong">{o.title ?? o.productId}</span>
                  <span className="mono muted">{o.orderId.slice(0, 14)}…</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function prettyState(state: string): string {
  return state.replace("ORDER_STATE_", "").toLowerCase();
}

function badgeClass(status: string): string {
  if (status === "DONE") return "ok";
  if (status === "NOT_DONE") return "bad";
  if (status === "UNKNOWN") return "warn";
  return "pending";
}

function scenarioHint(id: string): string {
  const hints: Record<string, string> = {
    "sync-success": "Service returns SUCCESS immediately → order COMPLETED.",
    "sync-fail": "Service returns FAILED → funds released (refund).",
    "async-success": "Service parks PENDING, then a signed webhook completes it.",
    "async-fail": "Service parks PENDING, then a webhook fails it → refund.",
    "retry-success": "First attempts 503; the platform retries then succeeds.",
    "retry-exhausted": "Every attempt 503; retries exhausted → refund.",
    "reconcile-done": "PENDING, no webhook; the reconciler queries status=DONE.",
    "reconcile-notdone": "PENDING, no webhook; reconciler queries NOT_DONE → refund.",
    "stuck-unknown": "PENDING, status UNKNOWN; reconciler leaves it for later.",
  };
  return hints[id] ?? "";
}
