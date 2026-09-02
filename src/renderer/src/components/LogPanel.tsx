import { useRef, useEffect, type JSX } from 'react'
import type { LogEntry } from '@/stores/storyStore'

export function LogPanel({ logs }: { logs: LogEntry[] }): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [logs.length])

  if (logs.length === 0) return <div />

  const levelIcon = (level: LogEntry['level']): string => {
    switch (level) {
      case 'info': return 'ℹ️'
      case 'warn': return '⚠️'
      case 'error': return '❌'
      case 'success': return '✅'
    }
  }

  return (
    <div className="log-panel">
      <div className="log-panel__header">
        <span>📋 Nhật ký tiến trình & chi tiết</span>
        <span className="log-panel__count">{logs.length}</span>
      </div>
      <div className="log-panel__body" ref={scrollRef}>
        {logs.map((log, i) => (
          <div key={i} className={`log-entry log-entry--${log.level}`}>
            <span className="log-entry__icon">{levelIcon(log.level)}</span>
            <span className="log-entry__time">{log.time}</span>
            <span className="log-entry__content">
              <span className="log-entry__msg">{log.message}</span>
              {log.detail && <span className="log-entry__detail">{log.detail}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
