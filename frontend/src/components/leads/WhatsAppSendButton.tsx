import { useState, useRef, useEffect } from 'react'
import { MessageCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  personalHref: string | null
  businessHref: string | null
  prefillMessage?: string
  label?: string
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function WhatsAppSendButton({
  personalHref,
  businessHref,
  prefillMessage,
  label = 'Send on WhatsApp',
  size = 'sm',
  disabled = false,
}: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!personalHref && !businessHref) return null

  const sizeClasses = size === 'md' 
    ? 'px-3 py-2 text-sm'
    : 'px-2 py-1 text-xs'

  return (
    <div ref={menuRef} className="relative inline-flex">
      {personalHref && !businessHref ? (
        <a
          href={personalHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            sizeClasses,
            'inline-flex items-center gap-1.5 rounded-md border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {label}
        </a>
      ) : (
        <>
          <button
            onClick={() => {
              if (personalHref) window.open(personalHref, '_blank', 'noopener')
            }}
            disabled={disabled || !personalHref}
            className={cn(
              sizeClasses,
              'inline-flex items-center gap-1.5 rounded-l-md border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 disabled:opacity-50 disabled:cursor-not-allowed border-r-0'
            )}
            title={prefillMessage ? `Message: ${prefillMessage.substring(0, 50)}...` : label}
          >
            <MessageCircle className="h-4 w-4" />
            {label}
          </button>
          <button
            onClick={() => setShowMenu(!showMenu)}
            disabled={disabled}
            className={cn(
              'px-1',
              sizeClasses,
              'rounded-r-md border border-[#25D366]/30 bg-[#1ea34b]/10 text-[#1ea34b] hover:bg-[#1ea34b]/20 disabled:opacity-50 disabled:cursor-not-allowed border-l-0'
            )}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {showMenu && (
            <div className="absolute top-full right-0 mt-1 z-10 bg-muted border border-border dark:border-white/12 rounded-md overflow-hidden shadow-lg min-w-[200px]">
              {personalHref && (
                <a
                  href={personalHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowMenu(false)}
                  className="block px-3 py-2 text-xs hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] text-foreground border-b border-border dark:border-white/12"
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" style={{ color: '#25D366' }} />
                    <span>WhatsApp Personal</span>
                  </div>
                  {prefillMessage && (
                    <div className="text-[color-mix(in_srgb,var(--foreground)_50%,transparent)] text-[0.65rem] mt-1 line-clamp-2">
                      {prefillMessage}
                    </div>
                  )}
                </a>
              )}
              {businessHref && (
                <a
                  href={businessHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowMenu(false)}
                  className="block px-3 py-2 text-xs hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" style={{ color: '#00a884' }} />
                    <span>WhatsApp Business</span>
                  </div>
                  {prefillMessage && (
                    <div className="text-[color-mix(in_srgb,var(--foreground)_50%,transparent)] text-[0.65rem] mt-1 line-clamp-2">
                      {prefillMessage}
                    </div>
                  )}
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
