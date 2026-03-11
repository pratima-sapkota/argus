import { useEffect, useRef } from 'react'

export function TranscriptFeed({ messages }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="w-full flex-1 min-h-0 flex items-center justify-center">
        <span className="text-gray-700 text-xs tracking-widest uppercase">
          Transcript will appear here
        </span>
      </div>
    )
  }

  return (
    <div className="w-full self-stretch flex-1 min-h-0 overflow-y-auto pr-1 transcript-scroll">
      <div className="w-full space-y-2.5">
        {messages.map((msg, i) => {
          const isAgent = msg.role === 'agent'
          return isAgent ? (
            <p
              key={i}
              className="w-full text-xs leading-relaxed text-left"
              style={{ color: '#c7d2fe' }}
            >
              {msg.text}
            </p>
          ) : (
            <div key={i} className="w-full flex justify-end">
              <div
                className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  color: '#a7f3d0',
                }}
              >
                {msg.text}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}
