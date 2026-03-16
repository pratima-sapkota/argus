import { useRef, useEffect, useCallback, useState } from 'react'

const RING_COUNT = 3

function FabOrb({ userAmpRef, agentAmpRef, active, interrupted, onClick }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const stateRef = useRef({ active, interrupted })
  stateRef.current = { active, interrupted }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const size = canvas.width
    const cx = size / 2
    const cy = size / 2
    ctx.clearRect(0, 0, size, size)

    const { active: isActive, interrupted: isInt } = stateRef.current
    const userAmp = isActive ? (userAmpRef?.current ?? 0) : 0
    const agentAmp = isActive ? (agentAmpRef?.current ?? 0) : 0
    const totalAmp = Math.max(userAmp, agentAmp)
    const isUserLouder = userAmp > agentAmp && userAmp > 0.02

    let r, g, b
    if (!isActive) {
      r = 148; g = 163; b = 184
    } else if (isInt) {
      r = 239; g = 68; b = 68
    } else if (isUserLouder) {
      r = 16; g = 185; b = 129
    } else if (agentAmp > 0.02) {
      r = 129; g = 140; b = 248
    } else {
      r = 99; g = 102; b = 241
    }

    const time = Date.now() / 1000

    for (let i = 0; i < RING_COUNT; i++) {
      const phase = (time * 1.2 + i * 0.7) % 2
      const progress = phase / 2
      const radius = 32 + progress * (isActive ? 24 + totalAmp * 38 : 16)
      const alpha = (1 - progress) * (isActive ? 0.35 + totalAmp * 0.3 : 0.15)

      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const coreRadius = 28 + (isActive ? totalAmp * 5 : 0)
    const grad = ctx.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, coreRadius)
    if (!isActive) {
      grad.addColorStop(0, 'rgba(148, 163, 184, 0.9)')
      grad.addColorStop(1, 'rgba(100, 116, 139, 0.9)')
    } else {
      grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`)
      grad.addColorStop(1, `rgba(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)},0.95)`)
    }

    ctx.beginPath()
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    ctx.beginPath()
    ctx.ellipse(cx - 5, cy - 7, 10, 7, -0.4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fill()

    rafRef.current = requestAnimationFrame(draw)
  }, [userAmpRef, agentAmpRef])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <div className="relative" style={{ width: 88, height: 88 }}>
      <canvas
        ref={canvasRef}
        width={160}
        height={160}
        className="absolute pointer-events-none"
        style={{ width: 160, height: 160, left: -36, top: -36 }}
      />
      <button
        onClick={onClick}
        className="relative w-full h-full cursor-pointer focus:outline-none active:scale-95 transition-transform"
        aria-label={active ? 'Disconnect' : 'Connect'}
      />
    </div>
  )
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

export function FloatingAgent({
  active, onToggle, userAmpRef, agentAmpRef, interrupted,
  onImageSend, wsError, agentState,
}) {
  const fileInputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const dragCounterRef = useRef(0)

  useEffect(() => {
    if (!uploadError) return
    const t = setTimeout(() => setUploadError(null), 4000)
    return () => clearTimeout(t)
  }, [uploadError])

  useEffect(() => {
    if (agentState === 'Speaking') setImagePreview(null)
  }, [agentState])

  const processFile = useCallback((file) => {
    if (!file?.type.startsWith('image/')) return
    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const [header, base64Data] = dataUrl.split(',')
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
      setImagePreview(dataUrl)
      onImageSend?.(base64Data, mimeType)
    }
    reader.readAsDataURL(file)
  }, [onImageSend])

  useEffect(() => {
    if (!active) return
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          processFile(item.getAsFile())
          return
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [active, processFile])

  const handleFileSelect = useCallback((e) => {
    processFile(e.target.files?.[0])
    e.target.value = ''
  }, [processFile])

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer?.types?.includes('Files')) setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2"
      onDragEnter={active ? handleDragEnter : undefined}
      onDragLeave={active ? handleDragLeave : undefined}
      onDragOver={active ? handleDragOver : undefined}
      onDrop={active ? handleDrop : undefined}
    >
      {/* Error toast */}
      {(uploadError || wsError) && (
        <div
          className="px-3 py-2 rounded-lg text-xs text-red-300 animate-slide-up-fade whitespace-nowrap"
          style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)' }}
        >
          {uploadError || wsError}
        </div>
      )}

      {/* Image upload icon — right-aligned above orb */}
      {active && (
        <div className="relative self-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
            className="flex items-center justify-center w-12 h-12 rounded-full transition-all hover:scale-110 active:scale-95 overflow-hidden"
            style={{
              background: isDragOver ? 'rgba(99,102,241,0.3)' : imagePreview ? 'transparent' : 'rgba(99,102,241,0.12)',
              border: isDragOver ? '2px dashed rgba(129,140,248,0.8)' : imagePreview ? '2px solid rgba(129,140,248,0.6)' : '1px solid rgba(99,102,241,0.25)',
              boxShadow: isDragOver ? '0 0 12px rgba(99,102,241,0.4)' : imagePreview ? '0 0 8px rgba(99,102,241,0.3)' : 'none',
            }}
            title="Upload image (or Ctrl+V to paste)"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Uploaded" className="w-full h-full object-cover" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(165,180,252,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </button>
          {isDragOver && (
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-indigo-300 text-[10px] whitespace-nowrap font-medium">
              Drop image here
            </span>
          )}
        </div>
      )}

      {/* FAB orb with state label */}
      <div className="relative flex items-center justify-center">
        {active && agentState && (
          <span
            className="absolute right-full mr-2 text-[11px] font-medium tracking-wide uppercase animate-slide-up-fade whitespace-nowrap"
            style={{
              color: agentState === 'Speaking' ? 'rgba(129,140,248,0.9)'
                : agentState === 'Thinking' ? 'rgba(251,191,36,0.9)'
                : agentState === 'Reconnecting' ? 'rgba(239,68,68,0.9)'
                : 'rgba(156,163,175,0.7)',
            }}
          >
            {agentState}
          </span>
        )}
        <FabOrb
          userAmpRef={userAmpRef}
          agentAmpRef={agentAmpRef}
          active={active}
          interrupted={interrupted}
          onClick={onToggle}
        />
      </div>
    </div>
  )
}
