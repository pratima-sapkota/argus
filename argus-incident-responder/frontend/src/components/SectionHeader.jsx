const COLOR_DOT = {
  red:    'bg-red-500',
  blue:   'bg-blue-500',
  yellow: 'bg-yellow-500',
  cyan:   'bg-cyan-500',
}

const COLOR_TEXT = {
  red:    'text-red-400',
  blue:   'text-blue-400',
  yellow: 'text-yellow-400',
  cyan:   'text-cyan-400',
}

const COLOR_BADGE = {
  red:    'bg-red-950 text-red-400',
  blue:   'bg-blue-950 text-blue-400',
  yellow: 'bg-yellow-950 text-yellow-400',
  cyan:   'bg-cyan-950 text-cyan-400',
}

export function SectionHeader({ title, color = 'blue', count }) {
  const dot   = COLOR_DOT[color]   ?? 'bg-gray-500'
  const text  = COLOR_TEXT[color]  ?? 'text-gray-400'
  const badge = COLOR_BADGE[color] ?? 'bg-gray-800 text-gray-400'

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      <h2 className={`text-xs font-semibold uppercase tracking-widest ${text}`}>
        {title}
      </h2>
      {count != null && (
        <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${badge}`}>
          {count} {count === 1 ? 'entry' : 'entries'}
        </span>
      )}
    </div>
  )
}
