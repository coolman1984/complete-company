# 70 — Agent showcase: one order, the whole company, driven by an AI agent

Version 1.0 · 2026-09-30 · Owner's idea (with an outside assistant's first plan), checked against the code and improved.
Builds on `60-CERAMIC-PITCH.md` (the ceramic demo company and its chain).

**Goal.** In front of a board, an AI agent takes a customer order and moves it through Mizan, GMES, HR and Space Planner:
order, forecast and targets, MRP, purchasing, shifts and labour, production and quality, a surprise, container loading
in 3D, shipping, revenue, month-end review, financial statements and tax summary, a management summary. The board sees
**speed, accuracy and low cost, each measured, not claimed.**

## 1. The five rules that make it credible

1. **The agent orchestrates; the engines calculate.** MRP is GMES's, postings are Mizan's ledger, container loading is
   Space Planner's packer, pay is Mizan/HR's. The agent reads, decides, records through the official APIs and explains.
   **It never types a number it did not get from a tool.** That is where accuracy comes from.
2. **Accuracy is proven by someone else.** After the run, the existing cross-system verifier (`scenario/verify`)
   checks quantities, values, lots and headcount across the apps and shows its checks on screen. The agent does not
   grade itself.
3. **Speed and cost are measured.** Wall-clock time, number of tool calls, records created, tokens and money are read
   from the run itself and shown live. No comparison with manual work is claimed; that is what the pilot measures.
4. **People approve what commits the company.** The agent prepares; a person approves: purchase orders, journal
   postings, payroll, the month-end review, anything sent to the tax authority. Each approval is a real status in the
   app, and every record shows who did it: the agent has its own user in each app, with a limited role and no admin
   right.
5. **Real facts come from the floor.** Produced quantities, defects and stoppages are entered by an operator (in the
   demo: the presenter, on a tablet or a second window) or by a machine. The agent never invents production.

## 2. What exists, checked in the code (2026-09-30)

✅ on GitHub `main` · 🟡 on the owner's PC only (not pushed; the chains need it) · 🔨 to build

