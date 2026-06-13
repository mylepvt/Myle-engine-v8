import { useCallback, useState } from 'react'
import { ArchitectureViewer } from '@/components/Architecture3D/ArchitectureViewer'
import { Architecture2D } from '@/components/Architecture3D/Architecture2D'
import { ALL_NODES, LAYER_CONFIG, LAYER_ORDER } from '@/components/Architecture3D/architecture-data'

export function Architecture3DPage() {
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleLayers, setVisibleLayers] = useState(() => new Set(LAYER_ORDER))
  const [edgesVisible, setEdgesVisible] = useState(true)
  const [autoRotate, setAutoRotate] = useState(true)

  const toggleLayer = useCallback((layer: string) => {
    setVisibleLayers(prev => {
      const next = new Set(prev)
      if (next.has(layer)) { if (next.size > 1) next.delete(layer) }
      else next.add(layer)
      return next
    })
  }, [])

  const handleFocus = useCallback((id: string | null) => {
    if (id) setSelectedId(id)
  }, [])


  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 flex flex-col">
      {/* Top bar with mode toggle and shared controls */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-white/5">
        <div className="flex items-center gap-3">
          {/* 2D/3D toggle */}
          <div className="flex rounded-lg bg-slate-800 p-0.5 ring-1 ring-white/10">
            <button
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                viewMode === '3d' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >3D</button>
            <button
              onClick={() => setViewMode('2d')}
              className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                viewMode === '2d' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >2D</button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-800/80 px-3 py-1.5 ring-1 ring-white/10">
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-32 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
            )}
          </div>

          {/* Layer toggles */}
          <div className="hidden md:flex items-center gap-1">
            {LAYER_ORDER.map(layer => {
              const cfg = LAYER_CONFIG[layer]
              const on = visibleLayers.has(layer)
              return (
                <button key={layer} onClick={() => toggleLayer(layer)}
                  className={`rounded-md px-2 py-1 text-[9px] leading-none transition-all ${
                    on ? 'text-white ring-1 ring-white/20' : 'text-slate-600 opacity-40'
                  }`}
                  style={{ backgroundColor: on ? `${cfg.color}18` : 'transparent' }}>
                  {cfg.icon}
                </button>
              )
            })}
          </div>

          {/* Step flow indicator */}
          <div className="hidden lg:flex items-center gap-1 text-[9px] text-slate-500">
            <span className="inline-flex items-center gap-0.5">
              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[7px] font-bold flex items-center justify-center">1</span>
              <span className="text-slate-600">→</span>
              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[7px] font-bold flex items-center justify-center">2</span>
              <span className="text-slate-600">→</span>
              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[7px] font-bold flex items-center justify-center">3</span>
              <span className="text-slate-600">→</span>
              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[7px] font-bold flex items-center justify-center">4</span>
              <span className="text-slate-600">→</span>
              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[7px] font-bold flex items-center justify-center">5</span>
            </span>
            <span className="ml-1">flow</span>
          </div>

          {/* View-specific toggles */}
          {viewMode === '3d' && (
            <button onClick={() => setAutoRotate(!autoRotate)}
              className={`rounded-md px-2 py-1 text-[10px] transition-all ${
                autoRotate ? 'bg-blue-600/20 text-blue-300' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {autoRotate ? '⏸' : '▶'}
            </button>
          )}
          <button onClick={() => setEdgesVisible(!edgesVisible)}
            className={`rounded-md px-2 py-1 text-[10px] transition-all ${
              edgesVisible ? 'bg-green-600/20 text-green-300' : 'text-slate-500 hover:text-slate-300'
            }`}>
            {edgesVisible ? '◉' : '○'} Lines
          </button>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span>{ALL_NODES.length} nodes</span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-600">{viewMode === '3d' ? '🔄 Drag free' : '🖱 Drag nodes'}</span>
        </div>
      </div>

      {/* View container */}
      <div className="flex-1 relative">
        {viewMode === '3d' ? (
          <ArchitectureViewer
            selectedId={selectedId} setSelectedId={setSelectedId}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            visibleLayers={visibleLayers} toggleLayer={toggleLayer}
            edgesVisible={edgesVisible} setEdgesVisible={setEdgesVisible}
            autoRotate={autoRotate} setAutoRotate={setAutoRotate}
            onFocus={handleFocus}
          />
        ) : (
          <Architecture2D
            selectedId={selectedId} setSelectedId={setSelectedId}
            searchQuery={searchQuery} visibleLayers={visibleLayers} edgesVisible={edgesVisible}
            onFocus={handleFocus}
          />
        )}
      </div>
    </div>
  )
}
