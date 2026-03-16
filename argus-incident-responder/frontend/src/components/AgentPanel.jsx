import { useRef, useEffect, useCallback, useState } from 'react'
import { TranscriptFeed } from './TranscriptFeed'

// ─── Unified waveform ────────────────────────────────────────────────────────
// Single bar waveform that cross-fades color between agent (indigo) and user
// (emerald) depending on who is currently louder. Turns red on interruption.
// Reads both amplitude refs directly each frame — zero React renders.

const BAR_COUNT  = 32
const BASE_JITTER = 0.035
const SMOOTHING   = 0.16
const SILENCE_THRESHOLD = 0.018  // below this = neither is "speaking"
const COLOR_SMOOTH = 0.06        // how fast color cross-fades (lower = slower)

// RGB tuples for lerp
const C_AGENT = [99,  102, 241]  // indigo-500
const C_USER  = [16,  185, 129]  // emerald-500
const C_INTER = [239, 68,  68 ]  // red-500
const C_IDLE  = [75,  85,  99 ]  // gray-600

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function toRgba([r, g, b], alpha) {
  return `rgba(${r},${g},${b},${alpha})`
}

// speakerBlend: 0 = full agent, 1 = full user (cross-fades between them)
// speakerBlendRef is a float ref so we can smooth it in the draw loop

function UnifiedWaveform({ userAmpRef, agentAmpRef, active, interrupted }) {
  const canvasRef       = useRef(null)
  const barsRef         = useRef(new Float32Array(BAR_COUNT).fill(0))
  const rafRef          = useRef(null)
  const blendRef        = useRef(0)   // 0 = agent, 1 = user
  const stateRef        = useRef({ active, interrupted })

  stateRef.current = { active, interrupted }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx  = canvas.getContext('2d')
    const W    = canvas.width
    const H    = canvas.height
    ctx.clearRect(0, 0, W, H)

    const { active: isActive, interrupted: isInt } = stateRef.current
    const userAmp  = isActive ? (userAmpRef?.current  ?? 0) : 0
    const agentAmp = isActive ? (agentAmpRef?.current ?? 0) : 0
    const totalAmp = Math.max(userAmp, agentAmp)

    // Determine blend target: who is louder above silence threshold?
    let blendTarget = blendRef.current
    if (!isActive || totalAmp < SILENCE_THRESHOLD) {
      blendTarget = blendRef.current  // hold last position when silent
    } else if (userAmp > agentAmp) {
      blendTarget = 1
    } else {
      blendTarget = 0
    }
    blendRef.current += (blendTarget - blendRef.current) * COLOR_SMOOTH

    // Compute current color
    let col
    if (!isActive) {
      col = C_IDLE
    } else if (isInt) {
      col = C_INTER
    } else {
      col = lerpColor(C_AGENT, C_USER, blendRef.current)
    }

    const bars  = barsRef.current
    const barW  = W / BAR_COUNT
    const gap   = Math.max(1.5, barW * 0.28)
    const fillW = barW - gap

    for (let i = 0; i < BAR_COUNT; i++) {
      const jitter = BASE_JITTER * (0.5 + 0.5 * Math.sin(Date.now() / 110 + i * 1.4))
      const target = isActive ? Math.min(1, totalAmp * 0.85 + jitter) : jitter * 0.5
      bars[i] += (target - bars[i]) * SMOOTHING

      const barH = Math.max(2, bars[i] * (H * 0.88))
      const x    = i * barW + gap / 2
      const y    = (H - barH) / 2

      const grad = ctx.createLinearGradient(0, y, 0, y + barH)
      grad.addColorStop(0,   toRgba(col, 0.5))
      grad.addColorStop(0.5, toRgba(col, isInt ? 0.5 : 0.92))
      grad.addColorStop(1,   toRgba(col, 0.5))

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(x, y, fillW, barH, fillW / 2)
      ctx.fill()
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [userAmpRef, agentAmpRef])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return <canvas ref={canvasRef} width={220} height={44} className="w-full" />
}


