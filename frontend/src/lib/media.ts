import { apiUrl } from '@/lib/api'
import { extractYouTubeId } from '@/lib/youtube'

/** Training hub; `?lesson=<id>` opens one lesson. */
export const TRAINING_PATH = '/dashboard/system/training'

/** YouTube thumbnail for a video link, or null when it isn't a YouTube URL. */
export function thumbFor(url: string | null | undefined): string | null {
  const id = url ? extractYouTubeId(url) : null
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
}

/** "Day 3 · Prospecting", unless the title already names its day. */
export function dayCaption(day: number, title: string): string {
  return /^day\s*\d/i.test(title.trim()) ? title : `Day ${day} · ${title}`
}

/** Server-made covers: the video link itself never reaches the browser. */
export function lessonThumbUrl(lessonId: number): string {
  return apiUrl(`/api/v1/system/skills-training/lessons/${lessonId}/thumbnail`)
}

export function trainingDayThumbUrl(dayNumber: number): string {
  return apiUrl(`/api/v1/system/training/day/${dayNumber}/thumbnail`)
}

/** First-page / image cover for a PDF or image download; null for other file types. */
export function downloadCoverUrl(item: { id: number; mime_type: string; filename: string }): string | null {
  const name = item.filename.toLowerCase()
  const coverable = item.mime_type === 'application/pdf' || item.mime_type.startsWith('image/') || /\.(pdf|png|jpe?g)$/.test(name)
  return coverable ? apiUrl(`/api/v1/downloads/${item.id}/cover`) : null
}
