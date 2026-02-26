import { useRef, useCallback } from 'react'

const TARGET_SAMPLE_RATE = 16000
const SCRIPT_PROCESSOR_BUFFER = 4096

function float32ToBase64Pcm16(float32Array, inputSampleRate) {
  // Decimate from input sample rate down to 16 kHz
  const step = Math.round(inputSampleRate / TARGET_SAMPLE_RATE)
  const length = Math.floor(float32Array.length / step)
  const int16 = new Int16Array(length)

  for (let i = 0; i < length; i++) {
    const s = float32Array[i * step]
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  // Convert Int16Array buffer → Uint8Array → base64
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64Pcm16ToFloat32(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff)
  }
  return float32
}

export function useAudio({ onChunk }) {
  // Capture refs
  const captureCtxRef = useRef(null)
  const processorRef = useRef(null)
  const streamRef = useRef(null)

  // Playback refs
  const playbackCtxRef = useRef(null)
  const nextStartTimeRef = useRef(0)

  const startRecording = useCallback(async () => {
    if (captureCtxRef.current) return

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream

    const ctx = new AudioContext()
    captureCtxRef.current = ctx

    const source = ctx.createMediaStreamSource(stream)
    // ScriptProcessorNode — deprecated but universally supported
    const processor = ctx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0)
      const b64 = float32ToBase64Pcm16(float32, ctx.sampleRate)
      onChunk(b64)
    }

    source.connect(processor)
    processor.connect(ctx.destination)
  }, [onChunk])

  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect()
    processorRef.current = null

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    captureCtxRef.current?.close()
    captureCtxRef.current = null
  }, [])

  const onAudioReceived = useCallback((base64) => {
    // Lazy-init playback context on first received audio
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      nextStartTimeRef.current = 0
    }

    const playCtx = playbackCtxRef.current
    const float32 = base64Pcm16ToFloat32(base64)

    const buffer = playCtx.createBuffer(1, float32.length, TARGET_SAMPLE_RATE)
    buffer.copyToChannel(float32, 0)

    const source = playCtx.createBufferSource()
    source.buffer = buffer
    source.connect(playCtx.destination)

    const now = playCtx.currentTime
    const startAt = Math.max(now, nextStartTimeRef.current)
    source.start(startAt)
    nextStartTimeRef.current = startAt + buffer.duration
  }, [])

  return { startRecording, stopRecording, onAudioReceived }
}
