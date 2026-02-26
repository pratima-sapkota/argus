import { useRef, useState, useCallback } from 'react'

const WS_URL = 'ws://localhost:8000/ws'

export function useWebSocket({ onAudioReceived }) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)

  const connect = useCallback(() => {
    if (wsRef.current) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'audio' && msg.data) {
          onAudioReceived(msg.data)
        }
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      setConnected(false)
    }

    ws.onerror = (err) => {
      console.error('WebSocket error', err)
      ws.close()
    }
  }, [onAudioReceived])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
  }, [])

  const sendAudioChunk = useCallback((base64Data) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(
      JSON.stringify({
        type: 'realtime_input',
        media_chunks: [{ mime_type: 'audio/pcm;rate=16000', data: base64Data }],
      })
    )
  }, [])

  return { connected, connect, disconnect, sendAudioChunk }
}
