# PRD: RoadmapAI — AI-Generated Learning Roadmaps

**Status:** Idea stage
**Audience:** Learners & educators

---

## 1. Problem

Learners trying to pick up a new tool, technology, or prepare for a technical role usually rely on generic, static roadmaps that don't adapt to their background, goals, or timeline — and once created, these roadmaps are hard to update or act on.

## 2. Goals

- Let anyone generate a personalized learning roadmap by chatting with an AI, instead of using a generic template.
- Make roadmaps easy to update over time as the learner's needs change.
- Attach real learning materials to each step, so the roadmap is actionable, not just a diagram.
- Turn the roadmap into a to-do list so learners have concrete next actions and can track progress.

## 3. Target Users

- **Learners** — anyone learning a new tool/technology or preparing for a technical role (career switchers, upskilling engineers, interview preppers).
- **Educators** — anyone building structured learning paths for others (mentors, bootcamp instructors, team leads onboarding others).

## 4. Core Features

1. **Create roadmap via chat** — describe your learning goal in natural language; the AI asks a few clarifying questions and generates a structured roadmap.
2. **AI-generated learning materials per node** — the AI searches the web and attaches relevant resources (links, videos, courses, docs) to each topic in the roadmap automatically.
3. **Edit roadmap via chat** — revise the roadmap conversationally (add/remove/reorder topics) using the same AI, without starting over.
4. **To-do list from roadmap** — generate a checklist of action items from the roadmap to track progress.

## 5. User Stories

1. As a learner, I want to describe my goal in plain language so the AI can build a roadmap tailored to me.
2. As a learner, I want the AI to ask me a few questions (experience level, timeline, goal) so the roadmap isn't generic.
3. As a learner, I want to see my roadmap as a clear, structured visual so I understand what to learn and in what order.
4. As a learner or educator, I want the AI to find and attach real learning resources to each topic so the roadmap points to actual material, not just topic names.
5. As a learner, I want to tell the AI what to change ("I already know X" / "add Y") and have the roadmap update accordingly.
6. As a learner, I want to turn my roadmap into a to-do list so I have clear next steps.
7. As a learner, I want to check off completed items and see my overall progress.
8. As an educator, I want to build a roadmap once and reuse/share it with learners I'm guiding.

## 6. Key Flows

**Create a roadmap**
Land on site → start chat → describe goal → answer clarifying questions → AI generates roadmap → review and confirm.

**Get learning materials**
Roadmap is generated → AI searches the web for each topic → relevant resources are attached automatically → learner can view, swap, or request different resources per topic.

**Edit a roadmap**
Open roadmap → open chat → describe the change → AI updates the roadmap in place.

**Generate and use a to-do list**
Open roadmap → generate to-do list → check off items as completed → track progress.

---

*Next steps once scope is validated: define MVP boundaries, data model for roadmap structure, and LLM prompt/output design.*

---

# Technical Requirements Document: RoadmapAI

**Status:** Prototype — stores roadmap data and to-do lists (chat history is not stored), no auth, with shareable read-only links. API endpoint contracts are covered in a separate backend/frontend interface document.
**Related doc:** PRD-RoadmapAI-Basic.md

---