| Scene | What the agent does | Engine | State |
|---|---|---|---|
| 1 Order | Reads the customer message, records the sales order, asks for anything missing | Mizan sales orders, ATP | ✅ |
| 2 Forecast and targets | Builds next months' demand plan from history, sets the monthly targets | Mizan S&OP versions (baseline months), budgets | ✅ (needs 3 months of history: seed) |
| 3 MRP | Runs MRP, reads requisitions, planned orders, crew needs | GMES planning | 🟡 |
| 4 Purchasing | Turns requisitions into purchase orders → **approval** | Mizan requisitions, PO approve | ✅ |
| 5 People | Shifts and schedule for the line, staffing gap, who is qualified | HR shifts, schedule, qualifications; staffing gap | ✅ / 🟡 |
| 6 Production and quality | Releases the work order, watches the floor: output by shade lot, losses by reason, stoppages, OEE, inspection | GMES exe, QMS, OEE, reports | ✅ (batch path proven) / 🟡 incoming lots |
| 7 Expenses | Records the month's operating expenses (energy, maintenance) as journals → **approval** | Mizan journal, recurring | ✅ |
| 8 **Surprise** | Part of a batch fails inspection: the agent recomputes available m², delivery date, cost and margin, proposes options → **decision** | GMES QMS + Mizan ATP/cost | 🔨 (tools exist; the reasoning is the agent's) |
| 9 Container 3D | Takes carton sizes and weights from the items, plans the containers, shows them loaded in 3D with playback; tiles fill a container **by weight before volume** | Space Planner `plan_shipment` / `pack_container` (payload per container type) | ✅ (link from item data 🔨) |
| 10 Ship and bill | Delivery by shade lot, invoice, e-invoice queued (test mode only), revenue recognised | Mizan deliveries, invoices, e-invoice | ✅ |
| 11 Month-end review | Runs a close checklist: payroll posted, depreciation, recurring entries, WIP cleared, bank reconciled, trial balance balanced, advisor findings → **approval** | Mizan (no monthly period lock exists: a review, not a lock) | 🔨 checklist tool |
| 12 Statements and tax | Income statement, balance sheet, cash flow, VAT tax summary, withholding | Mizan reports | ✅ |
| 13 Management summary | One page in Arabic: what happened, KPIs vs target, risks, next month's forecast, each number linked to its source | the agent | 🔨 |

## 3. Architecture (no new dependency)

```
 presenter ── cockpit page (portal, 127.0.0.1:4500/agent) ── SSE ──┐
                │ approve / reject                                 │ events: step, tool call, record, approval, cost
                ▼                                                  │
          agent runner (Node) ── launches the model ──► company MCP server (Node, stdio, zero dependency)
                                                           │ tools = official HTTP APIs, agent's own key/user
                                   ┌───────────────┬───────┴──────┬──────────────────┐
                                 Mizan           GMES          HR-System        Space Planner
```

- **Same pattern as Space Planner** (`3D-Modeling/apps/server/src/agents.ts`, `mcp.ts`): the runner starts Claude Code
  (`claude -p --mcp-config … --strict-mcp-config --allowedTools mcp__company --output-format stream-json`) or calls the
  Messages API directly with `fetch` (no SDK). Both report tokens and duration, which the scoreboard shows.
- **Company MCP server** in `complete-company/agent/`: about 30 tools grouped by scene, each one official API call or a
  small fixed sequence, returning compact JSON. Tools refuse what the agent's role may not do (approve, post, delete).
  Every write carries a command id, so a repeated call never duplicates.
- **Cockpit** (Arabic first, RTL, EN switch): right, the order and the agent's narration; middle, the scene timeline with
  each step's state; left, the document the step produced (with "open in the app"); bottom, the scoreboard: time,
  tool calls, records, cost, verifier checks. Approval cards appear in the timeline; the presenter clicks.
- **Two modes:** *Live* (the real model now) and *Replay* (a real recorded run played back with its real timings and
  cost, labelled on screen "تسجيل لتشغيل حقيقي بتاريخ …"). Replay is the safety net: no internet or a slow model does
  not stop the meeting.

## 4. Build order (each step ends green before the next)

| Step | Work | Done when |
|---|---|---|
| **B0** | **Owner pushes the local work** of GMES, Mizan, HR (planning, incoming lots, peers, gmes-wip, staffing gap) | `Start-Ceramic-Demo.bat` passes here from GitHub |
| B1 | Seed: the ceramic company + 3 months of small history (deterministic), agent user and key in each app | forecast and statements have real numbers |
| B2 | Company MCP server, tools for scenes 1, 3, 4, 6, 9, 10 | each tool tested against the running apps |
| B3 | Runner + event stream + cost/time measurement | a run prints its steps, tokens, time |
| B4 | Cockpit page: timeline, approvals, scoreboard, replay | the MVP runs end to end in the page |
| **MVP** | Order → MRP → purchase (approve) → production and quality → **surprise** → container 3D → invoice and margin | live run + recorded replay; verifier green |
| B5 | Scenes 2, 5, 7, 11, 12, 13 (forecast and targets, people, expenses, close review, statements and tax, summary) | full run; verifier green |
| B6 | Rehearsal: timings, a 10-minute cut (live for 3 scenes, replay for the rest), backup screenshots in the deck | owner rehearses once on Windows |

The surprise is in the MVP: it is the strongest moment (the agent shows judgement, not just speed).

## 5. The demo cut (10 minutes)

| Min | Scene | Mode |
|---|---|---|
| 0–1 | The order arrives as a customer message (WhatsApp-style text) | live |
| 1–3 | MRP, purchase order waiting for approval; the presenter approves | live |
| 3–5 | Production and quality on the floor; the presenter enters a rejection → the agent recomputes and proposes | live |
| 5–7 | Container loaded in 3D (weight, not volume, is the limit), shipping, invoice, margin | replay or live |
| 7–9 | Month-end review, statements, tax summary, forecast and targets for next months, the management page | replay |
| 9–10 | Scoreboard: time, cost of the whole run, verifier checks all green | — |

## 6. Risks and what we do

| Risk | Handling |
|---|---|
| A live run is slower than the slot | 10-minute cut above; replay of a real run |
| No internet at the factory | Replay works offline; the apps run on the laptop |
| The agent makes a wrong call | Approvals stop anything that commits the company; the verifier shows any mismatch in red, and we say so |
| "Is the agent really doing it?" | The timeline shows every tool call and the record it made; open any record in its app |
| E-invoice or tax filing | Test mode only; nothing is ever sent to the tax authority from a demo |
| Space Planner's sample list includes an illustrative Samsung Beni Suef site (`packages/starter/src/samsung.ts`) | Never open it in this meeting; the demo opens the ceramic shipment directly. Owner to decide whether that sample stays in a public repository |
| Month-end "close" | Mizan closes fiscal years, not months: call it a month-end **review**, never a lock |

## 7. Open decisions for the owner

1. **Model access for the demo:** Claude Code signed in on the laptop, or an API key (cleanest cost figure per run).
2. **Surprise scene:** a rejected batch (default) or a customer who moves the date earlier.
