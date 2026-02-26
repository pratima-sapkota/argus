import { useRef, useCallback, useState } from 'react'
import { useAudio } from './hooks/useAudio'
import { useWebSocket } from './hooks/useWebSocket'
import { NetworkTable } from './components/NetworkTable'

export default function App() {
  const [active, setActive] = useState(false)
  const [threats, setThreats] = useState([])
  const [filteredLogs, setFilteredLogs] = useState([])
  const [traffic, setTraffic] = useState([])

  // Ref to break circular dependency:
  // useAudio needs to call sendAudioChunk, but sendAudioChunk comes from useWebSocket.
  // We pass a stable ref-forwarding callback to useAudio, then sync the ref after hooks run.
  const sendChunkRef = useRef(null)

  // stopPlaybackRef lets onSpeechStart (from useAudio) call stopPlayback
  // without creating a circular dependency between the two hooks.
  const stopPlaybackRef = useRef(null)

  const { onAudioReceived, startRecording, stopRecording, stopPlayback, closePlayback } = useAudio({
    onChunk: useCallback((b64) => sendChunkRef.current?.(b64), []),
    onSpeechStart: useCallback(() => stopPlaybackRef.current?.(), []),
  })

  const handleUiUpdate = useCallback((msg) => {
    if (msg.action === 'RENDER_THREATS') setThreats(msg.payload)
    else if (msg.action === 'RENDER_TRAFFIC') setTraffic(msg.payload)
    else if (msg.action === 'RENDER_FILTERED_LOGS') setFilteredLogs(msg.payload)
  }, [])

  const handleInterrupted = useCallback(() => {
    stopPlaybackRef.current?.()
    setThreats([])
    setFilteredLogs([])
    setTraffic([])
  }, [])

  const { connected, connect, disconnect, sendAudioChunk } = useWebSocket({
    onAudioReceived,
    onTurnComplete: stopPlayback,
    onInterrupted: handleInterrupted,
    onUiUpdate: handleUiUpdate,
  })

  // Sync ref every render so onSpeechStart always calls the latest stopPlayback
  stopPlaybackRef.current = stopPlayback

  // Sync ref every render so useAudio always calls the latest sendAudioChunk
  sendChunkRef.current = sendAudioChunk

  const handleToggle = async () => {
    if (!active) {
      connect()
      await startRecording()
      setActive(true)
    } else {
      stopRecording()
      closePlayback()
      disconnect()
      setThreats([])
      setFilteredLogs([])
      setTraffic([])
      setActive(false)
    }
  }

  const hasData = threats.length > 0 || traffic.length > 0 || filteredLogs.length > 0

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-10 gap-8">
      <h1 className="text-3xl font-bold text-white tracking-wide">Argus SOC Agent</h1>

      {/* Pulsing indicator */}
      <div className="flex items-center justify-center w-32 h-32">
        {active ? (
          <span className="relative flex h-16 w-16">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-16 w-16 bg-red-600" />
          </span>
        ) : (
          <span className="inline-flex rounded-full h-16 w-16 bg-gray-700" />
        )}
      </div>

      {/* Status text */}
      <p className="text-gray-400 text-sm">
        {active ? 'Listening…' : 'Press Connect to start'}
      </p>

      {/* Toggle button */}
      <button
        onClick={handleToggle}
        className={`px-8 py-3 rounded-full text-white font-semibold text-lg transition-colors ${
          active
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {active ? 'Disconnect' : 'Connect'}
      </button>

      {/* Connection status badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? 'bg-green-400' : 'bg-gray-600'
          }`}
        />
        <span className="text-gray-500 text-xs">
          {connected ? 'WebSocket connected' : 'Not connected'}
        </span>
      </div>

      {/* Data panel */}
      <div className="w-full max-w-4xl mt-4">
        {!hasData ? (
          <p className="text-center text-gray-600 text-sm tracking-widest uppercase">
            Monitoring Network...
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {threats.length > 0 && (
              <section>
                <h2 className="text-red-400 text-xs font-semibold uppercase tracking-widest mb-3">
                  High Severity Threats
                </h2>
                <NetworkTable rows={threats} variant="threats" />
              </section>
            )}
            {filteredLogs.length > 0 && (
              <section>
                <h2 className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3">
                  Filtered Network Logs
                </h2>
                <NetworkTable rows={filteredLogs} variant="threats" />
              </section>
            )}
            {traffic.length > 0 && (
              <section>
                <h2 className="text-yellow-400 text-xs font-semibold uppercase tracking-widest mb-3">
                  Port Traffic Analysis
                </h2>
                <NetworkTable rows={traffic} variant="traffic" />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
