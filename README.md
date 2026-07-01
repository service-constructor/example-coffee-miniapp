# Service Constructor — Coffee Mini-App

A reference **Service Web App** (white paper §4.1, §13.1) for the
[Service Constructor](../constructor) platform: a tiny "Coffee Shop" that orders
coffee from a fixed menu through the wallet bridge and shows the user's order
history.

It is the sibling of `example-miniapp`, wired to the **Go** backend in
[`coffee-service`](../coffee-service). Together they prove the platform is
language-agnostic: the same bridge + saga flow works whether the service backend
is TypeScript or Go.

Unlike the mock-shell setup, this mini-app is meant to run **inside the cabinet
wallet shell** (an iframe + postMessage bridge). The cabinet lists it
automatically via the platform's public service catalog (`GET /v1/services`).

```
 coffee-miniapp (React)       cabinet shell             platform        coffee-service (Go)
 ┌──────────────┐  quote      ┌──────────────┐  /pay    ┌──────────┐
 │ Menu → bridge│───────────► │ consent (none│────────► │  saga    │──HTTP /execute──►┌────────┐
 │ Orders       │ ◄───────────│ / session)   │ ◄────────│ execute  │ ◄────────────────│ fulfill│
 └──────┬───────┘   order     └──────────────┘   order  └──────────┘                  └────────┘
        │ /quote, /orders, /decrypt-user (proxied via /service → :4100)
        └────────────────────────────────────────────► coffee-service
```

## Run

```sh
npm install
npm run dev      # Vite on :5280, proxies /service/* → coffee-service :4100
```

Then open the **cabinet** and launch "☕ Coffee Shop" from the app list.
The mini-app decrypts the shell's sealed userId via `coffee-service` to get the
trusted identity, requests a signed quote, and pays over the session.
