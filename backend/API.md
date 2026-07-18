# RoadmapAI Backend API

Base URL (local development): `http://127.0.0.1:8000`
Interactive OpenAPI docs: `http://127.0.0.1:8000/docs`

All requests and responses use JSON. There is no authentication in this prototype.

## Frontend flow: chat, then create a roadmap

Chat history is **not stored** by the backend. The frontend owns the complete history and sends it with every `POST /chat` request.

1. Start with one user message and `ready_to_generate: false`.
2. Replace local history with the returned `chat_history` and send it again after each user reply.
3. When the response has `ready_to_generate: true`, call `POST /roadmaps` using that exact `chat_history`.
4. Do not call `/chat` again after the flag is true; it returns the supplied history unchanged.

### `POST /chat`

Continue the intake conversation only. This endpoint never creates a roadmap.

Request:

```json
{
  "ready_to_generate": false,
  "chat_history": [
    {"role": "user", "content": "I want to learn Kubernetes"},
    {"role": "assistant", "content": "What experience do you have with containers?"},
    {"role": "user", "content": "I know Docker and have six weeks before an interview."}
  ]
}
```

Response:

```json
{
  "ready_to_generate": true,
  "chat_history": [
    {"role": "user", "content": "I want to learn Kubernetes"},
    {"role": "assistant", "content": "What experience do you have with containers?"},
    {"role": "user", "content": "I know Docker and have six weeks before an interview."},
    {"role": "assistant", "content": "Great, I have enough information to create your roadmap."}
  ]
}
```

Each message is `{ "role": "user" | "assistant", "content": "..." }`. Empty histories or empty message content return `422`. An unavailable AI provider returns `502`.

### `POST /roadmaps`

Create and persist a roadmap from the completed client-owned conversation.

Request:

```json
{
  "chat_history": [
    {"role": "user", "content": "I want to learn Kubernetes"},
    {"role": "assistant", "content": "I have enough information to create your roadmap."}
  ]
}
```

Response: `201 Created`, with a full `Roadmap` object. AI output is validated for known node references and acyclic prerequisite edges before it is saved. Invalid AI output or provider failure returns `502`.

## Roadmap shape

```json
{
  "id": "rm_...",
  "title": "Kubernetes Interview Roadmap",
  "goal_description": "...",
  "share_token": null,
  "created_at": "2026-07-19T00:00:00Z",
  "nodes": [
    {
      "id": "nd_...",
      "title": "Cluster Architecture",
      "description": "...",
      "position_x": 0,
      "position_y": 0,
      "status": "not_started",
      "materials": []
    }
  ],
  "edges": [
    {"id": "ed_...", "source_node_id": "nd_...", "target_node_id": "nd_..."}
  ]
}
```

Node status is one of `not_started`, `in_progress`, or `done`.

## Roadmaps and nodes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/roadmaps` | List saved roadmaps; returns `id`, `title`, and `created_at`. |
| `GET` | `/roadmaps/{roadmap_id}` | Fetch a full roadmap, including materials. |
| `DELETE` | `/roadmaps/{roadmap_id}` | Delete a roadmap and dependent data. Returns `204`. |
| `POST` | `/roadmaps/{roadmap_id}/edit` | Apply an AI-generated edit from a natural-language query; returns the full updated roadmap. |
| `PATCH` | `/roadmaps/{roadmap_id}/nodes/{node_id}` | Persist a node drag position or status change; returns the full updated roadmap. |
| `POST` | `/roadmaps/{roadmap_id}/nodes/{node_id}/materials` | Use OpenAI web search to replace AI-generated materials for one node. |

### `POST /roadmaps/{roadmap_id}/edit`

```json
{"query": "I know networking already. Remove it and add Helm."}
```

The response is a full `Roadmap`. Unchanged nodes retain their IDs, positions, status, and materials. AI-generated todos are regenerated; manual todos remain.

### `PATCH /roadmaps/{roadmap_id}/nodes/{node_id}`

Send one or more fields:

```json
{"position_x": 420, "position_y": 160}
```

```json
{"status": "in_progress"}
```

### Node materials response

`POST /roadmaps/{roadmap_id}/nodes/{node_id}/materials` returns:

```json
[
  {
    "id": "mt_...",
    "title": "Kubernetes Concepts",
    "url": "https://example.com/resource",
    "resource_type": "doc",
    "source": "ai_search"
  }
]
```

`resource_type` is `article`, `video`, `course`, `doc`, or `other`.

## Todos

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/roadmaps/{roadmap_id}/todos/generate` | Generate or replace AI todos; manual todos are preserved. |
| `GET` | `/roadmaps/{roadmap_id}/todos` | Fetch todos in `order_index` order. |
| `POST` | `/roadmaps/{roadmap_id}/todos` | Add a manual todo. |
| `PATCH` | `/todos/{todo_id}` | Update a todo. |
| `DELETE` | `/todos/{todo_id}` | Delete a todo. Returns `204`. |

Generated/list response:

```json
{
  "todos": [
    {
      "id": "td_...",
      "node_id": "nd_...",
      "title": "Create a local cluster with kind",
      "is_complete": false,
      "order_index": 0
    }
  ]
}
```

Add a manual todo:

```json
{"title": "Schedule mock interview"}
```

Update any supplied fields:

```json
{"is_complete": true}
```

```json
{"title": "Revised task", "order_index": 3}
```

## Sharing

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/roadmaps/{roadmap_id}/share` | Create or rotate the public share token. |
| `DELETE` | `/roadmaps/{roadmap_id}/share` | Revoke sharing. Returns `204`. |
| `GET` | `/share/{share_token}` | Fetch read-only public roadmap and todos. |

Creating a share link returns:

```json
{
  "share_token": "...",
  "share_url": "http://localhost:5173/share/..."
}
```

The public response has the full roadmap shape plus a top-level `todos` array. It is read-only; no public mutation routes exist.

## Errors

| Status | Meaning |
| --- | --- |
| `422` | Invalid request shape or field value. |
| `404` | Roadmap, node, todo, or active share link was not found. |
| `502` | OpenAI generation/search failed or returned invalid structured data. Show a retry option. |
