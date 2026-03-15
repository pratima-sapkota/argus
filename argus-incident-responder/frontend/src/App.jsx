import { useRef, useCallback, useState, useEffect } from 'react'
import { useAudio } from './hooks/useAudio'
import { useWebSocket } from './hooks/useWebSocket'
import { useActiveConnections } from './hooks/useActiveConnections'
import { NetworkTable } from './components/NetworkTable'
import { SummaryChart } from './components/SummaryChart'
import { DeviceCard } from './components/DeviceCard'
import { AgentPanel } from './components/AgentPanel'
import { SectionHeader } from './components/SectionHeader'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function App() {
  const [active, setActive] = useState(false)
  const [history, setHistory] = useState([])
  const [interrupted, setInterrupted] = useState(false)
  const [messages, setMessages] = useState([])
  const [collapseOverrides, setCollapseOverrides] = useState({})
  const [pastChats, setPastChats] = useState([])
  const [viewingChatId, setViewingChatId] = useState(null)
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  // Waveform amplitudes: use refs to avoid flooding React renders at audio-frame rate.
  // AgentPanel reads these refs via a stable object reference.
  const userAmpRef  = useRef(0)
  const agentAmpRef = useRef(0)

  // Ref to break circular dependency:
  // useAudio needs to call sendAudioChunk, but sendAudioChunk comes from useWebSocket.
  // We pass a stable ref-forwarding callback to useAudio, then sync the ref after hooks run.
  const sendChunkRef = useRef(null)

  // stopPlaybackRef lets onSpeechStart (from useAudio) call stopPlayback
  // without creating a circular dependency between the two hooks.
  const stopPlaybackRef = useRef(null)

  const { onAudioReceived, startRecording, stopRecording, stopPlayback, clearInterrupt, closePlayback } = useAudio({
    onChunk: useCallback((b64) => sendChunkRef.current?.(b64), []),
    onSpeechStart: useCallback(() => {
      stopPlaybackRef.current?.()
      setThinking(true)
    }, []),
    onUserAmplitude: useCallback((amp) => { userAmpRef.current = amp }, []),
    onAgentAmplitude: useCallback((amp) => { agentAmpRef.current = amp }, []),
    onAgentSpeakingStart: useCallback(() => {
      setAgentSpeaking(true)
      setThinking(false)
    }, []),
    onAgentSpeakingEnd: useCallback(() => {
      setAgentSpeaking(false)
    }, []),
  })

  const ACTION_TYPE = {
    RENDER_THREATS: 'threats',
    RENDER_TRAFFIC: 'traffic',
    RENDER_FILTERED_LOGS: 'filteredLogs',
    RENDER_SUMMARY: 'summary',
    DEVICE_BLOCKED: 'deviceBlocked',
    RENDER_CONNECTIONS: 'connections',
  }

  const handleUiUpdate = useCallback((msg) => {
    const type = ACTION_TYPE[msg.action]
    if (!type) return
    const ts = Date.now()
    setHistory((prev) => [{ type, rows: msg.payload || [], id: `live-${ts}`, timestamp: ts }, ...prev])
  }, [])

  const handleInterrupted = useCallback(() => {
    stopPlaybackRef.current?.()
    clearInterrupt()           // open gate for the new agent response
    setInterrupted(true)
  }, [clearInterrupt])

  const handleTurnComplete = useCallback(() => {
    clearInterrupt()  // ensure gate is open for the next turn
    setThinking(false)
  }, [clearInterrupt])

  const handleTranscript = useCallback(({ role, text }) => {
    if (!text) return
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === role) {
        const updated = [...prev]
        updated[updated.length - 1] = { ...last, text: last.text + text }
        return updated
      }
      return [...prev, { role, text, timestamp: Date.now() }]
    })
  }, [])

  const handleTranscriptHistory = useCallback((transcripts) => {
    const merged = []
    for (const t of transcripts) {
      const last = merged[merged.length - 1]
      if (last && last.role === t.role) {
        last.text += t.text
      } else {
        merged.push({ role: t.role, text: t.text, timestamp: Date.now() })
      }
    }
    setMessages((prev) => [...merged, ...prev])
  }, [])

  const handleAgentState = useCallback((state) => {
    if (state === 'reconnecting') {
      setReconnecting(true)
    } else {
      setReconnecting(false)
    }
  }, [])

  const handleFindingsHistory = useCallback((findings) => {
    const entries = findings.map((f, i) => ({
      type: f.type,
      rows: f.payload || [],
      id: f.id || `finding-${i}`,
      timestamp: f.timestamp ? new Date(f.timestamp).getTime() : Date.now() + i,
    }))
    setHistory(entries.reverse())
  }, [])

  // Clear interrupted flag after animation
  useEffect(() => {
    if (!interrupted) return
    const t = setTimeout(() => setInterrupted(false), 800)
    return () => clearTimeout(t)
  }, [interrupted])

  const fetchPastChats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/incidents`)
      if (res.ok) setPastChats(await res.json())
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { fetchPastChats() }, [fetchPastChats])

  const handleViewChat = useCallback(async (chatId) => {
    if (active) return
    setViewingChatId(chatId)
    setCollapseOverrides({})
    setMessages([])
    setHistory([])
    try {
      const [txRes, fRes] = await Promise.all([
        fetch(`${API_URL}/incidents/${chatId}/transcripts`),
        fetch(`${API_URL}/incidents/${chatId}/findings`),
      ])
      if (txRes.ok) {
        const transcripts = await txRes.json()
        const merged = []
        for (const t of transcripts) {
          const last = merged[merged.length - 1]
          if (last && last.role === t.role) {
            last.text += t.text
          } else {
            merged.push({ role: t.role, text: t.text, timestamp: Date.now() })
          }
        }
        setMessages(merged)
      }
      if (fRes.ok) {
        const findings = await fRes.json()
        const entries = findings.map((f, i) => ({
          type: f.type,
          rows: f.payload || [],
          id: f.id || `finding-${i}`,
          timestamp: f.timestamp ? new Date(f.timestamp).getTime() : Date.now() + i,
        }))
        setHistory(entries.reverse())
      }
    } catch (err) {
      console.error('Failed to load past chat:', err)
    }
  }, [active])

  const handleBackToLive = useCallback(() => {
    setViewingChatId(null)
    setMessages([])
    setHistory([])
    setCollapseOverrides({})
  }, [])

  const handleClearAllSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/incidents`, { method: 'DELETE' })
      if (res.ok) {
        setPastChats([])
        setViewingChatId(null)
        setMessages([])
        setHistory([])
        setCollapseOverrides({})
      }
    } catch (err) {
      console.error('Failed to clear sessions:', err)
    }
  }, [])

  const { connected, connect, disconnect, sendAudioChunk } = useWebSocket({
    onAudioReceived,
    onTurnComplete: handleTurnComplete,
    onInterrupted: handleInterrupted,
    onUiUpdate: handleUiUpdate,
    onTranscript: handleTranscript,
    onTranscriptHistory: handleTranscriptHistory,
    onFindingsHistory: handleFindingsHistory,
    onAgentState: handleAgentState,
  })

  // Sync ref every render so onSpeechStart always calls the latest stopPlayback
  stopPlaybackRef.current = stopPlayback

  // Sync ref every render so useAudio always calls the latest sendAudioChunk
  sendChunkRef.current = sendAudioChunk

  const handleToggle = async () => {
    if (!active) {
      setViewingChatId(null)
      setHistory([])
      setMessages([])
      setCollapseOverrides({})
      await connect()
      await startRecording()
      setActive(true)
    } else {
      stopRecording()
      closePlayback()
      disconnect()
      setActive(false)
      fetchPastChats()
    }
  }

  const agentState = reconnecting
    ? 'Reconnecting'
    : !connected
      ? 'Offline'
      : agentSpeaking
        ? 'Speaking'
        : thinking
          ? 'Thinking'
          : 'Listening'

  const connections = useActiveConnections()

  const hasData = history.length > 0 || connections.length > 0

  const now = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* ── Left panel (80%) ── */}
      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 dot-grid">

        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
            <span className="text-white font-bold text-lg tracking-widest uppercase">
              Argus SOC
            </span>
          </div>
          <span className="text-gray-600 text-xs font-mono">{now}</span>
        </div>

        {viewingChatId && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg animate-slide-up-fade"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <span className="text-indigo-400 text-xs">
              Viewing past session — {pastChats.find(c => c.id === viewingChatId)?.title || 'Unknown'}
            </span>
            <button onClick={handleBackToLive} className="text-gray-500 hover:text-gray-300 text-xs ml-auto">
              Dismiss
            </button>
          </div>
        )}

        {/* Data sections or empty state */}
        {!hasData ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-600 text-sm tracking-widest uppercase">
              Monitoring network…
            </p>
          </div>
        ) : (
          <>
            {history.map((entry, index) => {
              const key = entry.id || `${entry.timestamp}-${index}`
              const rows = entry.rows || []
              const expanded = collapseOverrides[key] ?? (index === 0)
              const toggle = () =>
                setCollapseOverrides((prev) => ({ ...prev, [key]: !expanded }))

              const sectionProps = { expanded, onToggle: toggle }

              if (entry.type === 'summary') return (
                <section key={key} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="Network Overview" color="indigo" count={null} {...sectionProps} />
                  {expanded && <SummaryChart data={rows} />}
                </section>
              )
              if (entry.type === 'threats') return (
                <section key={key} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="High Severity Threats" color="red" count={rows.length} {...sectionProps} />
                  {expanded && <NetworkTable rows={rows} variant="threats" />}
                </section>
              )
              if (entry.type === 'filteredLogs') return (
                <section key={key} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="Filtered Network Logs" color="blue" count={rows.length} {...sectionProps} />
                  {expanded && <NetworkTable rows={rows} variant="threats" />}
                </section>
              )
              if (entry.type === 'traffic') return (
                <section key={key} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="Port Traffic Analysis" color="yellow" count={rows.length} {...sectionProps} />
                  {expanded && <NetworkTable rows={rows} variant="traffic" />}
                </section>
              )
              if (entry.type === 'connections') return (
                <section key={key} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="Connection Query Results" color="cyan" count={rows.length} {...sectionProps} />
                  {expanded && <NetworkTable rows={rows} variant="threats" />}
                </section>
              )
              if (entry.type === 'deviceBlocked') return (
                <section key={key} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="Device Blocked" color="red" count={rows.length} {...sectionProps} />
                  {expanded && (
                    <div className="flex flex-col gap-2 mt-2">
                      {rows.map((r, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg border border-red-500 bg-red-950 px-4 py-3">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-red-300 text-sm font-mono">{r.blocked}</span>
                          <span className="text-red-500 text-xs uppercase tracking-widest ml-auto">blocked</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )
              return null
            })}

            {connections.length > 0 && (
              <section className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <SectionHeader title="Active Connections" color="cyan" count={connections.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {connections.map((c) => (
                    <DeviceCard key={c.id} {...c} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* ── Right panel (agent sidebar) ── */}
      <AgentPanel
        active={active}
        connected={connected}
        onToggle={handleToggle}
        userAmpRef={userAmpRef}
        agentAmpRef={agentAmpRef}
        interrupted={interrupted}
        messages={messages}
        pastChats={pastChats}
        viewingChatId={viewingChatId}
        onViewChat={handleViewChat}
        onBackToLive={handleBackToLive}
        onClearAllSessions={handleClearAllSessions}
        agentState={agentState}
      />
    </div>
  )
}
