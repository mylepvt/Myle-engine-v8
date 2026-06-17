import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ALL_NODES, LAYER_CONFIG, LAYER_ORDER } from './architecture-data'

const NODE_W = 180
const NODE_H = 76
const GAP_X = 24
const LAYER_H = 120

interface LP { x: number; y: number; w: number; h: number }
const nodeLayout = new Map<string, LP>()

for (const layer of LAYER_ORDER) {
  const nodes = ALL_NODES.filter(n => n.layer === layer)
  const tw = nodes.length * NODE_W + (nodes.length - 1) * GAP_X
  const sx = -tw / 2 + NODE_W / 2
  const ly = LAYER_ORDER.indexOf(layer) * LAYER_H + 85
  nodes.forEach((n, i) => nodeLayout.set(n.id, { x: sx + i * (NODE_W + GAP_X), y: ly, w: NODE_W, h: NODE_H }))
}

interface Conn { from: string; to: string; color: string; fromLabel: string; toLabel: string }
const allConns: Conn[] = []
for (const n of ALL_NODES) {
  if (!n.connections) continue
  for (const cid of n.connections) {
    const t = ALL_NODES.find(x => x.id === cid)
    if (t) allConns.push({ from: n.id, to: cid, color: n.color, fromLabel: n.label, toLabel: t.label })
  }
}

const STEPS = [
  { num: 1, title: 'User opens app', desc: 'Mobile ya browser se app kholta hai', layer: 'frontend' },
  { num: 2, title: 'UI loads data', desc: 'React/Next.js server se data mangata hai', layer: 'frontend' },
  { num: 3, title: 'API processes request', desc: 'FastAPI / Fastify request handle karta hai', layer: 'api-gateway' },
  { num: 4, title: 'Backend business logic', desc: 'Services + background jobs kaam karte hain', layer: 'backend' },
  { num: 5, title: 'Database & Cache', desc: 'PostgreSQL + Redis store/cache karte hain', layer: 'infra' },
  { num: 6, title: 'External Integrations', desc: 'WhatsApp, n8n, Cloudflare se connect hota hai', layer: 'external' },
]

