import { useEffect, useRef } from 'react'

export function TranscriptFeed({ messages }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <span className="text-gray-700 text-xs tracking-widest uppercase">
          Transcript will appear here
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
      {messages.map((msg, i) => {
        const isAgent = msg.role === 'agent'
        return (
          <div
            key={i}
            className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed"
              style={{
                background: isAgent
                  ? 'rgba(99,102,241,0.12)'
                  : 'rgba(16,185,129,0.12)',
                border: `1px solid ${isAgent ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.2)'}`,
                color: isAgent ? '#c7d2fe' : '#a7f3d0',
              }}
            >
              {msg.text}
            </div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
