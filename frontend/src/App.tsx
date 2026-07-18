import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleDot, CircleHelp, Compass,
  Copy, ExternalLink, FileText, Flag, GraduationCap, Layers2, Link2, Map,
  Menu, MoreHorizontal, Mountain, Play, RefreshCw, Share2, Sparkles, Target,
  X,
} from 'lucide-react'
import {
  mockShareResponse,
  type ChatMessage, type Material, type Roadmap, type RoadmapNode, type TodoItem,
} from './data/mockData'
import './App.css'
import './api.css'
import { api } from './lib/apiClient'

type SavedDemo = { roadmap: Roadmap; todos: TodoItem[]; shareActive: boolean; edited: boolean }
type TrailNodeData = { node: RoadmapNode; locked: boolean; readOnly: boolean; onCycle: (id: string) => void }

const STORAGE_KEY = 'roadmap-ai-trail-demo-v1'
const initialDemo = (): SavedDemo => ({
  roadmap: { id: '', title: 'No roadmap selected', goal_description: '', created_at: '', share_token: null, nodes: [], edges: [] }, todos: [], shareActive: false, edited: false,
})

function loadDemo(): SavedDemo {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return initialDemo()
    const parsed = JSON.parse(saved) as SavedDemo
    if (!parsed.roadmap?.nodes || !Array.isArray(parsed.todos) || parsed.roadmap.id === 'rm_mock_001') return initialDemo()
    return parsed
  } catch { return initialDemo() }
}

