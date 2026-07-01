import { useCallback, useEffect, useState } from "react";
import { WalletBridge } from "./bridge/WalletBridge";
import {
  createQuote,
  decryptUser,
  fetchMenu,
  fetchOrders,
  type Order,
  type Product,
} from "./api";

type Status =
  | { kind: "idle" }
  | { kind: "buying"; productId: string }
  | { kind: "error"; message: string }
  | { kind: "cancelled" }
  | { kind: "bought"; orderId: string };

export function App() {
  const [bridge, setBridge] = useState<WalletBridge | null>(null);
  // The trusted user id: decrypted by our backend from the shell's sealed token.
  const [userId, setUserId] = useState<string>("");
  const [menu, setMenu] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [booting, setBooting] = useState(true);

  const refreshOrders = useCallback(async (userId: string) => {
    try {
      setOrders(await fetchOrders(userId));
    } catch {
      /* history is best-effort */
    }
  }, []);

  // Handshake with the wallet shell (parent window) + load the menu on mount.
  useEffect(() => {
    (async () => {
      try {
        const b = await WalletBridge.init();
        const context = b.getContext();
        setBridge(b);
        // Decrypt the sealed user id via our backend — the trusted identity.
        const trusted = await decryptUser(context.encUserId);
        setUserId(trusted);
        setMenu(await fetchMenu());
        await refreshOrders(trusted);
      } catch (err) {
        setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        setBooting(false);
      }
    })();
  }, [refreshOrders]);

  const buy = async (product: Product) => {
    if (!bridge || !userId) return;
    setStatus({ kind: "buying", productId: product.id });
    try {
      // 1. Ask our service backend for a signed quote with the TRUSTED user id.
      const quote = await createQuote(userId, product.id);
      // 2. Hand it to the wallet shell: it shows the consent screen and, if the
      //    user approves, pays over the session. Returns null on cancel.
      const result = await bridge.pay(quote);
      if (result === null) {
        setStatus({ kind: "cancelled" });
        return;
      }
      if (result.state !== "ORDER_STATE_COMPLETED" && result.state !== "ORDER_STATE_PENDING") {
        throw new Error(`payment ${result.state ?? "failed"}`);
      }
      setStatus({ kind: "bought", orderId: result.orderId });
      // 3. Refresh order history.
      await refreshOrders(userId);
      setTimeout(() => refreshOrders(userId), 2000);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (booting) return <div className="center muted">Connecting to wallet…</div>;

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
          <div className="ok">Order placed! {status.orderId.slice(0, 14)}… — enjoy ☕</div>
        )}

        <section>
          <h2>Menu</h2>
          <div className="catalog">
            {menu.map((p) => (
              <div key={p.id} className="card product">
                <div className="thumb">{p.emoji}</div>
                <div className="strong">{p.title}</div>
                <div className="mono muted">{p.price}</div>
                <button
                  disabled={status.kind === "buying"}
                  onClick={() => buy(p)}
                >
                  {status.kind === "buying" && status.productId === p.id ? "Paying…" : `Buy · ${p.price}`}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="toolbar">
            <h2>Your orders ({orders.length})</h2>
            {userId && (
              <button className="ghost" onClick={() => refreshOrders(userId)}>
                Refresh
              </button>
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
