/**
 * Client-side lead-capture poster generator.
 *
 * Composites a shareable portrait poster (1080×1350) on a canvas: gradient template
 * background + member name + headline + a scannable QR code of the capture link. No
 * server round-trip — returns a PNG data URL the member can download/share.
 */
import QRCode from 'qrcode'

export type PosterTemplate = {
  id: string
  name: string
  /** [top, bottom] gradient stops. */
  bg: [string, string]
  accent: string
  text: string
  headline: string
  subline: string
}

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    bg: ['#0f172a', '#1e3a8a'],
    accent: '#38bdf8',
    text: '#f8fafc',
    headline: 'Ready for a change?',
    subline: 'Scan to start your journey',
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    bg: ['#7c2d12', '#f59e0b'],
    accent: '#fde68a',
    text: '#fffbeb',
    headline: 'Build your second income',
    subline: 'Scan & let’s talk',
  },
  {
    id: 'forest',
    name: 'Forest',
    bg: ['#064e3b', '#10b981'],
    accent: '#d1fae5',
    text: '#ecfdf5',
    headline: 'Your future starts today',
    subline: 'Scan the code below',
  },
  {
    id: 'royal',
    name: 'Royal',
    bg: ['#3b0764', '#a21caf'],
    accent: '#f0abfc',
    text: '#fdf4ff',
    headline: 'Dream big. Start now.',
    subline: 'Scan to connect with me',
  },
]

const W = 1080
const H = 1350

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function buildLeadPoster(opts: {
  template: PosterTemplate
  ownerName: string
  url: string
}): Promise<string> {
  const { template, ownerName, url } = opts
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, template.bg[0])
  grad.addColorStop(1, template.bg[1])
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Headline
  ctx.fillStyle = template.text
  ctx.textAlign = 'center'
  ctx.font = '700 76px system-ui, -apple-system, Arial, sans-serif'
  ctx.fillText(template.headline, W / 2, 200)

  ctx.fillStyle = template.accent
  ctx.font = '500 42px system-ui, -apple-system, Arial, sans-serif'
  ctx.fillText(template.subline, W / 2, 280)

  // QR code rendered to its own canvas, then drawn onto a white card
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, url, { width: 560, margin: 1 })
  const qrSize = 560
  const cardPad = 40
  const cardW = qrSize + cardPad * 2
  const cardX = (W - cardW) / 2
  const cardY = 360
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, cardX, cardY, cardW, cardW, 48)
  ctx.fill()
  ctx.drawImage(qrCanvas, cardX + cardPad, cardY + cardPad, qrSize, qrSize)

  // Member name footer
  const name = (ownerName || 'Our team').trim()
  ctx.fillStyle = template.text
  ctx.font = '600 54px system-ui, -apple-system, Arial, sans-serif'
  ctx.fillText(name, W / 2, H - 180)

  ctx.fillStyle = template.accent
  ctx.font = '400 36px system-ui, -apple-system, Arial, sans-serif'
  ctx.fillText('Scan the QR or tap the link', W / 2, H - 110)

  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/**
 * Overlay a scannable QR badge onto a member's own uploaded poster.
 * Keeps the original artwork; draws a white rounded card with the QR in the
 * bottom-right corner. Returns a PNG data URL (capped to 1440px on the long edge).
 */
export async function buildPosterFromImageFile(
  file: File,
  url: string,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const maxEdge = 1440
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(img, 0, 0, w, h)

    const qrSize = Math.max(160, Math.round(Math.min(w, h) * 0.26))
    const pad = Math.round(qrSize * 0.08)
    const cardSize = qrSize + pad * 2
    const margin = Math.round(Math.min(w, h) * 0.03)
    const cardX = w - cardSize - margin
    const cardY = h - cardSize - margin

    const qrCanvas = document.createElement('canvas')
    await QRCode.toCanvas(qrCanvas, url, { width: qrSize, margin: 1 })

    ctx.fillStyle = '#ffffff'
    roundRect(ctx, cardX, cardY, cardSize, cardSize, Math.round(cardSize * 0.08))
    ctx.fill()
    ctx.drawImage(qrCanvas, cardX + pad, cardY + pad, qrSize, qrSize)

    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [head, b64] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], filename, { type: mime })
}

/** Share a poster image + message together (native share), or fall back to download + copy. */
export async function sharePosterOrFallback(
  posterFile: File,
  message: string,
): Promise<'shared' | 'fallback'> {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }
  if (nav.share && nav.canShare?.({ files: [posterFile] })) {
    try {
      await nav.share({ files: [posterFile], text: message })
      return 'shared'
    } catch {
      /* user cancelled or share failed — fall through to download */
    }
  }
  const dataUrl = URL.createObjectURL(posterFile)
  downloadDataUrl(dataUrl, posterFile.name)
  URL.revokeObjectURL(dataUrl)
  try {
    await navigator.clipboard.writeText(message)
  } catch {
    /* clipboard unavailable */
  }
  return 'fallback'
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