## 1. Tech Stack Summary

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI (Python) | Async, auto-generated OpenAPI docs, easy LLM SDK integration |
| Database | SQLite | Fine for single-user/local MVP; migration path to Postgres later if multi-user |
| Frontend | React + **React Flow** | React Flow is the closest match to roadmap.sh's interactive node-graph (drag, zoom, pan, connect nodes) |
| AI (roadmap generation/editing) | OpenAI API (chat completions, structured output) | Generates/edits roadmap structure conversationally |
| AI (resource discovery) | Tavily Search API (or OpenAI's web search tool) | Finds real, current learning resources per node |
| Auth | None (prototype) | Single-user, local-first; shareable links are access-by-URL only |
| Deployment | TBD | Open decision — see Section 7 |

**Prototype scope note:** persistence covers the roadmap (nodes, edges, materials) and to-do list. Chat history is not stored — see Section 3 for details.

### Why React Flow
React Flow (`@xyflow/react`) is purpose-built for exactly this kind of UI: draggable/zoomable node-and-edge diagrams with custom node content, which is what roadmap.sh-style visualizations need. It handles layout interaction (pan/zoom/drag), custom node rendering (so each node can show topic name, status, and material count), and edges for prerequisite relationships — without you needing to build canvas/SVG interaction logic from scratch. Alternative: `react-digraph` or a headless layout lib (`dagre`/`elkjs`) paired with plain SVG if you want more visual control later, but React Flow is the fastest path to an MVP that already feels like roadmap.sh.

---

## 2. Architecture Overview

```
[React + React Flow] ⇄ [FastAPI backend] ⇄ [SQLite]
                              ⇅
                    [OpenAI API]  (roadmap generation/edit — structured JSON output)
                              ⇅
                    [Tavily Search API]  (learning resource discovery per node)
```

- Frontend talks to the FastAPI backend only; it never calls OpenAI/Tavily directly (keeps API keys server-side).
- FastAPI orchestrates: user chat message → OpenAI call → parse structured roadmap JSON → persist roadmap (and to-do list, where applicable) to SQLite → return to frontend.
- Resource discovery is a separate backend step per node (async, can run in background after roadmap is created) using Tavily (or OpenAI's web search tool) → results attached to the node in SQLite.
- Exact endpoint contracts (routes, request/response payloads) are defined separately in the backend/frontend interface document, not here.

---

## 3. Data Model (SQLite)

```sql
-- A roadmap is a single learning plan
CREATE TABLE roadmaps (
    id TEXT PRIMARY KEY,           -- uuid
    title TEXT NOT NULL,
    goal_description TEXT,         -- original user goal/prompt
    share_token TEXT UNIQUE,       -- random slug/token used in the shareable link
    is_public BOOLEAN DEFAULT TRUE, -- whether the share link is currently active
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Nodes = topics/subtopics in the roadmap graph
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT REFERENCES roadmaps(id),
    title TEXT NOT NULL,
    description TEXT,
    position_x REAL,               -- for React Flow layout persistence
    position_y REAL,
    status TEXT DEFAULT 'not_started', -- not_started | in_progress | done
    created_at TIMESTAMP
);

-- Edges = prerequisite/dependency relationships between nodes
CREATE TABLE edges (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT REFERENCES roadmaps(id),
    source_node_id TEXT REFERENCES nodes(id),
    target_node_id TEXT REFERENCES nodes(id)
);

-- Learning materials attached to a node (AI-generated via web search)
CREATE TABLE materials (
    id TEXT PRIMARY KEY,
    node_id TEXT REFERENCES nodes(id),
    title TEXT,
    url TEXT,
    resource_type TEXT,            -- article | video | course | doc | other
    source TEXT DEFAULT 'ai_search', -- ai_search | manual (future)
    created_at TIMESTAMP
);

-- To-do items generated from roadmap nodes
CREATE TABLE todo_items (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT REFERENCES roadmaps(id),
    node_id TEXT REFERENCES nodes(id) NULL,  -- null if a custom/manual todo
    title TEXT,
    is_complete BOOLEAN DEFAULT FALSE,
    order_index INTEGER,
    created_at TIMESTAMP
);
```

**Note on scope:** Chat history is intentionally left out of this prototype's data model. Chat context needed to generate or edit a roadmap can be held in memory for the duration of a request/session and discarded once the roadmap is saved. To-do items, however, **are** persisted (see `todo_items` above), so progress checkmarks survive across sessions.

---

## 4. Backend (FastAPI) Requirements

*(Note: specific API routes and request/response contracts are defined in a separate backend/frontend interface document. This section covers behavioral requirements only.)*

### 4.1 LLM Integration Requirements

- Use OpenAI's structured output (JSON schema / function-calling mode) so roadmap generation and edits return **parseable, predictable JSON** (nodes, edges, titles) rather than freeform text that needs regex parsing.
- Edit requests must be sent with enough context (existing roadmap JSON + chat history) for the model to return a **diff** (added/removed/modified nodes) rather than a full regeneration, to preserve node positions, statuses, and materials on unaffected nodes.
- Backend validates LLM output before writing to SQLite (reject/retry on malformed JSON, missing required fields, or disconnected graph structure).

### 4.2 Resource Discovery Requirements

- For each node, call Tavily Search (or OpenAI web search tool) with a query derived from the node title + roadmap context (e.g., "best resources to learn Docker networking for beginners").
- Parse top N results into `materials` records (title, URL, inferred resource type).
- Should run asynchronously/in background after roadmap creation so the user isn't blocked waiting on N sequential searches.
- Provide a manual "regenerate materials for this node" action per node.

### 4.3 To-Do List Requirements

- To-do items are generated from the roadmap's nodes (respecting node order/dependencies) and persisted in `todo_items`, so completion status survives across sessions.
- Support both node-linked to-dos (`node_id` set) and freeform custom to-dos (`node_id` null).
- Regenerating a to-do list from an edited roadmap should add/remove items to match new/removed nodes without resetting `is_complete` on unaffected items.

### 4.4 Shareable Link Requirements

- Each roadmap gets a unique, unguessable `share_token` (e.g., random UUID or short slug) generated on request, not by default on creation — keeps roadmaps private until the user explicitly chooses to share.
- The public/shared view is **read-only**: no editing, no chat, no material regeneration, and (recommend) to-do checkboxes shown as read-only progress rather than editable — just a rendered snapshot of the roadmap.
- Since there's no auth, anyone with the link can view it — this is acceptable for a prototype but should be called out to users (e.g., "anyone with this link can view your roadmap") if/when this becomes more than a prototype.
- Owner can revoke the link at any time (`is_public = false`), after which the share URL should no longer resolve to the roadmap.

### 4.5 Error Handling
- Malformed LLM JSON → retry once with a repair prompt, then surface a clear error to the frontend if it still fails.
- Search API failure/timeout → node shows "materials unavailable, retry" state rather than blocking the whole roadmap view.

---

## 5. Frontend (React + React Flow) Requirements

- **Chat panel**: persistent side panel or modal for both roadmap creation and later editing; reuses the same component for both flows.
- **Roadmap canvas**: React Flow instance rendering nodes (topic + status badge + material count) and edges (prerequisite arrows); supports pan/zoom/drag, matching roadmap.sh's feel.
- **Node detail panel**: clicking a node opens a side panel showing description, attached materials (with links), and status toggle.
- **To-do view**: separate list/checklist view generated from the roadmap, with checkboxes and a progress indicator; each item links back to its source node.
- Node positions set by the AI on generation (or auto-layout via `dagre`/`elkjs` if the AI doesn't return coordinates) but are user-adjustable and persisted back to the backend on drag.
- **Shared view page** (e.g., `/share/:token`): renders the same React Flow canvas in a read-only mode (no chat panel, no editing, no material regeneration button) — reuses the roadmap canvas component with a `readOnly` prop.
- **Share button/modal**: on the owner's roadmap view, a "Share" action requests a share link and displays the copyable public URL, with an option to revoke it.

---

## 6. Non-Functional Requirements (MVP)

| Category | Requirement |
|---|---|
| Auth | None — single-user, local-first application |
| Data persistence | SQLite file on disk; no multi-user isolation needed at this stage |
| Performance | Roadmap generation < 10s; node material search can run async in background |
| Reliability | Validate all LLM JSON output before persisting; graceful fallback UI states for AI/search failures |
| Portability | Keep backend stateless aside from SQLite file, to ease later move to Postgres/multi-user without a full rewrite |

---

## 7. Open Decisions

| Item | Notes |
|---|---|
| Deployment target | Not yet decided. For a local prototype, running FastAPI + SQLite locally (or in a single Docker container) is simplest. Note: since share links need to be reachable by other people, at some point this prototype will need to be hosted somewhere public (even a small VM) rather than run purely on localhost — worth deciding before you demo the share feature to anyone else. |
| Chat history persistence | Deliberately deferred (see Section 3). Easy to add back later: a `chat_messages` table keyed by `roadmap_id`, without disrupting the existing schema. |
| Auth for future multi-user version | Not needed now, but the schema should add a `user_id` column later without major rework. |
| Tavily vs. OpenAI web search tool | Both work; Tavily is purpose-built for LLM-facing search (cleaner structured results), OpenAI's built-in tool avoids a second API key/vendor. Recommend starting with whichever you already have API access to. |
| Share link security | No auth means share links are "unguessable URL = access control." Fine for a prototype; flag clearly in the UI so users understand the tradeoff. |

---

*Next step: the separate backend/frontend interface document will define the exact API routes and the JSON schema/contract for LLM roadmap generation and edit-diff responses.*
