# Daytrading Bot — Binance Spot (Testnet & Paper-Trading)

Monorepo für einen automatisierten Binance-Spot-Trading-Bot mit Web-Dashboard.

> ⚠️ **Wichtiger Hinweis:** Dieses System handelt ausschließlich auf dem **Binance Spot Testnet**
> oder im **Paper-Trading-Modus**. Es wird kein echtes Geld eingesetzt. **Live-Trading ist im
> aktuellen Release nicht implementiert und nicht aktivierbar.** Diese Software garantiert keine
> Gewinne — siehe [RISK_DISCLOSURE.md](./RISK_DISCLOSURE.md).

## Architektur

```
┌─────────────┐     Commands (INSERT)      ┌──────────────────┐
│  Dashboard   │ ─────────────────────────▶ │    Supabase       │
│  (Next.js,   │ ◀───────────────────────── │  PostgreSQL + RLS │
│   Vercel)    │     Daten (SELECT, RLS)    └──────────────────┘
└─────────────┘                                   ▲   │ Poll commands,
                                                  │   ▼ persist state
                                            ┌──────────────────┐      ┌──────────┐
                                            │      Worker       │ ◀──▶ │ Binance  │
                                            │ (Node.js, Railway)│ WS/REST│ Testnet │
                                            └──────────────────┘      └──────────┘
```

- Das Dashboard startet den Worker **nie** direkt. Es schreibt Commands in `system_commands`;
  der Worker pollt und verarbeitet sie transaktionssicher.
- Binance-Credentials existieren **nur** im Worker (Railway-Environment). Das Frontend kennt
  keinerlei Secrets.

## Struktur

```
apps/
  dashboard/      Next.js 15 (App Router) + Tailwind + shadcn/ui-Stil + Supabase Auth
  worker/         Node.js-Worker: Engine, Strategie, Broker, Health-Check
packages/
  shared/         Gemeinsame Typen, Zod-Schemas, Konstanten
supabase/
  migrations/     SQL-Migrationen inkl. Row Level Security
```

## Voraussetzungen

- Node.js ≥ 20 (empfohlen 22)
- pnpm ≥ 9 (`corepack enable`)
- Ein [Supabase](https://supabase.com)-Projekt (Free Tier reicht)
- Optional: Binance-Spot-Testnet-Keys von <https://testnet.binance.vision>

## Installation

```bash
git clone <repo-url>
cd Daytrading
pnpm install

# Shared-Package bauen (nötig für den Worker)
pnpm --filter @daytrading/shared build
```

## Datenbank einrichten

Migrationen liegen in `supabase/migrations/`. Zwei Wege:

**A) Supabase CLI (empfohlen):**

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

**B) SQL-Editor:** Inhalt von `0001_initial_schema.sql` und danach
`0002_row_level_security.sql` im Supabase-SQL-Editor ausführen.

## Environment konfigurieren

```bash
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/worker/.env.example apps/worker/.env
# Werte eintragen — niemals committen!
```

| App       | Variable                                 | Beschreibung                                        |
| --------- | ---------------------------------------- | --------------------------------------------------- |
| Dashboard | `NEXT_PUBLIC_SUPABASE_URL`               | Supabase-Projekt-URL                                |
| Dashboard | `NEXT_PUBLIC_SUPABASE_ANON_KEY`          | Öffentlicher Anon-Key                               |
| Dashboard | `SUPABASE_SERVICE_ROLE_KEY`              | Nur serverseitig, standardmäßig ungenutzt           |
| Worker    | `SUPABASE_URL`                           | Supabase-Projekt-URL                                |
| Worker    | `SUPABASE_SERVICE_ROLE_KEY`              | Service-Role-Key (umgeht RLS)                       |
| Worker    | `BINANCE_API_KEY` / `BINANCE_API_SECRET` | Nur Testnet-Keys!                                   |
| Worker    | `BINANCE_BASE_URL`                       | Default `https://testnet.binance.vision`            |
| Worker    | `BINANCE_WS_URL`                         | Default `wss://stream.testnet.binance.vision`       |
| Worker    | `PAPER_TRADING`                          | `true` (Default) = simulierter Broker für alle Bots |
| Worker    | `KILL_SWITCH`                            | `true` = global keine Orders, keine Bot-Starts      |
| Worker    | `PORT`                                   | Health-Check-Port (Default 8080)                    |
| Worker    | `LOG_LEVEL`                              | `debug` \| `info` \| `warn` \| `error`              |
| Worker    | `WORKER_INSTANCE_ID`                     | Name der Worker-Instanz                             |

## Entwicklung starten

```bash
# Terminal 1 — Dashboard (http://localhost:3000)
pnpm --filter @daytrading/dashboard dev

# Terminal 2 — Worker (Health: http://localhost:8080/health)
pnpm --filter @daytrading/worker dev
```

Oder per Docker (nur Worker):

```bash
docker compose up --build
```

## Qualitäts-Checks

```bash
pnpm lint         # ESLint
pnpm typecheck    # TypeScript (alle Pakete)
pnpm test         # Vitest (Worker-Tests)
pnpm build        # Produktionsbuilds
```

## Erste Schritte im Dashboard

1. Registrieren / anmelden (Supabase Auth).
2. Unter **Bot-Steuerung** einen Bot anlegen (z. B. `BTCUSDT`, Modus _Paper-Trading_).
3. Unter **Strategie** die Limits prüfen (Stop-Loss, Tagesverlust, Cooldown …).
4. **Start** klicken — der Worker übernimmt den Command und startet die Engine.
5. Trades, Orders, Logs und Risiko live im Dashboard verfolgen.

## Strategie

Mitgeliefert ist eine modulare **EMA-RSI-Strategie** (EMA 9/21-Crossover + RSI-14-Filter,
Einstieg nur nach Kerzenschluss, optionaler Volumenfilter). Eigene Strategien implementieren das
`Strategy`-Interface aus `@daytrading/shared` und werden in
`apps/worker/src/strategy/registry.ts` registriert.

## Deployment

Siehe [DEPLOYMENT.md](./DEPLOYMENT.md) (Vercel + Railway + Supabase).

## Sicherheit

Siehe [SECURITY.md](./SECURITY.md). Kurzfassung: Secrets nur als Environment-Variablen im
Worker, RLS auf allen Tabellen, globaler `KILL_SWITCH`, Emergency-Stop, Tagesverlustlimit,
maximale Positionsgröße, Trade-Limits, Cooldown — und kein Live-Trading in diesem Release.

## Bekannte Einschränkungen

- **Kein Live-Trading** — bewusst nicht implementiert (DB-Constraint, Worker und UI blockieren `mode=live`).
- Nur **Long-Positionen** (Spot ohne Margin; kein Short-Selling).
- Nur **Market Orders** (Stop-Loss/Take-Profit werden von der Engine überwacht, nicht als Exchange-Order platziert).
- Ein Worker-Prozess verarbeitet alle Bots (horizontale Skalierung nicht vorgesehen).
- Paper-Trading-Kontostand (10 000 USDT) wird bei Worker-Neustart zurückgesetzt.
- Gebühren im Testnet-Modus werden bei Statusabfragen ohne Fills mit 0 angesetzt.
- Der Heartbeat ist pro Bot; ein gestoppter Bot hat keinen aktuellen Heartbeat.
