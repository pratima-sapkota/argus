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

export function SectionHeader({ title, color = 'blue', count, expanded, onToggle }) {
  const dot   = COLOR_DOT[color]   ?? 'bg-gray-500'
  const text  = COLOR_TEXT[color]  ?? 'text-gray-400'
  const badge = COLOR_BADGE[color] ?? 'bg-gray-800 text-gray-400'
  const collapsible = onToggle != null

  return (
    <div
      className={`flex items-center gap-2 ${collapsible ? 'cursor-pointer select-none' : 'mb-3'} ${collapsible && expanded ? 'mb-3' : ''}`}
      onClick={onToggle}
    >
      {collapsible && (
        <svg
          className="w-3.5 h-3.5 text-gray-500 transition-transform duration-200 flex-shrink-0"
          style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      )}
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