// ─── Connection paths ───
function ConnPaths({ visible, selectedId }: { visible: boolean; selectedId: string | null }) {
  const groups = useMemo(() => {
    const m = new Map<string, typeof allConns>()
    for (const c of allConns) {
      const fn = ALL_NODES.find(n => n.id === c.from)!
      const tn = ALL_NODES.find(n => n.id === c.to)!
      const k = `${fn.layer}→${tn.layer}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(c)
    }
    return Array.from(m.entries())
  }, [])

  if (!visible) return null

  const pathD = (x1: number, y1: number, x2: number, y2: number) => {
    const d = Math.abs(y2 - y1)
    const cp = Math.max(d * 0.4, 30)
    const yDir = y2 > y1 ? 1 : -1
    return `M ${x1} ${y1} C ${x1} ${y1 + cp * yDir}, ${x2} ${y2 - cp * yDir}, ${x2} ${y2}`
  }

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
      <defs>
        {Array.from(new Set(allConns.map(c => c.color))).map((color, i) => (
          <marker key={i} id={`a2-${color.replace('#', '')}`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
            <polygon points="0 0, 10 3.5, 0 7" fill={color} opacity="0.6" />
          </marker>
        ))}
      </defs>

      {groups.map(([key, conns]) => {
        const [fl, tl] = key.split('→')
        const midX = conns.reduce((s, c) => s + ((nodeLayout.get(c.from)?.x ?? 0) + (nodeLayout.get(c.to)?.x ?? 0)) / 2, 0) / conns.length
        const midY = conns.reduce((s, c) => s + ((nodeLayout.get(c.from)?.y ?? 0) + (nodeLayout.get(c.to)?.y ?? 0)) / 2, 0) / conns.length

        return (
          <g key={key}>
            <text x={midX} y={midY - 12} textAnchor="middle" fill={LAYER_CONFIG[fl as keyof typeof LAYER_CONFIG]?.color ?? '#475569'} fontSize="7" fontWeight={600} fontFamily="monospace" opacity={0.4}>
              {fl.replace('-', ' ')} → {tl.replace('-', ' ')}
            </text>
            {conns.map((c) => {
              const f = nodeLayout.get(c.from); const t = nodeLayout.get(c.to)
              if (!f || !t) return null
              const x1 = f.x, y1 = f.y + f.h / 2
              const x2 = t.x, y2 = t.y - t.h / 2
              const hl = selectedId && (c.from === selectedId || c.to === selectedId)
              const dm = selectedId && !hl
              const op = hl ? 1 : dm ? 0.03 : 0.35
              const sw = hl ? 2.5 : 1.2

              return (
                <g key={`${c.from}-${c.to}`}>
                  {hl && <path d={pathD(x1, y1, x2, y2)} fill="none" stroke={c.color} strokeWidth="6" opacity="0.15" strokeLinecap="round" />}
                  <path d={pathD(x1, y1, x2, y2)} fill="none" stroke={c.color} strokeWidth={sw} opacity={op} strokeLinecap="round"
                    markerEnd={`url(#a2-${c.color.replace('#', '')})`} />
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Node card ───
function NodeCard({
  node, lp, sel, hov, searchActive, isMatch, onSelect, onHover,
}: {
  node: typeof ALL_NODES[number]; lp: LP; sel: boolean; hov: boolean; searchActive: boolean; isMatch: boolean
  onSelect: (id: string | null) => void; onHover: (id: string | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: lp.x, y: lp.y })
  const [dragging, setDragging] = useState(false)
  const drag = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false })

  useEffect(() => { setPos({ x: lp.x, y: lp.y }) }, [lp.x, lp.y])

  const hd = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false }
    setDragging(true)
  }, [pos])
  const hm = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return
    if (Math.hypot(e.clientX - drag.current.sx, e.clientY - drag.current.sy) > 4) drag.current.moved = true
    setPos({ x: drag.current.ox + (e.clientX - drag.current.sx), y: drag.current.oy + (e.clientY - drag.current.sy) })
  }, [])
  const hu = useCallback(() => { drag.current.active = false; setDragging(false) }, [])
  const hc = useCallback(() => { if (!drag.current.moved) onSelect(sel ? null : node.id) }, [node.id, sel, onSelect])

  const dim = searchActive && !isMatch
  return (
    <div ref={ref} data-node onPointerDown={hd} onPointerMove={hm} onPointerUp={hu}
      onClick={hc} onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}
      style={{
        position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)',
        width: lp.w, zIndex: sel ? 100 : hov ? 50 : 10, opacity: dim ? 0.1 : 1, cursor: 'grab',
        transition: dragging ? 'none' : 'box-shadow 0.2s, transform 0.15s',
      }}>
      <div className={`rounded-lg border transition-all bg-slate-900/90 backdrop-blur-sm ${sel ? 'ring-2' : hov ? 'ring-1' : ''}`}
        style={{
          borderColor: sel ? node.color : `${node.color}25`,
          boxShadow: sel ? `0 0 40px ${node.color}20, 0 8px 32px rgba(0,0,0,0.5)` : hov ? `0 0 15px ${node.color}10, 0 4px 16px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.2)',
          transform: sel ? 'scale(1.04)' : hov ? 'scale(1.02)' : 'scale(1)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}>
        <div className="h-0.5 rounded-t-lg" style={{ backgroundColor: node.color }} />
        <div className="p-2.5">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/20" style={{ backgroundColor: node.color }} />
            <h3 className="text-xs font-semibold text-white truncate">{node.label}</h3>
          </div>
          {node.sublabel && <p className="text-[9px] text-slate-500 truncate ml-4">{node.sublabel}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Fixed step sidebar ───
function StepSidebar({ selectedLayer, onStepClick }: { selectedLayer: string | null; onStepClick: (layer: string) => void }) {
  return (
    <div className="flex flex-col gap-1 py-2">
      {STEPS.map((step) => {
        const active = selectedLayer === step.layer
        // Find the layer color
        const cfg = LAYER_CONFIG[step.layer as keyof typeof LAYER_CONFIG]
        return (
          <button key={step.num} onClick={() => onStepClick(step.layer)}
            className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
              active ? 'bg-indigo-500/10 ring-1 ring-indigo-500/20' : 'hover:bg-slate-800/50'
            }`}>
            <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${
              active ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-800 text-slate-500'
            }`}>
              {step.num}
            </span>
            <div className="min-w-0">
              <div className={`text-[11px] font-medium leading-tight ${active ? 'text-white' : 'text-slate-400'}`}>{step.title}</div>
              <div className="text-[8px] text-slate-600 mt-0.5 leading-tight">{step.desc}</div>
              {/* Layer color dot */}
              {cfg && <span className="inline-block w-1.5 h-1.5 rounded-full mt-1" style={{ backgroundColor: cfg.color }} />}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Detail Panel ───
function DetailPanel({ node }: { node: typeof ALL_NODES[number] | null }) {
  if (!node) return null
  return (
    <div className="w-72 rounded-xl bg-slate-900/95 p-4 text-sm backdrop-blur-xl ring-1 ring-white/10 shadow-2xl border border-white/5 max-h-[60vh] overflow-y-auto"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
      <div className="absolute -inset-px rounded-xl opacity-20 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${node.color}40, transparent 60%)` }} />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/10" style={{ backgroundColor: node.color }} />
          <h3 className="text-sm font-semibold text-white">{node.label}</h3>
        </div>
        {node.sublabel && <p className="text-[10px] text-slate-500 mb-2">{node.sublabel}</p>}
        {node.description && <p className="mb-3 text-[11px] leading-relaxed text-slate-300 bg-slate-800/40 rounded-lg px-2.5 py-2">{node.description}</p>}
        {node.tags && node.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {node.tags.map(t => <span key={t} className="rounded-md bg-slate-800 px-2 py-0.5 text-[9px] text-slate-300 ring-1 ring-white/5 font-mono">{t}</span>)}
          </div>
        )}
        {node.connections && node.connections.length > 0 && (
          <div>
            <p className="text-[8px] uppercase tracking-widest text-slate-500 mb-1.5">Connections ({node.connections.length})</p>
            <div className="flex flex-col gap-1">
              {node.connections.map(cid => {
                const c = ALL_NODES.find(n => n.id === cid)
                return c ? (
                  <div key={cid} className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-2.5 py-1.5 ring-1 ring-white/5">
                    <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-200 truncate">{c.label}</p>
                      <p className="text-[8px] text-slate-500 truncate">{c.sublabel ?? c.layer}</p>
                    </div>
                  </div>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ───
export function Architecture2D({
  selectedId, setSelectedId, searchQuery, visibleLayers, edgesVisible,
}: {
  selectedId: string | null; setSelectedId: (id: string | null) => void
  searchQuery: string; visibleLayers: Set<string>; edgesVisible: boolean
  onFocus?: (id: string | null) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 370, y: 80 })
  const [zoom, setZoom] = useState(0.85)
  const containerRef = useRef<HTMLDivElement>(null)
  const bgDrag = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 })

  const q = searchQuery.toLowerCase()
  const matchIds = useMemo(() => {
    if (!searchQuery) return new Set<string>()
    return new Set(ALL_NODES.filter(n =>
      n.label.toLowerCase().includes(q) || n.sublabel?.toLowerCase().includes(q) ||
      n.tags?.some(t => t.toLowerCase().includes(q)) || n.description?.toLowerCase().includes(q)
    ).map(n => n.id))
  }, [searchQuery, q])
  const searchActive = searchQuery.length > 0

  const hdBg = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    bgDrag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y }
  }, [pan])
  const hmBg = useCallback((e: React.PointerEvent) => {
    if (!bgDrag.current.active) return; setPan({ x: bgDrag.current.ox + (e.clientX - bgDrag.current.sx), y: bgDrag.current.oy + (e.clientY - bgDrag.current.sy) })
  }, [])
  const huBg = useCallback(() => { bgDrag.current.active = false }, [])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const h = (e: WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(0.3, Math.min(3, z - e.deltaY * 0.0015))) }
    el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h)
  }, [])

  const selNode = useMemo(() => ALL_NODES.find(n => n.id === selectedId) ?? null, [selectedId])
  const selectedLayer = selNode?.layer ?? null

  const handleStepClick = useCallback((layer: string) => {
    // Find first node in this layer and select it
    const node = ALL_NODES.find(n => n.layer === layer)
    if (node) setSelectedId(node.id)
  }, [setSelectedId])

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950 flex">
      {/* ─── FIXED LEFT SIDEBAR (always visible) ─── */}
      <div className="w-52 shrink-0 border-r border-white/5 bg-slate-900/50 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b transparent' }}>
        {/* Header */}
        <div className="px-4 pt-3 pb-1 border-b border-white/5">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Step Flow</div>
          <div className="text-[8px] text-slate-600 mt-0.5">Pehle → Phir → Phir → Phir</div>
        </div>
        <StepSidebar selectedLayer={selectedLayer} onStepClick={handleStepClick} />
        {/* Legend */}
        <div className="px-4 pt-2 pb-3 border-t border-white/5 mt-1">
          <div className="text-[8px] text-slate-600 leading-relaxed">
            <div className="flex items-center gap-1 mb-1"><span className="text-slate-500">▶</span> arrow = data direction</div>
            <div className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 rounded bg-slate-600"></span> curved line = connection</div>
            <div className="flex items-center gap-1 mt-1"><span className="text-indigo-400">①→②→③</span> step flow</div>
          </div>
        </div>
        {/* Stats */}
        <div className="px-4 py-2 text-[8px] text-slate-600 border-t border-white/5">
          {ALL_NODES.length} components · {allConns.length} connections
          <br />🖱 drag node · 🔍 scroll zoom
        </div>
      </div>

      {/* ─── MAIN DIAGRAM ─── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Dot grid background */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle, #94a3b8 0.5px, transparent 0.5px)', backgroundSize: '25px 25px' }} />

        <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onPointerDown={hdBg} onPointerMove={hmBg} onPointerUp={huBg}>
          <div style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0', width: 1, height: 1, position: 'relative',
          }}>
            {/* Layer backgrounds */}
            {LAYER_ORDER.map(layer => {
              if (!visibleLayers.has(layer)) return null
              const cfg = LAYER_CONFIG[layer as keyof typeof LAYER_CONFIG]
              const lns = ALL_NODES.filter(n => n.layer === layer)
              if (!lns.length) return null
              const xs = lns.map(n => nodeLayout.get(n.id)!.x)
              const y = nodeLayout.get(lns[0].id)!.y
              const minX = Math.min(...xs) - 100; const maxX = Math.max(...xs) + 100
              const stepInfo = STEPS.find(s => s.layer === layer)
              return (
                <div key={layer} style={{
                  position: 'absolute', left: minX, top: y - 42, width: maxX - minX, height: 84,
                  borderRadius: 12, backgroundColor: `${cfg.color}08`, border: `1px solid ${cfg.color}12`, pointerEvents: 'none',
                }}>
                  <div className="flex items-center gap-2 px-3 pt-1.5">
                    {stepInfo && (
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[7px] font-bold ring-1 ring-indigo-500/30">
                        {stepInfo.num}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cfg.color }}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                  {stepInfo && <div className="px-3 text-[7px] text-slate-500 mt-0.5">{stepInfo.desc}</div>}
                  <div className="px-3 text-[7px] text-slate-600 mt-0.5">{lns.length} components</div>
                </div>
              )
            })}

            {/* Flow arrows between layers */}
            <svg style={{ position: 'absolute', left: -80, top: 0, width: 40, height: LAYER_ORDER.length * LAYER_H + 120, pointerEvents: 'none', overflow: 'visible' }}>
              {LAYER_ORDER.map((layer, i) => {
                if (i >= LAYER_ORDER.length - 1) return null
                if (!visibleLayers.has(layer) || !visibleLayers.has(LAYER_ORDER[i + 1])) return null
                const y1 = (i + 0.8) * LAYER_H + 85
                const y2 = (i + 1) * LAYER_H + 55
                return (
                  <g key={layer}>
                    <line x1="20" y1={y1} x2="20" y2={y2} stroke="#475569" strokeWidth="2" strokeDasharray="5,3" opacity="0.3" />
                    <polygon points="14,50 20,62 26,50" fill="#475569" opacity="0.3" transform={`translate(0, ${y2 - 50})`} />
                    <text x="20" y={(y1 + y2) / 2 + 3} textAnchor="middle" fill="#334155" fontSize="7" fontFamily="monospace" opacity="0.5">
                      {STEPS[i]?.num ?? ''}→{STEPS[i + 1]?.num ?? ''}
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* Connection paths */}
            <ConnPaths visible={edgesVisible} selectedId={selectedId} />

            {/* Nodes */}
            {ALL_NODES.map(node => {
              if (!visibleLayers.has(node.layer)) return null
              const lp = nodeLayout.get(node.id)!; const m = !searchActive || matchIds.has(node.id)
              return (
                <div key={node.id} data-node="true">
                  <NodeCard node={node} lp={lp} sel={selectedId === node.id} hov={hoveredId === node.id}
                    searchActive={searchActive} isMatch={m} onSelect={setSelectedId} onHover={setHoveredId} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 left-3 z-10 flex items-center gap-2 rounded-lg bg-slate-900/80 px-2.5 py-1.5 backdrop-blur-xl ring-1 ring-white/10 shadow-lg">
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} className="text-slate-400 hover:text-white text-xs leading-none">−</button>
          <span className="text-[10px] text-slate-500 w-7 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="text-slate-400 hover:text-white text-xs leading-none">+</button>
          <button onClick={() => { setZoom(0.85); setPan({ x: 370, y: 80 }) }} className="ml-1 text-[9px] text-slate-500 hover:text-slate-300">↺</button>
        </div>

        {/* Detail panel */}
        {selNode && (
          <div className="absolute bottom-4 right-3 z-10">
            <DetailPanel node={selNode} />
          </div>
        )}
      </div>
    </div>
  )
}
