// Calls to the coffee-service backend (via the /service proxy): get a signed
// quote, list the menu, and list the user's past orders.
import type { Quote } from "./bridge/WalletBridge";

const SERVICE_BASE = "/service";

// decryptUser sends the shell's encrypted user id to our backend, which decrypts
// it with the service private key and returns the trusted user id. This is the
// identity the mini-app relies on (the plaintext ctx.userId is only a hint).
export async function decryptUser(encUserId: string): Promise<string> {
  const res = await fetch(`${SERVICE_BASE}/decrypt-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encUserId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `decrypt failed: ${res.status}`);
  return (data as { userId: string }).userId;
}

export interface Product {
  id: string;
  title: string;
  emoji: string;
  price: string;
  currencyId: number;
}

// The coffee shop exposes its full menu (with prices) via /menu.
export async function fetchMenu(): Promise<Product[]> {
  const res = await fetch(`${SERVICE_BASE}/menu`);
  if (!res.ok) throw new Error(`menu failed: ${res.status}`);
  const data = await res.json();
  return (data.menu as Product[]) ?? [];
}

export interface Scenario {
  id: string;
  title: string;
}

// The service publishes the saga demo scenarios it supports.
export async function fetchScenarios(): Promise<{ scenarios: Scenario[]; default: string }> {
  const res = await fetch(`${SERVICE_BASE}/scenarios`);
  if (!res.ok) throw new Error(`scenarios failed: ${res.status}`);
  return res.json();
}

export async function createQuote(userId: string, productId: string, scenario: string): Promise<Quote> {
  const res = await fetch(`${SERVICE_BASE}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, productId, scenario }),
  });
  if (!res.ok) throw new Error(`quote failed: ${res.status}`);
  const data = await res.json();
  return data.quote as Quote;
}

// Poll the SERVICE's own delivery status (DONE / PENDING / NOT_DONE / UNKNOWN)
// to watch async/reconcile transitions — no auth needed.
export interface DeliveryStatus {
  status: string;
  externalRef?: string;
}

export async function fetchOrderStatus(orderId: string): Promise<DeliveryStatus | null> {
  const res = await fetch(`${SERVICE_BASE}/status/${encodeURIComponent(orderId)}`);
  if (!res.ok) return null;
  return res.json();
}

export interface Order {
  orderId: string;
  productId?: string;
  title?: string;
  externalRef?: string;
  createdAt: number;
}

export async function fetchOrders(userId: string): Promise<Order[]> {
  const res = await fetch(`${SERVICE_BASE}/orders?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`orders failed: ${res.status}`);
  const data = await res.json();
  return (data.orders as Order[]) ?? [];
}
