export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface ChatResponse { ready_to_generate: boolean; messages: ChatMessage[] }
export interface Material { id: string; title: string; url: string; resource_type: "article" | "video" | "course" | "doc" | "other" }
export interface RoadmapNode { id: string; title: string; description: string; position_x: number; position_y: number; status: "not_started" | "in_progress" | "done"; materials: Material[] }
export interface RoadmapEdge { source_node_id: string; target_node_id: string }
export interface Roadmap { id: string; title: string; goal_description: string; nodes: RoadmapNode[]; edges: RoadmapEdge[]; share_token: string | null; created_at: string }
export interface TodoItem { id: string; node_id: string | null; title: string; is_complete: boolean; order_index: number }
export interface ShareResponse { share_token: string; share_url: string }

export const mockChatResponse: ChatResponse = {
  ready_to_generate: true,
  messages: [
    { role: "user", content: "I want to learn Kubernetes" },
    { role: "assistant", content: "Got it — what's your current experience with containers or orchestration tools?" },
    { role: "user", content: "I know Docker well, new to Kubernetes. About 6 weeks before an interview." },
    { role: "assistant", content: "Great — Docker experience, 6-week timeline, interview-focused. I've got what I need to build your roadmap." },
  ],
}

export const mockRoadmap: Roadmap = {
  id: "rm_mock_001", title: "Kubernetes for Interview Readiness", goal_description: "Learn Kubernetes with a Docker background, 6-week interview prep", created_at: "2026-07-18T10:00:00Z", share_token: null,
  nodes: [
    { id: "nd_1", title: "Kubernetes Architecture Basics", description: "Core concepts: clusters, nodes, pods, and the control plane.", position_x: 0, position_y: 0, status: "done", materials: [{ id: "mt_1", title: "Kubernetes Concepts (official docs)", url: "https://kubernetes.io/docs/concepts/", resource_type: "doc" }, { id: "mt_2", title: "Kubernetes Explained in 15 Minutes", url: "https://example.com/k8s-explained", resource_type: "video" }] },
    { id: "nd_2", title: "Pods & Deployments", description: "Creating and managing pods, deployments, and replica sets.", position_x: 1, position_y: 0, status: "in_progress", materials: [{ id: "mt_3", title: "Deployments Guide", url: "https://example.com/deployments-guide", resource_type: "article" }] },
    { id: "nd_3", title: "Services & Networking", description: "Exposing pods via services, ClusterIP, NodePort, and Ingress basics.", position_x: 2, position_y: 0, status: "not_started", materials: [{ id: "mt_4", title: "Kubernetes Networking Deep Dive", url: "https://example.com/k8s-networking", resource_type: "course" }] },
    { id: "nd_4", title: "ConfigMaps & Secrets", description: "Externalizing configuration and sensitive data from application code.", position_x: 2, position_y: 1, status: "not_started", materials: [] },
    { id: "nd_5", title: "Helm Basics", description: "Packaging and templating Kubernetes manifests with Helm charts.", position_x: 3, position_y: 0, status: "not_started", materials: [{ id: "mt_5", title: "Helm Quickstart", url: "https://example.com/helm-quickstart", resource_type: "doc" }] },
    { id: "nd_6", title: "Common Interview Scenarios", description: "Debugging CrashLoopBackOff, scaling strategies, and rollout/rollback questions.", position_x: 4, position_y: 0, status: "not_started", materials: [{ id: "mt_6", title: "Top Kubernetes Interview Questions", url: "https://example.com/k8s-interview-qs", resource_type: "article" }] },
  ],
  edges: [{ source_node_id: "nd_1", target_node_id: "nd_2" }, { source_node_id: "nd_2", target_node_id: "nd_3" }, { source_node_id: "nd_2", target_node_id: "nd_4" }, { source_node_id: "nd_3", target_node_id: "nd_5" }, { source_node_id: "nd_5", target_node_id: "nd_6" }],
}

export const mockTodos: TodoItem[] = [
  { id: "td_1", node_id: "nd_1", title: "Read through Kubernetes architecture overview", is_complete: true, order_index: 0 }, { id: "td_2", node_id: "nd_1", title: "Set up a local cluster (kind or minikube)", is_complete: true, order_index: 1 }, { id: "td_3", node_id: "nd_2", title: "Deploy a sample app with a Deployment manifest", is_complete: false, order_index: 2 }, { id: "td_4", node_id: "nd_3", title: "Expose a service via NodePort and test access", is_complete: false, order_index: 3 }, { id: "td_5", node_id: "nd_5", title: "Package the sample app as a Helm chart", is_complete: false, order_index: 4 }, { id: "td_6", node_id: "nd_6", title: "Practice explaining a rollback scenario out loud", is_complete: false, order_index: 5 }, { id: "td_7", node_id: null, title: "Schedule a mock interview with a friend", is_complete: false, order_index: 6 },
]
export const mockShareResponse: ShareResponse = { share_token: "demo-token-k8s-001", share_url: "https://roadmapai.app/share/demo-token-k8s-001" }
