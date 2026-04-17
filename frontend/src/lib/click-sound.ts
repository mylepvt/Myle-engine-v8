let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    return ctx
  } catch { return null }
}

export function playClick() {
  const ac = getCtx()
  if (!ac) return
  // Short noise burst — mechanical key feel
  const bufLen = ac.sampleRate * 0.012 // 12ms
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufLen) * 0.18
  }
  const src = ac.createBufferSource()
  src.buffer = buf
  // Highpass filter for crisp click
  const filter = ac.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 1200
  src.connect(filter)
  filter.connect(ac.destination)
  src.start()
}
