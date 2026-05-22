import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { error: Error | null }

/**
 * Last-resort catch for uncaught render errors (layout, providers, routes).
 * Without this, React can leave a blank / black viewport with only a console error.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || 'Unexpected error'
      return (
        <div
          style={{
            minHeight: '100dvh',
            padding: '1.5rem',
            background: '#050208',
            color: '#e8e4f0',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '32rem',
            margin: '0 auto',
          }}
        >
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.85, marginBottom: '1rem', wordBreak: 'break-word' }}>
            {msg}
          </p>
          <button
            type="button"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.08)',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
            onClick={() => {
              this.setState({ error: null })
              window.location.reload()
            }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