// ─── Orb ────────────────────────────────────────────────────────────────────

function Orb({ active, connected, interrupted, agentAmp }) {
  const scale = active ? 1 + agentAmp * 0.18 : 1

  const orbBg = active
    ? interrupted
      ? 'radial-gradient(circle at 35% 35%, #f87171, #dc2626)'
      : 'radial-gradient(circle at 35% 35%, #a5b4fc, #6366f1, #3730a3)'
    : connected
      ? 'radial-gradient(circle at 35% 35%, #34d399, #10b981, #059669)'
      : 'radial-gradient(circle at 35% 35%, #374151, #111827)'

  const orbShadow = active
    ? interrupted
      ? '0 0 28px 8px rgba(239,68,68,0.55)'
      : `0 0 ${20 + agentAmp * 40}px ${4 + agentAmp * 12}px rgba(99,102,241,0.55)`
    : connected
      ? '0 0 20px 4px rgba(16,185,129,0.45)'
      : '0 2px 12px rgba(0,0,0,0.5)'

  const showRings = active || connected

  return (
    <div className="relative flex items-center justify-center w-20 h-20">
      {showRings && (
        <>
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: interrupted
                ? 'radial-gradient(circle, rgba(239,68,68,0.22) 0%, transparent 70%)'
                : active
                  ? 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
              transform: `scale(${active ? 1 + agentAmp * 0.4 : 1.05})`,
              transition: 'transform 60ms linear, background 0.35s ease',
            }}
          />
          <span
            className="absolute inset-2 rounded-full animate-ping"
            style={{
              background: interrupted
                ? 'rgba(239,68,68,0.25)'
                : active
                  ? 'rgba(99,102,241,0.18)'
                  : 'rgba(16,185,129,0.12)',
              animationDuration: active ? '1.8s' : '2.4s',
            }}
          />
        </>
      )}

      <span
        className="relative flex rounded-full items-center justify-center"
        style={{
          width: 56,
          height: 56,
          background: orbBg,
          boxShadow: orbShadow,
          transform: `scale(${scale})`,
          transition: 'transform 60ms linear, box-shadow 60ms linear, background 0.4s ease',
        }}
      >
        <span
          className="absolute rounded-full"
          style={{
            top: '18%', left: '20%',
            width: '36%', height: '26%',
            background: 'rgba(255,255,255,0.22)',
            filter: 'blur(3px)',
          }}
        />
      </span>
    </div>
  )
}

// ─── Panel ───────────────────────────────────────────────────────────────────

const STATE_STYLES = {
  Offline:      { color: '#4b5563', shadow: 'none',                              pulse: false },
  Listening:    { color: '#34d399', shadow: '0 0 6px rgba(52,211,153,0.6)',      pulse: false },
  Thinking:     { color: '#facc15', shadow: '0 0 6px rgba(250,204,21,0.6)',      pulse: true  },
  Speaking:     { color: '#818cf8', shadow: '0 0 6px rgba(129,140,248,0.6)',     pulse: false },
  Reconnecting: { color: '#fb923c', shadow: '0 0 6px rgba(251,146,60,0.6)',     pulse: true  },
}

