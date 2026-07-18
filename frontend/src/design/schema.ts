export type RoadmapNodeState = 'not_started' | 'in_progress' | 'done'

export const designSchema = {
  color: {
    canvas: '#ffffff', surface: '#f8fafc', surfaceRaised: '#ffffff', border: '#d9dee7',
    ink: '#111827', mutedInk: '#64748b', green: '#16a34a', blue: '#2563eb', red: '#dc2626', focus: '#2563eb',
  },
  type: {
    ui: 'Inter, ui-sans-serif, system-ui, sans-serif', metadata: "'IBM Plex Mono', ui-monospace, monospace",
    heading: 'Inter, ui-sans-serif, system-ui, sans-serif', scale: { xs: '11px', sm: '12px', base: '14px', lg: '18px', xl: '26px', display: '38px' },
  },
  layout: {
    appBar: '64px', sidebar: '220px', panel: '360px', node: '224px', control: '36px',
    space: { xs: '6px', sm: '10px', md: '16px', lg: '24px', xl: '36px' }, radius: '4px', shadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
  },
  state: {
    not_started: { accent: '#94a3b8', background: '#f8fafc' }, in_progress: { accent: '#16a34a', background: '#f0fdf4' },
    done: { accent: '#2563eb', background: '#eff6ff' }, locked: { opacity: '0.52' }, hover: { border: '#16a34a' }, selected: { ring: '#2563eb' }, focus: { ring: '#2563eb' }, readOnly: { opacity: '0.72' },
  },
} as const

export const cssTokens: Record<string, string> = {
  '--color-canvas': designSchema.color.canvas, '--color-surface': designSchema.color.surface, '--color-surface-raised': designSchema.color.surfaceRaised,
  '--color-border': designSchema.color.border, '--color-ink': designSchema.color.ink, '--color-muted': designSchema.color.mutedInk,
  '--color-green': designSchema.color.green, '--color-blue': designSchema.color.blue, '--color-red': designSchema.color.red, '--color-focus': designSchema.color.focus,
  '--font-ui': designSchema.type.ui, '--font-meta': designSchema.type.metadata, '--font-heading': designSchema.type.heading,
  '--layout-appbar': designSchema.layout.appBar, '--layout-sidebar': designSchema.layout.sidebar, '--layout-panel': designSchema.layout.panel, '--layout-node': designSchema.layout.node, '--layout-control': designSchema.layout.control,
  '--radius': designSchema.layout.radius, '--shadow': designSchema.layout.shadow,
}

export function applyDesignTokens(root: HTMLElement = document.documentElement) {
  Object.entries(cssTokens).forEach(([name, value]) => root.style.setProperty(name, value))
}
