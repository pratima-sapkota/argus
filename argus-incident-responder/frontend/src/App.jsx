import { useRef, useCallback, useState, useEffect } from 'react'
import { useAudio } from './hooks/useAudio'
import { useWebSocket } from './hooks/useWebSocket'
import { useActiveConnections } from './hooks/useActiveConnections'
import { NetworkTable } from './components/NetworkTable'
import { DeviceCard } from './components/DeviceCard'
import { AgentPanel } from './components/AgentPanel'
import { SectionHeader } from './components/SectionHeader'

export default function App() {
  const [active, setActive] = useState(false)
  const [history, setHistory] = useState([])
  const [interrupted, setInterrupted] = useState(false)

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
    onSpeechStart: useCallback(() => stopPlaybackRef.current?.(), []),
    onUserAmplitude: useCallback((amp) => { userAmpRef.current = amp }, []),
    onAgentAmplitude: useCallback((amp) => { agentAmpRef.current = amp }, []),
  })

  const ACTION_TYPE = {
    RENDER_THREATS: 'threats',
    RENDER_TRAFFIC: 'traffic',
    RENDER_FILTERED_LOGS: 'filteredLogs',
  }

  const handleUiUpdate = useCallback((msg) => {
    const type = ACTION_TYPE[msg.action]
    if (!type) return
    setHistory((prev) => [{ type, rows: msg.payload, timestamp: Date.now() }, ...prev])
  }, [])

  const handleInterrupted = useCallback(() => {
    stopPlaybackRef.current?.()
    clearInterrupt()           // open gate for the new agent response
    setInterrupted(true)
  }, [clearInterrupt])

  const handleTurnComplete = useCallback(() => {
    clearInterrupt()  // ensure gate is open for the next turn
  }, [clearInterrupt])

  // Clear interrupted flag after animation
  useEffect(() => {
    if (!interrupted) return
    const t = setTimeout(() => setInterrupted(false), 800)
    return () => clearTimeout(t)
  }, [interrupted])

  const { connected, connect, disconnect, sendAudioChunk } = useWebSocket({
    onAudioReceived,
    onTurnComplete: handleTurnComplete,
    onInterrupted: handleInterrupted,
    onUiUpdate: handleUiUpdate,
  })

  // Sync ref every render so onSpeechStart always calls the latest stopPlayback
  stopPlaybackRef.current = stopPlayback

  // Sync ref every render so useAudio always calls the latest sendAudioChunk
  sendChunkRef.current = sendAudioChunk

  const handleToggle = async () => {
    if (!active) {
      setHistory([])
      connect()
      await startRecording()
      setActive(true)
    } else {
      stopRecording()
      closePlayback()
      disconnect()
      setActive(false)
    }
  }

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
      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-white font-bold text-lg tracking-widest uppercase">
              Argus SOC
            </span>
          </div>
          <span className="text-gray-600 text-xs font-mono">{now}</span>
        </div>

        {/* Data sections or empty state */}
        {!hasData ? (
          <div className="flex-1 flex items-center justify-center dot-grid rounded-xl">
            <p className="text-gray-600 text-sm tracking-widest uppercase">
              Monitoring network…
            </p>
          </div>
        ) : (
          <>
            {history.map((entry) => {
              if (entry.type === 'threats') return (
                <section key={entry.timestamp} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="High Severity Threats" color="red" count={entry.rows.length} />
                  <NetworkTable rows={entry.rows} variant="threats" />
                </section>
              )
              if (entry.type === 'filteredLogs') return (
                <section key={entry.timestamp} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="Filtered Network Logs" color="blue" count={entry.rows.length} />
                  <NetworkTable rows={entry.rows} variant="threats" />
                </section>
              )
              if (entry.type === 'traffic') return (
                <section key={entry.timestamp} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <SectionHeader title="Port Traffic Analysis" color="yellow" count={entry.rows.length} />
                  <NetworkTable rows={entry.rows} variant="traffic" />
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
      />
    </div>
  )
}
