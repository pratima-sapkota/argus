import { useEffect, useRef } from 'react'
import Markdown from 'react-markdown'

const SUGGESTIONS = [
  '"Show me the network summary"',
  '"Are there any active threats?"',
  '"Show traffic on port 443"',
  '"List all active connections"',
  '"Block device 192.168.1.50"',
]

export function TranscriptFeed({ messages, active }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    if (!active) {
      return (
        <div className="w-full flex-1 min-h-0 flex items-center justify-center">
          <span className="text-gray-600 text-xs tracking-wide">
            Click on Connect to start
          </span>
        </div>
      )
    }

    return (
      <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-1">
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-gray-500 text-[10px] font-semibold tracking-[0.2em] uppercase">
            Try saying
          </span>
          <div
            className="w-8 h-px rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(75,85,99,0.6), transparent)',
            }}
          />
        </div>
        <div className="w-full flex flex-col gap-1.5">
          {SUGGESTIONS.map((s) => (
            <span key={s} className="text-gray-600 text-[11px] text-center italic">
              {s}
            </span>
          ))}
        </div>
        <span className="text-gray-700 text-[10px] tracking-wide mt-2">
          Transcript will be shown here
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
            <div
              key={i}
              className="agent-markdown w-full text-xs leading-relaxed text-left"
              style={{ color: '#c7d2fe' }}
            >
              <Markdown>{msg.text}</Markdown>
            </div>
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
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="Uploaded"
                    className="rounded mb-1.5"
                    style={{ maxWidth: 200, maxHeight: 200, objectFit: 'contain' }}
                  />
                )}
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