function navigate(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function progressOf(todos: TodoItem[]) {
  return todos.length ? Math.round((todos.filter((todo) => todo.is_complete).length / todos.length) * 100) : 0
}

function statusText(status: RoadmapNode['status']) {
  return status === 'done' ? 'Complete' : status === 'in_progress' ? 'On trail' : 'Ahead'
}

function verticalLayout(roadmap: Roadmap) {
  const ranks = new globalThis.Map(roadmap.nodes.map((node) => [node.id, 0]))
  for (let pass = 0; pass < roadmap.nodes.length; pass += 1) {
    roadmap.edges.forEach((edge) => ranks.set(edge.target_node_id, Math.max(ranks.get(edge.target_node_id) ?? 0, (ranks.get(edge.source_node_id) ?? 0) + 1)))
  }
  const layers = new globalThis.Map<number, RoadmapNode[]>()
  roadmap.nodes.forEach((node) => {
    const rank = ranks.get(node.id) ?? 0
    layers.set(rank, [...(layers.get(rank) ?? []), node])
  })
  const positions = new globalThis.Map<string, { x: number; y: number }>()
  layers.forEach((nodes, rank) => nodes.forEach((node, index) => positions.set(node.id, { x: 330 + (index - (nodes.length - 1) / 2) * 265, y: 70 + rank * 175 })))
  return positions
}

function resourceIcon(type: Material['resource_type']) {
  if (type === 'video') return <Play size={15} />
  if (type === 'course') return <GraduationCap size={15} />
  return <FileText size={15} />
}

function CompassProgress({ percent, compact = false }: { percent: number; compact?: boolean }) {
  return <div className={`progress-summary ${compact ? 'compact' : ''}`} aria-label={`${percent}% complete`}>
    <span className="progress-number">{percent}%</span><span className="progress-copy">complete</span><span className="progress-track"><i style={{ width: `${percent}%` }} /></span>
  </div>
}

function TrailNode({ data }: NodeProps<Node<TrailNodeData>>) {
  const { node, locked, readOnly, onCycle } = data
  return <div className={`trail-node ${node.status} ${locked ? 'is-locked' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="node-coordinate">{node.id.replace('nd_', 'WP-0')}</div>
    <button className="node-status" disabled={readOnly || locked} onClick={(event) => { event.stopPropagation(); onCycle(node.id) }} aria-label={`Set ${node.title} status; currently ${statusText(node.status)}`}>
      {node.status === 'done' ? <Check size={14} /> : node.status === 'in_progress' ? <CircleDot size={14} /> : <span />}
    </button>
    <div className="node-copy"><strong>{node.title}</strong><span>{locked ? 'fogged trail' : `${node.materials.length} field notes`}</span></div>
    <Handle type="source" position={Position.Bottom} />
  </div>
}

function Canvas({ roadmap, readOnly, onRoadmap, onSelect }: { roadmap: Roadmap; readOnly: boolean; onRoadmap: (roadmap: Roadmap) => void; onSelect: (node: RoadmapNode) => void }) {
  const [flowNodes, setFlowNodes] = useState<Node<TrailNodeData>[]>([])
  const lockedIds = useMemo(() => new Set(roadmap.edges.filter((edge) => roadmap.nodes.find((node) => node.id === edge.source_node_id)?.status !== 'done').map((edge) => edge.target_node_id)), [roadmap])
  const positions = useMemo(() => verticalLayout(roadmap), [roadmap])
  const cycleStatus = useCallback((id: string) => {
    const node = roadmap.nodes.find((item) => item.id === id)
    if (!node || lockedIds.has(id)) return
    const next = node.status === 'not_started' ? 'in_progress' : node.status === 'in_progress' ? 'done' : 'not_started'
    onRoadmap({ ...roadmap, nodes: roadmap.nodes.map((item) => item.id === id ? { ...item, status: next } : item) })
  }, [lockedIds, onRoadmap, roadmap])

  useEffect(() => {
    setFlowNodes(roadmap.nodes.map((node) => ({
      id: node.id, type: 'trail', position: positions.get(node.id) ?? { x: 330, y: 70 },
      data: { node, locked: lockedIds.has(node.id), readOnly, onCycle: cycleStatus }, draggable: !readOnly,
    })))
  }, [roadmap, lockedIds, positions, readOnly, cycleStatus])

  const edges = useMemo<Edge[]>(() => roadmap.edges.map((edge) => ({
    id: `${edge.source_node_id}-${edge.target_node_id}`, source: edge.source_node_id, target: edge.target_node_id,
    animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#5B8C9E' }, type: 'smoothstep',
  })), [roadmap.edges])
  const nodeTypes = useMemo(() => ({ trail: TrailNode }), [])
  const onNodesChange = useCallback((changes: NodeChange<Node<TrailNodeData>>[]) => setFlowNodes((current) => applyNodeChanges(changes, current)), [])
  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: Node<TrailNodeData>) => onRoadmap({ ...roadmap, nodes: roadmap.nodes.map((item) => item.id === node.id ? { ...item, position_x: Math.round(node.position.x - 55), position_y: Math.round(node.position.y - 95) } : item) }), [onRoadmap, roadmap])

  return <div className="canvas-shell">
    <div className="map-label map-label-top"><Mountain size={15} /> Elevation: beginner → interview-ready</div>
    <ReactFlow nodes={flowNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeClick={(_, node) => onSelect(node.data.node)} onNodeDragStop={onNodeDragStop} fitView fitViewOptions={{ padding: 0.24 }} minZoom={0.45} maxZoom={1.5} nodesDraggable={!readOnly} nodesConnectable={false} elementsSelectable>
      <Background color="#2A322E" gap={34} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
    <div className="map-label map-label-bottom"><Target size={15} /> Follow the gold marker. The blue trail is behind you.</div>
  </div>
}

function Header({ percent, readOnly, onShare }: { percent: number; readOnly?: boolean; onShare?: () => void }) {
  return <header className="topbar"><button className="wordmark" onClick={() => navigate('/')}><span className="wordmark-mark"><Mountain size={18} /></span><span>roadmap<span>AI</span></span></button><div className="topbar-center"><span className="eyebrow">{readOnly ? 'shared trail · view only' : 'your learning trail'}</span><CompassProgress percent={percent} compact /></div>{readOnly ? <span className="read-only-pill">Read only</span> : <div className="topbar-actions"><button className="icon-button" aria-label="Help"><CircleHelp size={19} /></button><button className="share-button" onClick={onShare}><Share2 size={16} /> Share</button><button className="icon-button mobile-menu" aria-label="Menu"><Menu size={20} /></button></div>}</header>
}

function DetailPanel({ node, readOnly, onClose, onCycle }: { node: RoadmapNode; readOnly: boolean; onClose: () => void; onCycle: () => void }) {
  return <aside className="detail-panel"><div className="detail-top"><span className="eyebrow">Waypoint {node.id.replace('nd_', '0')}</span><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button></div><h2>{node.title}</h2><p className="detail-description">{node.description}</p><div className="detail-status"><span className={`status-dot ${node.status}`} /><span>{statusText(node.status)}</span>{!readOnly && <button onClick={onCycle}>Update status <ChevronRight size={14} /></button>}</div><div className="field-notes-heading"><div><span className="eyebrow">Field notes</span><h3>Learning materials</h3></div>{!readOnly && <button className="quiet-button"><RefreshCw size={15} /> Find again</button>}</div>{node.materials.length ? <div className="materials">{node.materials.map((material) => <a key={material.id} className="material" href={material.url} target="_blank" rel="noreferrer"><span className="material-icon">{resourceIcon(material.resource_type)}</span><span><b>{material.title}</b><small>{material.resource_type} · found on the web</small></span><ExternalLink size={15} /></a>)}</div> : <div className="empty-materials"><BookOpen size={21} /><p>No field notes yet.</p>{!readOnly && <button className="quiet-button">Find resources</button>}</div>}</aside>
}

function ShareModal({ active, onClose, onToggle }: { active: boolean; onClose: () => void; onToggle: () => void }) {
  const [copied, setCopied] = useState(false)
  const copyLink = async () => { await navigator.clipboard?.writeText(`${window.location.origin}/share/${mockShareResponse.share_token}`); setCopied(true) }
  return <div className="modal-backdrop" role="presentation"><section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title"><button className="modal-close icon-button" onClick={onClose} aria-label="Close share dialog"><X size={18} /></button><span className="modal-symbol"><Link2 size={22} /></span><span className="eyebrow">Share this trail</span><h2 id="share-title">Bring a learning partner along.</h2>{active ? <><p>Anyone with this link can view the trail and its progress. They cannot change it.</p><div className="copy-link"><code>{`${window.location.origin}/share/${mockShareResponse.share_token}`}</code><button onClick={copyLink}>{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}</button></div><button className="danger-link" onClick={onToggle}>Stop sharing this trail</button></> : <><p>This share link is no longer active. You can open the trail to people with the link again whenever you are ready.</p><button className="primary-button" onClick={onToggle}>Turn sharing back on <ArrowRight size={17} /></button></>}</section></div>
}

function Landing({ onRoadmapCreated }: { onRoadmapCreated: (roadmap: Roadmap, todos: TodoItem[]) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sendMessage = async () => {
    const content = draft.trim(); if (!content || loading) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next); setDraft(''); setLoading(true); setError('')
    try { const response = await api.continueChat(next); setMessages(response.messages); setReady(response.ready_to_generate) }
    catch (error) { setError(error instanceof Error ? error.message : 'The assistant could not complete this request.') }
    finally { setLoading(false) }
  }
  const createRoadmap = async () => {
    if (loading) return
    setLoading(true); setError('')
    try { const roadmap = await api.createRoadmap(messages); const todos = await api.getTodos(roadmap.id).catch(() => ({ todos: [] as TodoItem[] })); onRoadmapCreated(roadmap, todos.todos) }
    catch (error) { setError(error instanceof Error ? error.message : 'The assistant could not create the roadmap.') }
    finally { setLoading(false) }
  }
  return <main className="landing"><header className="landing-nav"><button className="wordmark" onClick={() => navigate('/')}><span className="wordmark-mark"><Mountain size={18} /></span><span>roadmap<span>AI</span></span></button></header><div className="landing-grid"><section className="landing-copy"><span className="eyebrow"><span className="live-dot" /> connected to the live API</span><h1>Find the next<br /><em>useful</em> step.</h1><p>Describe where you want to go. RoadmapAI asks the right questions, then builds a practical learning plan from your answers.</p><div className="landing-proof"><span><Compass size={18} /> Personal learning path</span><span><Layers2 size={18} /> Built for your timeline</span></div></section><section className="intake-card"><div className="intake-header"><span className="eyebrow">Roadmap briefing</span><span className="read-only-pill">Live API</span></div><div className="chat-thread">{messages.length ? messages.map((message, index) => <div key={`${message.role}-${index}`} className={`bubble ${message.role}`}><span>{message.role === 'assistant' ? 'AI guide' : 'You'}</span><p>{message.content}</p></div>) : <div className="empty-materials"><BookOpen size={21} /><p>Start with your learning goal, experience, and timeframe.</p></div>}</div>{error && <p className="api-error">{error}</p>}{ready ? <div className="briefing-ready"><Sparkles size={18} /><div><b>Your roadmap is ready to create.</b><span>Review the conversation, then build it.</span></div><button className="primary-button" onClick={() => void createRoadmap()} disabled={loading}>Build roadmap <ArrowRight size={17} /></button></div> : <div className="chat-composer"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void sendMessage() }} placeholder="I want to learn Kubernetes for an interview…" disabled={loading} /><button className="primary-button" onClick={() => void sendMessage()} disabled={!draft.trim() || loading}>{loading ? 'Sending…' : 'Send'} <ArrowRight size={16} /></button></div>}</section></div></main>
}

function Workspace({ demo, setDemo, readOnly = false }: { demo: SavedDemo; setDemo: (next: SavedDemo) => void; readOnly?: boolean }) {
  const [selected, setSelected] = useState<RoadmapNode | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [editNote, setEditNote] = useState(false)
  const percent = progressOf(demo.todos)
  const updateRoadmap = (roadmap: Roadmap) => { setDemo({ ...demo, roadmap }); setSelected(roadmap.nodes.find((node) => node.id === selected?.id) ?? null) }
  const editTrail = () => {
    if (demo.edited) { setEditNote(true); return }
    const bridge: RoadmapNode = { id: 'nd_7', title: 'Debugging with kubectl', description: 'Read events, inspect logs, and turn a broken workload into an interview story.', position_x: 3, position_y: 1, status: 'not_started', materials: [{ id: 'mt_7', title: 'Debugging Kubernetes applications', url: 'https://kubernetes.io/docs/tasks/debug/debug-application/', resource_type: 'doc' }] }
    setDemo({ ...demo, edited: true, roadmap: { ...demo.roadmap, nodes: [...demo.roadmap.nodes.filter((node) => node.id !== 'nd_4'), bridge], edges: [...demo.roadmap.edges.filter((edge) => edge.target_node_id !== 'nd_4'), { source_node_id: 'nd_3', target_node_id: 'nd_7' }] } })
    setInstruction(''); setEditNote(true)
  }
  const cycleSelected = () => { if (!selected) return; const node = demo.roadmap.nodes.find((item) => item.id === selected.id); if (!node) return; const next = node.status === 'not_started' ? 'in_progress' : node.status === 'in_progress' ? 'done' : 'not_started'; updateRoadmap({ ...demo.roadmap, nodes: demo.roadmap.nodes.map((item) => item.id === node.id ? { ...item, status: next } : item) }) }
  return <main className="workspace"><Header percent={percent} readOnly={readOnly} onShare={() => setShareOpen(true)} /><div className="workspace-main"><aside className="rail"><div className="rail-title"><Map size={17} /><span>Trail map</span></div><nav><button className="rail-link active" onClick={() => navigate('/roadmap')}><Map size={18} /> Roadmap</button><button className="rail-link" onClick={() => navigate('/todos')}><Check size={18} /> To-do list <span>{demo.todos.filter((todo) => !todo.is_complete).length}</span></button></nav><div className="rail-footer"><span className="eyebrow">Current bearing</span><b>Interview readiness</b><p>6-week · Kubernetes</p></div></aside><section className="map-stage"><div className="map-heading"><div><span className="eyebrow">Kubernetes trail · 6 weeks</span><h1>{demo.roadmap.title}</h1></div><div className="map-actions"><button className="quiet-button" onClick={() => navigate('/todos')}><Check size={16} /> To-do list</button><button className="more-button" aria-label="More options"><MoreHorizontal size={20} /></button></div></div><Canvas roadmap={demo.roadmap} readOnly={readOnly} onRoadmap={updateRoadmap} onSelect={setSelected} />{!readOnly && <div className="edit-bar"><Sparkles size={18} /><input value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && instruction.trim()) editTrail() }} placeholder="Already know something? Want to add a topic?" /><button onClick={editTrail} disabled={!instruction.trim()}>Update trail <ArrowRight size={16} /></button></div>}{editNote && <div className="edit-toast"><Sparkles size={15} /> {demo.edited ? 'Trail updated: a debugging waypoint was added.' : 'That trail edit has already been mapped for this demo.'}</div>}</section>{selected && <DetailPanel node={selected} readOnly={readOnly} onClose={() => setSelected(null)} onCycle={cycleSelected} />}</div>{shareOpen && <ShareModal active={demo.shareActive} onClose={() => setShareOpen(false)} onToggle={() => setDemo({ ...demo, shareActive: !demo.shareActive })} />}</main>
}

function TodosPage({ demo, setDemo, readOnly = false }: { demo: SavedDemo; setDemo: (next: SavedDemo) => void; readOnly?: boolean }) {
  const percent = progressOf(demo.todos)
  return <main className="todos-page"><Header percent={percent} readOnly={readOnly} /><div className="todos-layout"><section className="todo-intro"><button className="back-link" onClick={() => navigate(readOnly ? `/share/${mockShareResponse.share_token}` : '/roadmap')}><ArrowLeft size={16} /> Back to trail map</button><span className="eyebrow">Trail log · 7 actions</span><h1>Keep moving<br />one <em>marker</em> at a time.</h1><p>Small, specific actions make the map real. Complete a marker and your compass advances.</p><CompassProgress percent={percent} /></section><section className="todo-list"><div className="todo-list-header"><div><span className="eyebrow">Your next moves</span><h2>{demo.todos.filter((todo) => !todo.is_complete).length} markers ahead</h2></div>{!readOnly && <button className="quiet-button"><RefreshCw size={15} /> Refresh list</button>}</div>{[...demo.todos].sort((a, b) => a.order_index - b.order_index).map((todo) => { const source = demo.roadmap.nodes.find((node) => node.id === todo.node_id); return <article className={`todo ${todo.is_complete ? 'complete' : ''}`} key={todo.id}><button className="todo-check" disabled={readOnly} onClick={() => setDemo({ ...demo, todos: demo.todos.map((item) => item.id === todo.id ? { ...item, is_complete: !item.is_complete } : item) })} aria-label={`Mark ${todo.title} ${todo.is_complete ? 'incomplete' : 'complete'}`}>{todo.is_complete && <Check size={15} />}</button><div><h3>{todo.title}</h3>{source ? <button className="source-link" onClick={() => navigate(readOnly ? `/share/${mockShareResponse.share_token}` : '/roadmap')}><Map size={14} /> {source.title}</button> : <span className="custom-label"><Flag size={13} /> Personal marker</span>}</div><span className="todo-index">{String(todo.order_index + 1).padStart(2, '0')}</span></article> })}</section></div></main>
}

function SharedUnavailable() { return <main className="unavailable"><div><span className="modal-symbol"><Link2 size={22} /></span><span className="eyebrow">Trail unavailable</span><h1>This shared trail<br />has been taken down.</h1><p>The owner has stopped sharing this roadmap. Ask them for a new link if you still need the route.</p><button className="primary-button" onClick={() => navigate('/')}>Explore RoadmapAI <ArrowRight size={17} /></button></div></main> }

function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [demo, setDemo] = useState(loadDemo)
  useEffect(() => { const listener = () => setPath(window.location.pathname); window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener) }, [])
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(demo)) }, [demo])
  useEffect(() => {
    let cancelled = false
    async function loadFromApi() {
      try {
        if (path.startsWith('/share/')) {
          const shared = await api.getSharedRoadmap(path.split('/').pop() ?? '')
          if (!cancelled) setDemo((current) => ({ ...current, roadmap: shared, todos: shared.todos, shareActive: true }))
          return
        }
        const roadmaps = await api.listRoadmaps()
        if (!roadmaps.length) return
        const [roadmap, todos] = await Promise.all([api.getRoadmap(roadmaps[0].id), api.getTodos(roadmaps[0].id)])
        if (!cancelled) setDemo((current) => ({ ...current, roadmap, todos: todos.todos, shareActive: Boolean(roadmap.share_token) }))
      } catch { /* Offline/demo mode keeps the bundled mock data visible. */ }
    }
    void loadFromApi()
    return () => { cancelled = true }
  }, [path])
  if (path.startsWith('/share/')) return demo.shareActive ? <Workspace demo={demo} setDemo={setDemo} readOnly /> : <SharedUnavailable />
  if (path === '/todos') return <TodosPage demo={demo} setDemo={setDemo} />
  if (path === '/roadmap') return <Workspace demo={demo} setDemo={setDemo} />
  return <Landing onRoadmapCreated={(roadmap, todos) => { setDemo((current) => ({ ...current, roadmap, todos, shareActive: Boolean(roadmap.share_token) })); navigate('/roadmap') }} />
}

export default App
