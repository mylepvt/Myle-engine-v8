import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, PerspectiveCamera, type OrbitControls as OC } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { a, useSpring } from '@react-spring/three'
import * as THREE from 'three'
import { ALL_NODES, LAYER_CONFIG, LAYER_ORDER, type ArchNode } from './architecture-data'

const basePositions = new Map<string, THREE.Vector3>(ALL_NODES.map(n => [n.id, new THREE.Vector3(...n.position)]))
const dragPositions = new Map<string, THREE.Vector3>()

function getPos(id: string) { return dragPositions.get(id) ?? basePositions.get(id) ?? new THREE.Vector3() }

// ─── Edge definitions ───
interface Edge { from: string; to: string; color: string }
const allEdges: Edge[] = []
for (const n of ALL_NODES) {
  if (!n.connections) continue
  for (const cid of n.connections) {
    if (ALL_NODES.find(x => x.id === cid)) allEdges.push({ from: n.id, to: cid, color: n.color })
  }
}
const edgeSet = new Set(allEdges.map(e => `${e.from}-${e.to}`))

function getNodeEdges(nodeId: string): Edge[] {
  return allEdges.filter(e => e.from === nodeId || e.to === nodeId)
}

// ─── Connection Lines with highlight ───
function ConnectionLines({ visible, selectedId }: { visible: boolean; selectedId: string | null }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const dotsRef = useRef<THREE.Mesh[]>([])
  const arrowsRef = useRef<(THREE.Mesh | null)[]>([])
  const flowOffset = useRef(0)

  const highlightedEdges = useMemo(() => {
    if (!selectedId) return new Set<string>()
    return new Set(getNodeEdges(selectedId).map(e => `${e.from}-${e.to}`))
  }, [selectedId])

  const connections = useMemo(() => {
    return allEdges.map(e => ({
      fromNode: ALL_NODES.find(n => n.id === e.from)!,
      toNode: ALL_NODES.find(n => n.id === e.to)!,
      edge: e,
      isHighlighted: highlightedEdges.has(`${e.from}-${e.to}`),
    }))
  }, [highlightedEdges])

  useFrame((_, dt) => {
    if (!visible) return
    flowOffset.current += dt * 0.5
    for (let i = 0; i < connections.length; i++) {
      const mesh = refs.current[i]
      const dot = dotsRef.current[i]
      const arrow = arrowsRef.current[i]
      if (!mesh) continue
      const { fromNode, toNode, isHighlighted } = connections[i]
      const from = getPos(fromNode.id)
      const to = getPos(toNode.id)
      const mid = new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2 + 0.5, (from.z + to.z) / 2)
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to)
      const pts = curve.getPoints(16)
      const positions = pts.flatMap(p => [p.x, p.y, p.z])

      const geom = mesh.geometry as THREE.BufferGeometry
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geom.attributes.position.needsUpdate = true
      geom.computeBoundingSphere()

      const mat = mesh.material as THREE.MeshBasicMaterial
      if (isHighlighted) {
        mat.opacity = 0.7; mat.color.set('#ffffff')
      } else if (selectedId) {
        mat.opacity = 0.04; mat.color.set(fromNode.color)
      } else {
        mat.opacity = 0.25 + 0.08 * Math.sin(flowOffset.current + i)
        mat.color.set(fromNode.color)
      }

      // Flow dot
      if (dot && isHighlighted) {
        const t = (Math.sin(flowOffset.current * 2 + i) + 1) / 2
        const pt = pts[Math.floor(t * (pts.length - 1))] ?? pts[0]
        dot.position.copy(pt); dot.scale.setScalar(1)
      } else if (dot) { dot.scale.setScalar(0) }

      // Arrow at the end of the curve
      if (arrow) {
        const lastP = pts[pts.length - 1]
        const prevP = pts[pts.length - 3] ?? pts[0]
        const dir = new THREE.Vector3().copy(lastP).sub(prevP).normalize()
        arrow.position.copy(lastP)
        const up = new THREE.Vector3(0, 1, 0)
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir)
        arrow.quaternion.copy(quat)
        const arrowScale = isHighlighted ? 0.8 : 0.4
        const arrowOpacity = isHighlighted ? 0.9 : selectedId ? 0.04 : 0.35
        arrow.scale.setScalar(arrowScale)
        const arrowMat = arrow.material as THREE.MeshBasicMaterial
        arrowMat.opacity = arrowOpacity
        arrowMat.color.set(fromNode.color)
      }
    }
  })

  if (!visible) return null

  const coneGeo = useMemo(() => new THREE.ConeGeometry(0.2, 0.4, 6), [])

  return (
    <group>
      {connections.map((conn, i) => (
        <group key={`${conn.edge.from}-${conn.edge.to}`}>
          <mesh ref={(el: THREE.Mesh | null) => { refs.current[i] = el }}>
            <bufferGeometry />
            <meshBasicMaterial color={conn.edge.color} transparent opacity={0.2} depthWrite={false} />
          </mesh>
          <mesh ref={(el: THREE.Mesh | null) => { arrowsRef.current[i] = el! }}>
            <primitive object={coneGeo} />
            <meshBasicMaterial color={conn.edge.color} transparent opacity={0.4} depthWrite={false} />
          </mesh>
          <mesh ref={(el: THREE.Mesh | null) => { dotsRef.current[i] = el! }} scale={0}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ─── Rounded Box ───
const boxCache = new Map<string, THREE.BufferGeometry>()
function getBox(w: number, h: number, d: number) {
  const k = `${w}x${h}x${d}`
  if (!boxCache.has(k)) {
    const r = Math.min(w, h, d) * 0.2
    const shape = new THREE.Shape()
    const hw = w / 2, hh = h / 2
    shape.moveTo(-hw + r, -hh); shape.lineTo(hw - r, -hh)
    shape.quadraticCurveTo(hw, -hh, hw, -hh + r); shape.lineTo(hw, hh - r)
    shape.quadraticCurveTo(hw, hh, hw - r, hh); shape.lineTo(-hw + r, hh)
    shape.quadraticCurveTo(-hw, hh, -hw, hh - r); shape.lineTo(-hw, -hh + r)
    shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: r * 0.3, bevelSize: r * 0.2, bevelSegments: 4 })
    geo.translate(0, 0, -d / 2); geo.computeVertexNormals()
    boxCache.set(k, geo)
  }
  return boxCache.get(k)!
}

// ─── Layer Platform ───
function LayerPlat({ k: layer }: { k: string }) {
  const cfg = LAYER_CONFIG[layer]
  const ns = ALL_NODES.filter(n => n.layer === layer)
  if (!ns.length) return null
  const xs = ns.map(n => n.position[0])
  const zs = ns.map(n => n.position[2])
  const pad = 4
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2
  const d = Math.max(...zs) - Math.min(...zs) + pad * 2
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const cy = cfg.y - 0.5
  return (
    <group>
      <mesh position={[cx, cy, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={cfg.color} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Html position={[cx, cfg.y + 1, cz]} center>
        <div className="text-[11px] text-slate-600 font-medium tracking-wider whitespace-nowrap">{cfg.icon} {cfg.label}</div>
      </Html>
    </group>
  )
}

// ─── Node ───
function ArchNode({
  node, selectedId, hoveredId, searchActive, isMatch, onSelect, onHover, onFocus,
}: {
  node: ArchNode; selectedId: string | null; hoveredId: string | null
  searchActive: boolean; isMatch: boolean
  onSelect: (id: string | null) => void; onHover: (id: string | null) => void; onFocus: (id: string) => void
}) {
  const ref = useRef<THREE.Group>(null!)
  const [w, h, d] = node.size
  const isSel = selectedId === node.id
  const isHov = hoveredId === node.id

  const { scale, emissiveIntensity, nodeOpacity, glowOpacity } = useSpring({
    scale: isSel ? 1.08 : isHov ? 1.04 : 1,
    emissiveIntensity: isSel ? 0.6 : isMatch && searchActive ? 0.25 : 0.03,
    nodeOpacity: (searchActive && !isMatch) ? 0.15 : 1,
    glowOpacity: isSel ? 0.2 : isHov ? 0.1 : 0,
    config: { mass: 1, tension: 280, friction: 24 },
  })

  const drag = useRef({ active: false, plane: new THREE.Plane(), offset: new THREE.Vector3(), didMove: false })

  const handleDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const camDir = new THREE.Vector3(); e.camera.getWorldDirection(camDir)
    drag.current.plane.setFromNormalAndCoplanarPoint(camDir.clone().negate(), e.point.clone())
    drag.current.offset.copy(getPos(node.id)).sub(e.point.clone())
    drag.current.didMove = false; drag.current.active = true
  }, [node.id])

  const handleMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!drag.current.active) return
    if (Math.hypot(e.movementX, e.movementY) > 2) drag.current.didMove = true
    const pt = new THREE.Vector3(); e.ray.intersectPlane(drag.current.plane, pt)
    if (!pt) return
    const p = pt.add(drag.current.offset)
    dragPositions.set(node.id, p.clone())
    if (ref.current) ref.current.position.copy(p)
  }, [node.id])

  const handleUp = useCallback(() => {
    if (drag.current.active && drag.current.didMove) basePositions.set(node.id, getPos(node.id).clone())
    drag.current.active = false
  }, [node.id])

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!drag.current.didMove) onSelect(isSel ? null : node.id)
  }, [node.id, isSel, onSelect])

  const connCount = getNodeEdges(node.id).length
  const tagSlice = node.tags?.slice(0, 2) ?? []

  return (
    <a.group ref={ref} position={node.position} scale={scale}
      onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}
      onClick={handleClick} onDoubleClick={(e) => { e.stopPropagation(); onFocus(node.id) }}
      onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}
    >
      {/* Shadow */}
      <mesh position={[0, -12.3 - node.position[1], 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 1.5, d * 1.5]} />
        <meshBasicMaterial color="#000" transparent opacity={isHov ? 0.25 : 0.1} depthWrite={false} />
      </mesh>

      {/* Glow */}
      <mesh><primitive object={getBox(w * 1.06, h * 1.06, d * 1.06)} />
        <a.meshBasicMaterial color={node.color} transparent opacity={glowOpacity} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Body */}
      <mesh><primitive object={getBox(w, h, d)} />
        <a.meshPhysicalMaterial color={node.color} emissive={node.color} emissiveIntensity={emissiveIntensity}
          transparent opacity={nodeOpacity} metalness={0.12} roughness={0.4} clearcoat={isSel || isHov ? 0.3 : 0.1}
          clearcoatRoughness={0.3} envMapIntensity={0.4} />
      </mesh>

      {/* Label - Html for crisp text */}
      <Html position={[0, h / 2 + 0.5, 0]} center distanceFactor={8}>
        <div className="px-2 py-0.5 text-center pointer-events-none select-none" style={{ maxWidth: `${w * 8}px` }}>
          <div className="text-[13px] font-semibold text-white leading-tight truncate">{node.label}</div>
          {node.sublabel && <div className="text-[10px] text-slate-400 truncate">{node.sublabel}</div>}
        </div>
      </Html>

      {/* Tags */}
      {tagSlice.length > 0 && (
        <Html position={[0, -h / 2 - 0.4, 0]} center distanceFactor={8}>
          <div className="flex gap-1 pointer-events-none" style={{ opacity: isHov ? 1 : 0.5, transition: 'opacity 0.2s' }}>
            {tagSlice.map(t => <span key={t} className="text-[8px] bg-black/50 text-white/70 px-1.5 py-0.5 rounded font-mono">{t}</span>)}
          </div>
        </Html>
      )}

      {/* Connection count badge */}
      {connCount > 0 && (
        <Html position={[w / 2 + 0.3, 0, 0]} center distanceFactor={8}>
          <div className="text-[9px] text-slate-500 font-mono bg-slate-900/80 px-1.5 py-0.5 rounded-full pointer-events-none"
            style={{ opacity: isHov ? 0.8 : 0.3 }}>
            {connCount}
          </div>
        </Html>
      )}
    </a.group>
  )
}

