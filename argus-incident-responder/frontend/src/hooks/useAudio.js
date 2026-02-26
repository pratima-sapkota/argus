import { useRef, useCallback } from 'react'

const TARGET_SAMPLE_RATE = 16000
const SCRIPT_PROCESSOR_BUFFER = 512
const LOOKAHEAD = 0.05 // seconds — prevents underrun glitches from network jitter

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

const RMS_THRESHOLD = 0.06      // ~-26 dBFS — typical conversational speech level
const SPEECH_COOLDOWN_MS = 500  // minimum ms between onSpeechStart fires
const SPEECH_CONFIRM_FRAMES = 3 // consecutive frames above threshold before firing

export function useAudio({ onChunk, onSpeechStart }) {
  // Capture refs
  const captureCtxRef = useRef(null)
  const processorRef = useRef(null)
  const streamRef = useRef(null)

  // Playback refs
  const playbackCtxRef = useRef(null)
  const nextStartTimeRef = useRef(0)

  // VAD state refs
  const lastSpeechFireRef = useRef(0)  // timestamp of last onSpeechStart fire
  const consecutiveFramesRef = useRef(0) // frames above threshold in a row

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

      // VAD: require SPEECH_CONFIRM_FRAMES consecutive frames above threshold
      // to avoid triggering on transient noise spikes (key clicks, door slams, etc.)
      if (onSpeechStart) {
        let sumSq = 0
        for (let i = 0; i < float32.length; i++) sumSq += float32[i] * float32[i]
        const rms = Math.sqrt(sumSq / float32.length)
        if (rms > RMS_THRESHOLD) {
          consecutiveFramesRef.current += 1
          if (consecutiveFramesRef.current >= SPEECH_CONFIRM_FRAMES) {
            const now = Date.now()
            if (now - lastSpeechFireRef.current > SPEECH_COOLDOWN_MS) {
              lastSpeechFireRef.current = now
              consecutiveFramesRef.current = 0
              onSpeechStart()
            }
          }
        } else {
          consecutiveFramesRef.current = 0
        }
      }

      const b64 = float32ToBase64Pcm16(float32, ctx.sampleRate)
      onChunk(b64)
    }

    source.connect(processor)
    processor.connect(ctx.destination)
  }, [onChunk, onSpeechStart])

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
    const startAt = Math.max(now + LOOKAHEAD, nextStartTimeRef.current)
    source.start(startAt)
    nextStartTimeRef.current = startAt + buffer.duration
  }, [])

  const stopPlayback = useCallback(() => {
    // Reset the schedule pointer so the next response starts immediately.
    // Do NOT close the AudioContext — a closed context cannot be reused and
    // would cause all subsequent audio to silently fail.
    nextStartTimeRef.current = 0
  }, [])

  const closePlayback = useCallback(() => {
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close()
      playbackCtxRef.current = null
    }
    nextStartTimeRef.current = 0
  }, [])

  return { startRecording, stopRecording, onAudioReceived, stopPlayback, closePlayback }
}
