import { TranscriptFeed } from './TranscriptFeed'

const STATE_STYLES = {
  Offline:      { color: '#4b5563', shadow: 'none',                              pulse: false },
  Listening:    { color: '#34d399', shadow: '0 0 6px rgba(52,211,153,0.6)',      pulse: false },
  Thinking:     { color: '#facc15', shadow: '0 0 6px rgba(250,204,21,0.6)',      pulse: true  },
  Speaking:     { color: '#818cf8', shadow: '0 0 6px rgba(129,140,248,0.6)',     pulse: false },
  Reconnecting: { color: '#fb923c', shadow: '0 0 6px rgba(251,146,60,0.6)',     pulse: true  },
}

export function AgentPanel({
  active, onToggle, messages = [], pastChats = [], viewingChatId,
  onViewChat, onBackToLive, onClearAllSessions, agentState = 'Offline',
  onTextSend, wsError,
}) {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0d0d1a 0%, #0a0a14 100%)',
        border: '1px solid rgba(99,102,241,0.18)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.08)',
        height: 480,
        maxHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* Top accent line */}
      <div
        className="h-px w-full flex-shrink-0"
        style={{
          background: active
            ? 'linear-gradient(90deg, transparent, rgba(99,102,241,0.85), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(55,65,81,0.5), transparent)',
          transition: 'background 0.7s ease',
        }}
      />

      <div className="flex flex-col items-center gap-3 px-4 py-3 flex-1 min-h-0">
        {/* Header row */}
        <div className="self-stretch flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-300 text-xs font-bold uppercase tracking-widest">
              Argus
            </span>
            <span className="flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0${STATE_STYLES[agentState]?.pulse ? ' animate-pulse' : ''}`}
                style={{
                  background: STATE_STYLES[agentState]?.color ?? '#4b5563',
                  boxShadow: STATE_STYLES[agentState]?.shadow ?? 'none',
                  transition: 'all 0.4s',
                }}
              />
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                {agentState}
              </span>
            </span>
          </div>
          <button
            onClick={onToggle}
            className="px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide flex-shrink-0 active:scale-95"
            style={{
              background: active
                ? 'linear-gradient(135deg, #b91c1c, #dc2626)'
                : 'linear-gradient(135deg, #4338ca, #6366f1)',
              boxShadow: active
                ? '0 2px 8px rgba(220,38,38,0.3)'
                : '0 2px 8px rgba(99,102,241,0.25)',
              color: '#fff',
              border: active
                ? '1px solid rgba(220,38,38,0.5)'
                : '1px solid rgba(99,102,241,0.5)',
              transition: 'all 0.3s ease, transform 0.1s',
            }}
          >
            {active ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        {/* Error toast */}
        {wsError && (
          <div
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-300 flex-shrink-0 animate-slide-up-fade"
            style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {wsError}
          </div>
        )}

        {/* Divider */}
        <div className="w-full h-px flex-shrink-0" style={{ background: 'rgba(99,102,241,0.1)' }} />

        <TranscriptFeed messages={messages} active={active} />

        {/* Past Chats */}
        {!active && pastChats.length > 0 && (
          <>
            <div className="w-full h-px flex-shrink-0" style={{ background: 'rgba(99,102,241,0.1)' }} />
            <div className="w-full flex-shrink-0 flex flex-col gap-1 max-h-[200px] min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                  Past Sessions
                </span>
                <button
                  onClick={onClearAllSessions}
                  className="text-[10px] text-red-400 hover:text-red-300 tracking-wide"
                >
                  Clear All
                </button>
              </div>
              <div className="overflow-y-auto transcript-scroll space-y-0.5">
                {pastChats.map((chat) => {
                  const isViewing = viewingChatId === chat.id
                  const date = chat.created_at
                    ? new Date(chat.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : ''
                  return (
                    <button
                      key={chat.id}
                      onClick={() => onViewChat(chat.id)}
                      className="w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors"
                      style={{
                        background: isViewing ? 'rgba(99,102,241,0.15)' : 'transparent',
                        border: isViewing ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: chat.status === 'active' ? '#34d399' : '#4b5563',
                          }}
                        />
                        <span className="text-gray-400 truncate flex-1">{chat.title || 'Untitled'}</span>
                      </div>
                      {date && (
                        <span className="text-gray-600 text-[10px] ml-3">{date}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