export function AgentPanel({ active, connected, onToggle, userAmpRef, agentAmpRef, interrupted = false, messages = [], pastChats = [], viewingChatId, onViewChat, onBackToLive, onClearAllSessions, agentState = 'Offline', onImageSend }) {
  const agentAmpSnap = agentAmpRef?.current ?? 0
  const fileInputRef = useRef(null)

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const [header, base64Data] = dataUrl.split(',')
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
      onImageSend?.(base64Data, mimeType)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [onImageSend])
  return (
    <aside
      className="w-[25%] min-w-[260px] flex flex-col sticky top-0 h-screen overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0d0d1a 0%, #0a0a14 100%)',
        borderLeft: '1px solid rgba(99,102,241,0.14)',
      }}
    >
      {/* Top accent line */}
      <div
        className="h-px w-full flex-shrink-0"
        style={{
          background: active
            ? 'linear-gradient(90deg, transparent, rgba(99,102,241,0.85), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(55,65,81,0.5), transparent)',
          transition: 'background 0.7s ease',
        }}
      />

      <div className="flex flex-col items-center gap-3 px-4 py-4 flex-1 min-h-0">

        {/* Header row: two-column — identity + status | button */}
        <div className="self-stretch flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-300 text-xs font-bold uppercase tracking-widest">
              Argus
            </span>
            <span className="flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0${STATE_STYLES[agentState]?.pulse ? ' animate-pulse' : ''}`}
                style={{
                  background: STATE_STYLES[agentState]?.color ?? '#4b5563',
                  boxShadow: STATE_STYLES[agentState]?.shadow ?? 'none',
                  transition: 'all 0.4s',
                }}
              />
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                {agentState}
              </span>
            </span>
          </div>
          <button
            onClick={onToggle}
            className="px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide flex-shrink-0 active:scale-95"
            style={{
              background: active
                ? 'linear-gradient(135deg, #b91c1c, #dc2626)'
                : 'linear-gradient(135deg, #4338ca, #6366f1)',
              boxShadow: active
                ? '0 2px 8px rgba(220,38,38,0.3)'
                : '0 2px 8px rgba(99,102,241,0.25)',
              color: '#fff',
              border: active
                ? '1px solid rgba(220,38,38,0.5)'
                : '1px solid rgba(99,102,241,0.5)',
              transition: 'all 0.3s ease, transform 0.1s',
            }}
          >
            {active ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        {/* Orb + waveform */}
        <Orb active={active} connected={connected} interrupted={interrupted} agentAmp={agentAmpSnap} />
        <div className="w-full flex-shrink-0 px-1 -mt-1">
          <UnifiedWaveform
            userAmpRef={userAmpRef}
            agentAmpRef={agentAmpRef}
            active={active}
            interrupted={interrupted}
          />
        </div>


        {/* Image upload */}
        {active && (
          <div className="w-full flex justify-center flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
              style={{
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.15)',
              }}
              title="Upload image for analysis"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Upload Image
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="w-full h-px flex-shrink-0" style={{ background: 'rgba(99,102,241,0.1)' }} />

        <TranscriptFeed messages={messages} />

        {/* Past Chats */}
        {!active && pastChats.length > 0 && (
          <>
            <div className="w-full h-px flex-shrink-0" style={{ background: 'rgba(99,102,241,0.1)' }} />
            <div className="w-full flex-shrink-0 flex flex-col gap-1 max-h-[200px] min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                  Past Sessions
                </span>
                <button
                  onClick={onClearAllSessions}
                  className="text-[10px] text-red-400 hover:text-red-300 tracking-wide"
                >
                  Clear All
                </button>
              </div>
              <div className="overflow-y-auto transcript-scroll space-y-0.5">
                {pastChats.map((chat) => {
                  const isViewing = viewingChatId === chat.id
                  const date = chat.created_at
                    ? new Date(chat.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : ''
                  return (
                    <button
                      key={chat.id}
                      onClick={() => onViewChat(chat.id)}
                      className="w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors"
                      style={{
                        background: isViewing ? 'rgba(99,102,241,0.15)' : 'transparent',
                        border: isViewing ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: chat.status === 'active' ? '#34d399' : '#4b5563',
                          }}
                        />
                        <span className="text-gray-400 truncate flex-1">{chat.title || 'Untitled'}</span>
                      </div>
                      {date && (
                        <span className="text-gray-600 text-[10px] ml-3">{date}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

      </div>

      {/* Bottom accent line */}
      <div
        className="h-px w-full flex-shrink-0"
        style={{
          background: active
            ? 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(55,65,81,0.25), transparent)',
          transition: 'background 0.7s ease',
        }}
      />
    </aside>
  )
}
