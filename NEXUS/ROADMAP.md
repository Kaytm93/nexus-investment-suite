# NEXUS — Roadmap & Ideen

> Letzte Aktualisierung: 2026-04-02

---

## 🎯 Kurzfristig — Technische Schulden aufräumen

- [ ] `index.css` bereinigen — toten `ticker-scroll` Keyframe entfernen (~5 Min.)
- [ ] Error Boundaries in `App.jsx` einbauen (mind. um Analysis.jsx wrappen)
- [ ] "Passwort vergessen" in Auth.jsx — Supabase `resetPasswordForEmail()`
- [x] Bundle-Size: `vite.config.js` → `manualChunks` für GSAP + Recharts ✅ erledigt (verifiziert 2026-08-21: Chunks vendor/gsap/charts/icons/supabase getrennt, keine Vite-Bundle-Warning mehr)

---

## 🔮 Mittelfristig — Features

- [ ] **Portfolio-Persistenz klären** — SQLite oder Supabase auf Render persistent machen
- [ ] **Echte Live-Kurse** — yFinance Polling alle 60s im Backend (Server-Sent Events oder WebSocket)
- [ ] **Portfolio — Transaktions-History** — Nicht nur aktuelle Position, sondern Kaufhistorie
- [ ] **Screener — CSV-Export** — Elara-Ergebnisse als Download
- [ ] **Settings — Key-Vorschau** — Zeige gespeicherte Keys als `gsk_****` an
- [ ] **Watchlist** — Aktien auf Watchlist setzen und von Home aus überwachen
- [ ] **Altair — Caching verbessern** — Wie lange sind gecachte Reports gültig? UI-Indikator für "Stand: vor X Stunden"

---

## 💡 Ideen — Noch nicht entschieden

> (Hier kannst du selbst Ideen eintragen oder streichem)

- **Finnhub WebSocket** für echte Echtzeit-Kurse (US-Aktien) statt yFinance-Polling?
- **Dark/Light Mode Toggle** für den Nutzer? (Aktuell: nur Dark)
- **Mobile-Optimierung** — Header-Navigation auf kleinen Screens verbessern
- **Portfolio-Alerts** — Push-Benachrichtigung bei Kurs-Schwelle
- **Altair PDF-Export** — Echter PDF-Download statt Browser-Print
- **Multi-Language** — Deutsche UI + englische Analysen (aktuell gemischt)
- **Onboarding-Flow** — Neuen Nutzern erklären was Groq-Key ist und wie man ihn einrichtet

---

## 🚫 Explizit NICHT geplant

- Keine echte Bezahlfunktion / SaaS-Paywall
- Keine Multi-User-Verwaltung / Teilen von Portfolios
- Kein Docker (Pinokio-Launcher nutzt native Installs)
- Keine Playwright-Tests (wurden bewusst entfernt)
