# Security

## Grundprinzipien

1. **Secrets nur als Environment-Variablen.** Es gibt keinerlei API-Keys, Passwörter oder
   Tokens im Repository. `.env*`-Dateien sind git-ignoriert; nur `.env.example` ohne echte
   Werte wird versioniert.
2. **Binance-Credentials nur im Worker.** `BINANCE_API_KEY`/`BINANCE_API_SECRET` existieren
   ausschließlich in der Railway-Umgebung. Die Next.js-App kennt sie nicht, fragt sie nicht ab
   und zeigt sie nie an.
3. **Kein `NEXT_PUBLIC_` für Geheimnisse.** `NEXT_PUBLIC_`-Variablen landen im
   Browser-Bundle. Im Dashboard sind das ausschließlich die Supabase-URL und der öffentliche
   anon-Key (durch RLS abgesichert).
4. **Keine Withdrawal-Permission.** Testnet-Keys besitzen keine Auszahlungsrechte; für
   etwaige spätere echte Keys ist Withdrawal-Permission strikt untersagt. Das System enthält
   keinerlei Auszahlungs-Code.
5. **Kein Live-Trading in diesem Release.** `mode=live` wird vierfach blockiert:
   - CHECK-Constraint `no_live_trading` in der Datenbank,
   - RLS-Policy (INSERT/UPDATE mit `mode <> 'live'`),
   - Zod-Schema im Dashboard (nur `paper`/`testnet`),
   - Worker wirft bei unbekanntem Modus einen Fehler.
     Es existiert keine Environment-Variable, die Live-Trading aktivieren könnte.

## Zugriffskontrolle (Row Level Security)

Alle Tabellen haben RLS aktiviert:

- Benutzer sehen und verändern ausschließlich eigene Bots, Einstellungen, Positionen, Orders,
  Trades, Events und Risiko-Daten (`owns_bot()`-Prüfung über `auth.uid()`).
- `system_commands`: Benutzer dürfen nur `pending`-Commands für eigene Bots einfügen
  (`requested_by = auth.uid()`); Statusänderungen macht ausschließlich der Worker.
- Der Worker nutzt den `service_role`-Key (umgeht RLS) und läuft nur serverseitig.

## Laufzeit-Sicherheitsmechanismen

| Mechanismus                    | Wirkung                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `KILL_SWITCH=true`             | Global: keine Bot-Starts, keine Order-Erstellung                                                |
| Emergency-Stop (Dashboard)     | Schließt Position sofort, stoppt Bot; mit Sicherheitsabfrage („STOP“ tippen)                    |
| `PAPER_TRADING=true` (Default) | Erzwingt den simulierten Broker für alle Bots                                                   |
| Max. Tagesverlust              | Keine neuen Entries nach Erreichen des Limits                                                   |
| Max. Positionsgröße            | Obergrenze des eingesetzten Kapitals pro Position                                               |
| Max. Trades/Tag                | Begrenzung der Handelsfrequenz                                                                  |
| Cooldown                       | Mindestabstand zwischen Trades                                                                  |
| Eine Position pro Bot/Symbol   | DB-Unique-Index + Engine-Prüfung                                                                |
| Duplicate-Order-Schutz         | Deterministische `clientOrderId` pro Kerze + Unique-Index + Exchange-Lookup                     |
| Kein blinder Order-Retry       | Nach Netzwerkfehlern wird der echte Orderstatus geprüft, bevor irgendetwas erneut gesendet wird |

## Logging

- Der Logger redigiert Schlüssel wie `secret`, `apiKey`, `token`, `signature` automatisch
  (`[REDACTED]`), auch in `bot_events.metadata`.
- API-Secrets werden nie geloggt, nie in Fehlermeldungen eingebettet und nie über
  `/health` ausgegeben.

## Empfehlungen für den Betrieb

- **IP-Allowlisting:** Binance-API-Key auf die statische Railway-Egress-IP beschränken
  (siehe DEPLOYMENT.md).
- **Key-Rotation:** Keys regelmäßig rotieren; bei Verdacht sofort widerrufen.
- **Least Privilege:** Testnet-Keys nur mit Spot-Trading-Rechten erzeugen.
- **Supabase:** E-Mail-Bestätigung aktiv lassen; starke Passwörter erzwingen.

## Schwachstellen melden

Bitte Sicherheitsprobleme nicht als öffentliches GitHub-Issue melden, sondern vertraulich an
den Repository-Betreiber.
