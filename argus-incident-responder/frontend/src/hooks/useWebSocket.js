import { useRef, useState, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws'

export function useWebSocket({ onAudioReceived, onTurnComplete, onInterrupted, onUiUpdate, onTranscript, onTranscriptHistory, onFindingsHistory, onAgentState, onError }) {
  const wsRef = useRef(null)
  const incidentIdRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const onTurnCompleteRef = useRef(onTurnComplete)
  const onInterruptedRef = useRef(onInterrupted)
  const onTranscriptRef = useRef(onTranscript)
  const onTranscriptHistoryRef = useRef(onTranscriptHistory)
  const onFindingsHistoryRef = useRef(onFindingsHistory)
  const onAgentStateRef = useRef(onAgentState)
  const onErrorRef = useRef(onError)
  onTurnCompleteRef.current = onTurnComplete
  onInterruptedRef.current = onInterrupted
  onTranscriptRef.current = onTranscript
  onTranscriptHistoryRef.current = onTranscriptHistory
  onFindingsHistoryRef.current = onFindingsHistory
  onAgentStateRef.current = onAgentState
  onErrorRef.current = onError

  const connect = useCallback(async () => {
    if (wsRef.current) return

    const res = await fetch(`${API_URL}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Session ${new Date().toLocaleString()}` }),
    })
    if (!res.ok) throw new Error(`Failed to create incident: ${res.status}`)
    const incident = await res.json()
    incidentIdRef.current = incident.id

    const ws = new WebSocket(`${WS_URL}?incident_id=${incident.id}`)
    wsRef.current = ws

    ws.onopen = async () => {
      setConnected(true)
      try {
        const [txRes, fRes] = await Promise.all([
          fetch(`${API_URL}/incidents/${incident.id}/transcripts`),
          fetch(`${API_URL}/incidents/${incident.id}/findings`),
        ])
        if (txRes.ok) {
          const transcripts = await txRes.json()
          if (transcripts.length > 0) {
            onTranscriptHistoryRef.current?.(transcripts)
          }
        }
        if (fRes.ok) {
          const findings = await fRes.json()
          if (findings.length > 0) {
            onFindingsHistoryRef.current?.(findings)
          }
        }
      } catch {
        // non-critical — live data still works
      }
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
        } else if (msg.type === 'agent_state') {
          onAgentStateRef.current?.(msg.state)
        } else if (msg.type === 'transcript') {
          console.log('[ws] transcript:', msg.role, msg.text)
          onTranscriptRef.current?.({ role: msg.role, text: msg.text })
        } else if (msg.type === 'error') {
          onErrorRef.current?.(msg.message)
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

  const sendImage = useCallback((base64Data, mimeType = 'image/jpeg') => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(
      JSON.stringify({
        type: 'image_input',
        data: base64Data,
        mime_type: mimeType,
      })
    )
  }, [])

  const sendText = useCallback((text) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(
      JSON.stringify({ type: 'text_input', text })
    )
  }, [])

  return { connected, connect, disconnect, sendAudioChunk, sendImage, sendText, incidentIdRef }
}
