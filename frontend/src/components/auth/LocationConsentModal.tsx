import { useState } from 'react'
import { MapPin, Shield, Eye } from 'lucide-react'
import { getGps } from '@/lib/geolocation'

export interface LocationConsentModalProps {
  onComplete: () => void
}

export function LocationConsentModal({ onComplete }: LocationConsentModalProps) {
  const [requesting, setRequesting] = useState(false)
  const [exiting, setExiting] = useState(false)

  const finish = () => {
    setExiting(true)
    setTimeout(onComplete, 420)
  }

  const handleAllow = async () => {
    setRequesting(true)
    try {
      await getGps()
    } catch {
      // user denied or error — still proceed to dashboard
    }
    setRequesting(false)
    finish()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'linear-gradient(160deg, #0a0a0f 0%, #0d0b18 50%, #0a0a0f 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.4s ease-out',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loc-consent-title"
    >
      {/* Background grid */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(84,101,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(84,101,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Glow blobs */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: '280px', height: '280px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(84,101,255,0.12) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '15%', right: '20%',
          width: '200px', height: '200px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)',
          filter: 'blur(32px)',
        }} />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '26rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0',
        }}
      >
        {/* Icon */}
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: 'linear-gradient(145deg, rgba(84,101,255,0.2) 0%, rgba(84,101,255,0.08) 100%)',
          border: '1px solid rgba(84,101,255,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '1.5rem',
          boxShadow: '0 0 32px rgba(84,101,255,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
          animation: 'loc-pulse 2.4s ease-in-out infinite',
        }}>
          <MapPin style={{ width: '32px', height: '32px', color: '#818cf8' }} />
        </div>

        {/* Title */}
        <h1
          id="loc-consent-title"
          style={{
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 'clamp(1.1rem, 4vw, 1.35rem)',
            fontWeight: 700,
            color: '#e2e8f0',
            textAlign: 'center',
            letterSpacing: '0.02em',
            marginBottom: '0.75rem',
          }}
        >
          Location Access Required
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: '0.9rem',
          color: '#94a3b8',
          textAlign: 'center',
          lineHeight: '1.6',
          marginBottom: '1.75rem',
          maxWidth: '22rem',
        }}>
          Myle tracks your field location to verify attendance and keep your team leaders informed of your presence.
        </p>

        {/* Info cards */}
        <div style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          marginBottom: '2rem',
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'rgba(84,101,255,0.06)',
            border: '1px solid rgba(84,101,255,0.15)',
          }}>
            <Shield style={{ width: '16px', height: '16px', color: '#818cf8', marginTop: '2px', flexShrink: 0 }} />
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
              Location is only shared with your assigned team leader and admin — never made public.
            </p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'rgba(16,185,129,0.05)',
            border: '1px solid rgba(16,185,129,0.12)',
          }}>
            <Eye style={{ width: '16px', height: '16px', color: '#34d399', marginTop: '2px', flexShrink: 0 }} />
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
              Required to mark check-ins and confirm field attendance during active shifts.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <button
          type="button"
          onClick={() => void handleAllow()}
          disabled={requesting}
          style={{
            width: '100%',
            padding: '0.85rem 1.5rem',
            borderRadius: '10px',
            border: 'none',
            background: requesting
              ? 'rgba(84,101,255,0.4)'
              : 'linear-gradient(135deg, #5465ff 0%, #4855e8 100%)',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 700,
            letterSpacing: '0.03em',
            cursor: requesting ? 'not-allowed' : 'pointer',
            marginBottom: '0.75rem',
            boxShadow: requesting ? 'none' : '0 4px 20px rgba(84,101,255,0.35)',
            transition: 'opacity 0.15s, box-shadow 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {requesting ? (
            <>
              <span style={{
                width: '16px', height: '16px', borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                display: 'inline-block',
                animation: 'loc-spin 0.7s linear infinite',
              }} />
              Requesting…
            </>
          ) : (
            <>
              <MapPin style={{ width: '16px', height: '16px' }} />
              Allow Location Access
            </>
          )}
        </button>

        <button
          type="button"
          onClick={finish}
          disabled={requesting}
          style={{
            width: '100%',
            padding: '0.75rem 1.5rem',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: '#64748b',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: requesting ? 'not-allowed' : 'pointer',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!requesting) {
              ;(e.target as HTMLButtonElement).style.color = '#94a3b8'
              ;(e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'
            }
          }}
          onMouseLeave={(e) => {
            ;(e.target as HTMLButtonElement).style.color = '#64748b'
            ;(e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)'
          }}
        >
          Not Now
        </button>

        <p style={{
          marginTop: '1.25rem',
          fontSize: '0.65rem',
          color: '#475569',
          textAlign: 'center',
          letterSpacing: '0.04em',
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          MYLE COMMAND SYSTEM · LOCATION SERVICES
        </p>
      </div>

      <style>{`
        @keyframes loc-pulse {
          0%, 100% { box-shadow: 0 0 32px rgba(84,101,255,0.2), inset 0 1px 0 rgba(255,255,255,0.06); }
          50% { box-shadow: 0 0 48px rgba(84,101,255,0.38), inset 0 1px 0 rgba(255,255,255,0.06); }
        }
        @keyframes loc-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
