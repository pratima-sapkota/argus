import { useRef, useState, useCallback } from 'react'

const WS_URL = 'ws://localhost:8000/ws'

export function useWebSocket({ onAudioReceived, onTurnComplete, onInterrupted, onUiUpdate, onTranscript }) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const onTurnCompleteRef = useRef(onTurnComplete)
  const onInterruptedRef = useRef(onInterrupted)
  const onTranscriptRef = useRef(onTranscript)
  onTurnCompleteRef.current = onTurnComplete
  onInterruptedRef.current = onInterrupted
  onTranscriptRef.current = onTranscript

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
          console.log('[ws] audio packet received, bytes:', msg.data.length)
          onAudioReceived(msg.data)
        } else if (msg.type === 'turn_complete') {
          onTurnCompleteRef.current?.()
        } else if (msg.type === 'interrupted') {
          onInterruptedRef.current?.()
        } else if (msg.type === 'ui_update') {
          onUiUpdate?.(msg)
        } else if (msg.type === 'transcript') {
          console.log('[ws] transcript:', msg.role, msg.text)
          onTranscriptRef.current?.({ role: msg.role, text: msg.text })
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
  }, [onAudioReceived, onUiUpdate])

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