// ─── Scene ───
function Scene({
  selectedId, hoveredId, searchQuery, visibleLayers, edgesVisible, autoRotate,
  onSelect, onHover, onFocus,
}: {
  selectedId: string | null; hoveredId: string | null; searchQuery: string
  visibleLayers: Set<string>; edgesVisible: boolean; autoRotate: boolean
  onSelect: (id: string | null) => void; onHover: (id: string | null) => void; onFocus: (id: string) => void
}) {
  const controlsRef = useRef<OC>(null!)
  const [focusId, setFocusId] = useState<string | null>(null)

  const searchActive = searchQuery.length > 0
  const q = searchQuery.toLowerCase()
  const matchIds = useMemo(() => {
    if (!searchActive) return new Set<string>()
    return new Set(ALL_NODES.filter(n =>
      n.label.toLowerCase().includes(q) || n.sublabel?.toLowerCase().includes(q) ||
      n.tags?.some(t => t.toLowerCase().includes(q)) || n.description?.toLowerCase().includes(q)
    ).map(n => n.id))
  }, [searchQuery, searchActive, q])

  const handleFocus = useCallback((id: string) => {
    setFocusId(id); setTimeout(() => setFocusId(null), 1200)
    onFocus(id)
  }, [onFocus])

  return (
    <>
      <PerspectiveCamera makeDefault position={[18, 11, 18]} fov={40} />
      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} minDistance={3} maxDistance={45}
        maxPolarAngle={Math.PI / 2.05} autoRotate={autoRotate} autoRotateSpeed={0.8} />

      <ambientLight intensity={0.35} />
      <directionalLight position={[20, 25, 15]} intensity={0.8} />
      <directionalLight position={[-12, 8, -10]} intensity={0.25} />
      <pointLight position={[0, 15, 0]} intensity={0.1} color="#6366f1" />
      <hemisphereLight args={['#1e293b', '#0f172a', 0.4]} />

      <gridHelper args={[40, 30, '#1e293b', '#0f172a']} position={[0, -12.3, 0]} />

      {LAYER_ORDER.map(l => visibleLayers.has(l) && <LayerPlat key={l} k={l} />)}

      <ConnectionLines visible={edgesVisible} selectedId={selectedId} />

      {ALL_NODES.map(node => {
        if (!visibleLayers.has(node.layer)) return null
        const isMatch = !searchActive || matchIds.has(node.id)
        return (
          <ArchNode key={node.id} node={node} selectedId={selectedId} hoveredId={hoveredId}
            searchActive={searchActive} isMatch={isMatch}
            onSelect={onSelect} onHover={onHover} onFocus={handleFocus} />
        )
      })}

      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={0.35} mipmapBlur />
      </EffectComposer>

      {/* Focus camera controller */}
      <CameraFocus targetId={focusId} />
    </>
  )
}

