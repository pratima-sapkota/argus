import { useRef, useCallback, useState } from 'react'
import { useAudio } from './hooks/useAudio'
import { useWebSocket } from './hooks/useWebSocket'

export default function App() {
  const [active, setActive] = useState(false)

  // Ref to break circular dependency:
  // useAudio needs to call sendAudioChunk, but sendAudioChunk comes from useWebSocket.
  // We pass a stable ref-forwarding callback to useAudio, then sync the ref after hooks run.
  const sendChunkRef = useRef(null)

  const { onAudioReceived, startRecording, stopRecording, resetPlayback } = useAudio({
    onChunk: useCallback((b64) => sendChunkRef.current?.(b64), []),
  })

  const { connected, connect, disconnect, sendAudioChunk } = useWebSocket({
    onAudioReceived,
    onTurnComplete: resetPlayback,
  })

  // Sync ref every render so useAudio always calls the latest sendAudioChunk
  sendChunkRef.current = sendAudioChunk

  const handleToggle = async () => {
    if (!active) {
      connect()
      await startRecording()
      setActive(true)
    } else {
      stopRecording()
      disconnect()
      setActive(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-8">
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
    </div>
  )
}
