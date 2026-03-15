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

const RMS_THRESHOLD = 0.15      // ~-16 dBFS — filters ambient noise, requires clear speech
const SPEECH_COOLDOWN_MS = 300  // minimum ms between onSpeechStart fires
const SPEECH_CONFIRM_FRAMES = 6 // consecutive frames above threshold before firing

export function useAudio({ onChunk, onSpeechStart, onUserAmplitude, onAgentAmplitude, onAgentSpeakingStart, onAgentSpeakingEnd }) {
  // Capture refs
  const captureCtxRef = useRef(null)
  const processorRef = useRef(null)
  const streamRef = useRef(null)

  // Playback refs
  const playbackCtxRef = useRef(null)
  const nextStartTimeRef = useRef(0)
  const agentAnalyserRef = useRef(null)
  const agentAnimFrameRef = useRef(null)
  const activeSourcesRef = useRef(new Set())  // tracks started BufferSourceNodes
  const isInterruptedRef  = useRef(false)      // gates onAudioReceived during interrupt
  const agentSpeakingRef  = useRef(false)      // true while agent audio is scheduled/playing

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

      let sumSq = 0
      for (let i = 0; i < float32.length; i++) sumSq += float32[i] * float32[i]
      const rms = Math.sqrt(sumSq / float32.length)

      // Emit user amplitude for waveform visualization
      onUserAmplitude?.(rms)

      // VAD: require SPEECH_CONFIRM_FRAMES consecutive frames above threshold.
      // Skip entirely while agent is playing — mic bleed from speakers would
      // otherwise trigger stopPlayback() and set isInterruptedRef = true.
      if (onSpeechStart && !agentSpeakingRef.current) {
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
  }, [onChunk, onSpeechStart, onUserAmplitude])

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
      const playCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      // Browsers start AudioContext suspended when created outside a user gesture.
      // Must resume explicitly or source.start() calls are silently dropped.
      playCtx.resume()
      playbackCtxRef.current = playCtx
      nextStartTimeRef.current = 0
      console.log('[audio] playback ctx created, state:', playCtx.state)

      // Create analyser for agent amplitude
      const analyser = playCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.connect(playCtx.destination)
      agentAnalyserRef.current = analyser

      // Poll analyser for amplitude
      const dataArray = new Uint8Array(analyser.fftSize)
      const poll = () => {
        analyser.getByteTimeDomainData(dataArray)
        let sumSq = 0
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128
          sumSq += v * v
        }
        onAgentAmplitude?.(Math.sqrt(sumSq / dataArray.length))
        agentAnimFrameRef.current = requestAnimationFrame(poll)
      }
      agentAnimFrameRef.current = requestAnimationFrame(poll)
    }

    if (isInterruptedRef.current) {
      console.log('[audio] packet blocked — isInterrupted=true')
      return
    }

    const playCtx = playbackCtxRef.current
    const analyser = agentAnalyserRef.current
    const float32 = base64Pcm16ToFloat32(base64)

    const buffer = playCtx.createBuffer(1, float32.length, TARGET_SAMPLE_RATE)
    buffer.copyToChannel(float32, 0)

    const source = playCtx.createBufferSource()
    source.buffer = buffer
    // Route through analyser so amplitude is measured
    source.connect(analyser)

    const now = playCtx.currentTime
    const startAt = Math.max(now + LOOKAHEAD, nextStartTimeRef.current)
    console.log('[audio] scheduling packet — ctx.state:', playCtx.state, 'now:', now.toFixed(3), 'startAt:', startAt.toFixed(3), 'samples:', float32.length)
    if (!agentSpeakingRef.current) {
      agentSpeakingRef.current = true
      onAgentSpeakingStart?.()
    }
    source.start(startAt)
    activeSourcesRef.current.add(source)
    source.onended = () => {
      activeSourcesRef.current.delete(source)
      if (activeSourcesRef.current.size === 0) {
        agentSpeakingRef.current = false
        onAgentSpeakingEnd?.()
      }
    }
    nextStartTimeRef.current = startAt + buffer.duration
  }, [onAgentAmplitude, onAgentSpeakingStart, onAgentSpeakingEnd])

  const stopPlayback = useCallback(() => {
    // Only interrupt if the agent is actually speaking — don't gate on noise
    // that fires before any audio has arrived.
    if (!agentSpeakingRef.current) return
    isInterruptedRef.current = true
    agentSpeakingRef.current = false
    onAgentSpeakingEnd?.()
    activeSourcesRef.current.forEach((source) => {
      try { source.stop() } catch { /* already ended */ }
    })
    activeSourcesRef.current.clear()
    nextStartTimeRef.current = 0
  }, [onAgentSpeakingEnd])

  const clearInterrupt = useCallback(() => {
    isInterruptedRef.current = false
  }, [])

  const closePlayback = useCallback(() => {
    if (agentAnimFrameRef.current) {
      cancelAnimationFrame(agentAnimFrameRef.current)
      agentAnimFrameRef.current = null
    }
    agentAnalyserRef.current = null
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close()
      playbackCtxRef.current = null
    }
    activeSourcesRef.current.clear()
    isInterruptedRef.current = false
    agentSpeakingRef.current = false
    nextStartTimeRef.current = 0
  }, [])

  return { startRecording, stopRecording, onAudioReceived, stopPlayback, clearInterrupt, closePlayback }
}