function CameraFocus({ targetId }: { targetId: string | null }) {
  const { camera, controls } = useThree()
  const oc = controls as OC | null

  useEffect(() => {
    if (!targetId || !oc) return
    const pos = getPos(targetId)
    oc.target.lerp(pos, 0.05)
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir)
    const dest = pos.clone().add(dir.multiplyScalar(6))
    const start = camera.position.clone()
    let t = 0
    const iv = setInterval(() => { t += 0.04; if (t >= 1) { t = 1; clearInterval(iv) }; camera.position.lerpVectors(start, dest, t * t * (3 - 2 * t)) }, 16)
    return () => clearInterval(iv)
  }, [targetId, camera, oc])

  return null
}

// ─── UI ───
function UIPanel({
  selectedId, searchQuery, setSearchQuery, visibleLayers, toggleLayer,
  edgesVisible, setEdgesVisible, autoRotate, setAutoRotate, onReset, onFocus,
}: {
  selectedId: string | null; searchQuery: string; setSearchQuery: (q: string) => void
  visibleLayers: Set<string>; toggleLayer: (l: string) => void
  edgesVisible: boolean; setEdgesVisible: (v: boolean) => void
  autoRotate: boolean; setAutoRotate: (v: boolean) => void
  onReset: () => void; onFocus: (id: string | null) => void
}) {
  const selNode = useMemo(() => ALL_NODES.find(n => n.id === selectedId) ?? null, [selectedId])

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-3.5 py-2.5 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
            <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search components..."
              className="w-36 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-300">✕</button>}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setAutoRotate(!autoRotate)}
              className={`rounded-lg px-2.5 py-1.5 text-xs backdrop-blur-md ring-1 transition-all ${
                autoRotate ? 'bg-blue-600/25 text-blue-300 ring-blue-500/25' : 'bg-slate-800/80 text-slate-400 ring-white/10 hover:bg-slate-700/80'
              }`}>{autoRotate ? '⏸ Pause' : '▶ Rotate'}</button>
            <button onClick={() => setEdgesVisible(!edgesVisible)}
              className={`rounded-lg px-2.5 py-1.5 text-xs backdrop-blur-md ring-1 transition-all ${
                edgesVisible ? 'bg-green-600/25 text-green-300 ring-green-500/25' : 'bg-slate-800/80 text-slate-400 ring-white/10 hover:bg-slate-700/80'
              }`}>{edgesVisible ? '◉ Lines' : '○ Lines'}</button>
            <button onClick={onReset}
              className="rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-400 backdrop-blur-md ring-1 ring-white/10 hover:bg-slate-700/80">↺ Reset</button>
            {selNode && (
              <button onClick={() => onFocus(selNode.id)}
                className="rounded-lg bg-indigo-600/25 px-2.5 py-1.5 text-xs text-indigo-300 backdrop-blur-md ring-1 ring-indigo-500/25">📷 Focus</button>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {LAYER_ORDER.map(layer => {
              const cfg = LAYER_CONFIG[layer]; const on = visibleLayers.has(layer)
              return (
                <button key={layer} onClick={() => toggleLayer(layer)}
                  className={`rounded-lg px-2 py-1 text-[10px] leading-none backdrop-blur-md ring-1 transition-all ${on ? 'text-white ring-white/20' : 'text-slate-600 ring-white/5 opacity-40'}`}
                  style={{ backgroundColor: on ? `${cfg.color}18` : 'transparent' }}>{cfg.icon} {cfg.label}</button>
              )
            })}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-slate-900/90 px-3.5 py-2.5 text-xs backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
          <span className="text-slate-500">{ALL_NODES.length} nodes</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">{allEdges.length} connections</span>
        </div>
      </div>

      {/* Node detail panel */}
      {selNode && (
        <div className="pointer-events-auto absolute bottom-4 right-4 z-10 w-80 rounded-2xl bg-slate-900/95 p-5 text-sm backdrop-blur-2xl ring-1 ring-white/10 shadow-2xl border border-white/5 max-h-[70vh] overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
          <div className="absolute -inset-px rounded-2xl opacity-20 pointer-events-none"
            style={{ background: `linear-gradient(135deg, ${selNode.color}40, transparent 60%)` }} />

          <div className="relative">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/10" style={{ backgroundColor: selNode.color }} />
              <h3 className="text-base font-semibold text-white">{selNode.label}</h3>
            </div>
            {selNode.sublabel && <p className="text-[11px] text-slate-500 mb-3">{selNode.sublabel}</p>}

            {selNode.description && (
              <p className="mb-4 text-xs leading-relaxed text-slate-300 bg-slate-800/40 rounded-lg px-3 py-2">{selNode.description}</p>
            )}

            {selNode.meta && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                {Object.entries(selNode.meta).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-800/40 px-2.5 py-2">
                    <p className="text-[8px] uppercase tracking-widest text-slate-500 mb-0.5">{k}</p>
                    <p className="text-xs font-medium text-slate-200 truncate">{v}</p>
                  </div>
                ))}
              </div>
            )}

            {selNode.tags && selNode.tags.length > 0 && (
              <div className="mb-4">
                <p className="text-[8px] uppercase tracking-widest text-slate-500 mb-1.5">Tech Stack</p>
                <div className="flex flex-wrap gap-1">
                  {selNode.tags.map(tag => (
                    <span key={tag} className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 ring-1 ring-white/5 font-mono">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Connections */}
            {selNode.connections && selNode.connections.length > 0 && (
              <div className="mb-3">
                <p className="text-[8px] uppercase tracking-widest text-slate-500 mb-2">Connected to ({selNode.connections.length})</p>
                <div className="flex flex-col gap-1.5">
                  {selNode.connections.map(cid => {
                    const c = ALL_NODES.find(n => n.id === cid)
                    return c ? (
                      <div key={cid} className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2 ring-1 ring-white/5">
                        <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-200 truncate">{c.label}</p>
                          <p className="text-[9px] text-slate-500 truncate">{c.sublabel ?? c.layer}</p>
                        </div>
                        <span className="text-[9px] text-slate-600 capitalize shrink-0">{c.layer.replace('-', ' ')}</span>
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-800 pt-2.5 text-[9px] text-slate-600">
              <span className="capitalize">{selNode.layer.replace('-', ' ')}</span>
              <span className="font-mono">{selNode.id}</span>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1.5">
        <div className="rounded-xl bg-slate-900/80 px-3.5 py-2.5 text-[11px] text-slate-500 backdrop-blur-xl ring-1 ring-white/10 shadow-lg">
          🖱 Drag · 🔄 Orbit · 🔍 Zoom · 👆 Select · 👆👆 Fly-to
        </div>
        <div className="rounded-xl bg-slate-900/70 px-3.5 py-2 text-[10px] text-slate-600 backdrop-blur-xl ring-1 ring-white/5 shadow-lg flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="text-slate-500">➡</span> data flow</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white/40"></span> selected connections</span>
        </div>
      </div>
    </>
  )
}

// ─── Main ───
export function ArchitectureViewer({
  selectedId: externalSelectedId, setSelectedId: externalSetSelectedId,
  searchQuery: externalSearchQuery, setSearchQuery: externalSetSearchQuery,
  visibleLayers: externalVisibleLayers, toggleLayer: externalToggleLayer,
  edgesVisible: externalEdgesVisible, setEdgesVisible: externalSetEdgesVisible,
  autoRotate: externalAutoRotate, setAutoRotate: externalSetAutoRotate,
  onFocus: externalOnFocus,
}: {
  selectedId?: string | null; setSelectedId?: (id: string | null) => void
  searchQuery?: string; setSearchQuery?: (q: string) => void
  visibleLayers?: Set<string>; toggleLayer?: (l: string) => void
  edgesVisible?: boolean; setEdgesVisible?: (v: boolean) => void
  autoRotate?: boolean; setAutoRotate?: (v: boolean) => void
  onFocus?: (id: string | null) => void
}) {
  const [iSel, iSetSel] = useState<string | null>(null)
  const [iQ, iSetQ] = useState('')
  const [iHov, iSetHov] = useState<string | null>(null)
  const [iRot, iSetRot] = useState(true)
  const [iEdg, iSetEdg] = useState(true)
  const [iLay, iSetLay] = useState(() => new Set(LAYER_ORDER))
  const [, force] = useState(0)

  const sid = externalSelectedId ?? iSel
  const sset = externalSetSelectedId ?? iSetSel
  const q = externalSearchQuery ?? iQ
  const sq = externalSetSearchQuery ?? iSetQ
  const hov = iHov
  const sHov = iSetHov
  const edg = externalEdgesVisible ?? iEdg
  const sedg = externalSetEdgesVisible ?? iSetEdg
  const rot = externalAutoRotate ?? iRot
  const srot = externalSetAutoRotate ?? iSetRot
  const layers = externalVisibleLayers ?? iLay

  const toggle = useCallback((l: string) => {
    if (externalToggleLayer) externalToggleLayer(l)
    else iSetLay(p => { const n = new Set(p); if (n.has(l)) { if (n.size > 1) n.delete(l) } else n.add(l); return n })
  }, [externalToggleLayer])

  const reset = useCallback(() => {
    dragPositions.clear()
    for (const [id, p] of basePositions) dragPositions.set(id, p.clone())
    sset(null); force(n => n + 1)
  }, [sset])

  const focus = useCallback((id: string | null) => {
    if (externalOnFocus) externalOnFocus(id)
    if (id) sset(id)
  }, [externalOnFocus, sset])

  return (
    <div className="relative h-full w-full" style={{ background: '#020617' }}>
      <Canvas dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <Scene selectedId={sid} hoveredId={hov} searchQuery={q} visibleLayers={layers}
          edgesVisible={edg} autoRotate={rot} onSelect={sset} onHover={sHov} onFocus={focus} />
      </Canvas>

      <UIPanel selectedId={sid} searchQuery={q} setSearchQuery={sq} visibleLayers={layers}
        toggleLayer={toggle} edgesVisible={edg} setEdgesVisible={sedg}
        autoRotate={rot} setAutoRotate={srot} onReset={reset} onFocus={focus} />
    </div>
  )
}
