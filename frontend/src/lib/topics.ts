import {
  FileImage,
  FileText,
  FileVideo,
  GraduationCap,
  Handshake,
  Headphones,
  Megaphone,
  MessageCircleWarning,
  PhoneCall,
  Route,
  Send,
  Sparkles,
  Sprout,
  Trophy,
  Video,
  type LucideIcon,
} from 'lucide-react'

/**
 * Library / Home tiles carry a small topic icon on a tinted wash instead of a
 * picture. Keys are the skill category keys from the API plus a few content kinds.
 * `tone` is the CSS class that sets the tint (see `.jw-tone-*` in jw-theme.css).
 */
export type Topic = { icon: LucideIcon; tone: string }

const TOPICS: Record<string, Topic> = {
  onboarding: { icon: GraduationCap, tone: 'jw-tone-lavender' },
  personal_development: { icon: Sprout, tone: 'jw-tone-green' },
  process: { icon: Route, tone: 'jw-tone-blue' },
  invitation: { icon: Send, tone: 'jw-tone-cyan' },
  follow_up: { icon: PhoneCall, tone: 'jw-tone-amber' },
  bond_creation: { icon: Handshake, tone: 'jw-tone-pink' },
  mistakes: { icon: MessageCircleWarning, tone: 'jw-tone-red' },
  closing: { icon: Trophy, tone: 'jw-tone-gold' },
  academy: { icon: Sparkles, tone: 'jw-tone-lavender' },
  prospect_video: { icon: Video, tone: 'jw-tone-lavender' },
  notice: { icon: Megaphone, tone: 'jw-tone-amber' },
  document: { icon: FileText, tone: 'jw-tone-slate' },
  image: { icon: FileImage, tone: 'jw-tone-slate' },
  video_file: { icon: FileVideo, tone: 'jw-tone-slate' },
  audio: { icon: Headphones, tone: 'jw-tone-cyan' },
}

export function topicFor(key: string): Topic {
  return TOPICS[key] ?? TOPICS.document
}

// Words in a document's title that point at a skill topic (checked in order).
const TITLE_TOPICS: [RegExp, string][] = [
  [/invit|prospect list|approach/i, 'invitation'],
  [/follow[\s-]?up|reminder/i, 'follow_up'],
  [/bond|trust|relationship|rapport/i, 'bond_creation'],
  [/clos(e|ing)|objection|decision/i, 'closing'],
  [/mistake|do'?s|don'?t/i, 'mistakes'],
  [/process|flow|step|stage|plan/i, 'process'],
  [/mindset|habit|discipline|growth|personal/i, 'personal_development'],
  [/onboard|training|day\s*\d/i, 'onboarding'],
]

/** Audio files live in Library › Audio, not with the documents. */
export function isAudioDownload(item: { mime_type: string; filename: string }): boolean {
  return item.mime_type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg)$/i.test(item.filename)
}

/** Topic key for a download: audio, else a skill topic its title names, else its file type. */
export function documentTopicKey(item: { title?: string; mime_type: string; filename: string }): string {
  if (isAudioDownload(item)) return 'audio'
  const title = item.title ?? ''
  const hit = TITLE_TOPICS.find(([re]) => re.test(title))
  if (hit) return hit[1]
  const name = item.filename.toLowerCase()
  if (item.mime_type.startsWith('image/') || /\.(png|jpe?g)$/.test(name)) return 'image'
  if (item.mime_type.startsWith('video/') || name.endsWith('.mp4')) return 'video_file'
  return 'document'
}
