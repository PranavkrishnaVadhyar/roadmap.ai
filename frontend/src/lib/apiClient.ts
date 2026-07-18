import type { ChatMessage, ChatResponse, Material, Roadmap, TodoItem } from '../data/mockData'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8012'

type RoadmapSummary = Pick<Roadmap, 'id' | 'title' | 'created_at'>
type SharedRoadmap = Roadmap & { todos: TodoItem[] }
type ChatApiResponse = { ready_to_generate: boolean; chat_history: ChatMessage[] }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(payload?.detail ?? `API request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  continueChat: async (chatHistory: ChatMessage[]): Promise<ChatResponse> => {
    const response = await request<ChatApiResponse>('/chat', { method: 'POST', body: JSON.stringify({ ready_to_generate: false, chat_history: chatHistory }) })
    return { ready_to_generate: response.ready_to_generate, messages: response.chat_history }
  },
  createRoadmap: (chatHistory: ChatMessage[]) => request<Roadmap>('/roadmaps', { method: 'POST', body: JSON.stringify({ chat_history: chatHistory }) }),
  listRoadmaps: () => request<RoadmapSummary[]>('/roadmaps'),
  getRoadmap: (id: string) => request<Roadmap>(`/roadmaps/${id}`),
  editRoadmap: (id: string, query: string) => request<Roadmap>(`/roadmaps/${id}/edit`, { method: 'POST', body: JSON.stringify({ query }) }),
  updateNode: (roadmapId: string, nodeId: string, patch: Partial<Pick<Roadmap['nodes'][number], 'status' | 'position_x' | 'position_y'>>) => request<Roadmap>(`/roadmaps/${roadmapId}/nodes/${nodeId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  refreshMaterials: (roadmapId: string, nodeId: string) => request<Material[]>(`/roadmaps/${roadmapId}/nodes/${nodeId}/materials`, { method: 'POST' }),
  getTodos: (roadmapId: string) => request<{ todos: TodoItem[] }>(`/roadmaps/${roadmapId}/todos`),
  generateTodos: (roadmapId: string) => request<{ todos: TodoItem[] }>(`/roadmaps/${roadmapId}/todos/generate`, { method: 'POST' }),
  updateTodo: (todoId: string, patch: Partial<Pick<TodoItem, 'title' | 'is_complete' | 'order_index'>>) => request<TodoItem>(`/todos/${todoId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createShareLink: (roadmapId: string) => request<{ share_token: string; share_url: string }>(`/roadmaps/${roadmapId}/share`, { method: 'POST' }),
  revokeShareLink: (roadmapId: string) => request<void>(`/roadmaps/${roadmapId}/share`, { method: 'DELETE' }),
  getSharedRoadmap: (token: string) => request<SharedRoadmap>(`/share/${token}`),
}

export function isMockRoadmap(id: string) { return id === 'rm_mock_001' }
