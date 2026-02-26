export function DeviceCard({ device_id, status, hits, last_seen }) {
  const blocked = status === 'BLOCKED'

  const cardClass = blocked
    ? 'border border-red-500 bg-red-950 rounded-lg p-4 transition-colors duration-150'
    : 'border border-gray-700 bg-gray-900 rounded-lg p-4 transition-colors duration-150'

  const statusClass = blocked
    ? 'text-xs font-bold uppercase tracking-widest text-red-400'
    : 'text-xs font-bold uppercase tracking-widest text-green-400'

  const formattedTime = last_seen
    ? new Date(last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white text-sm font-mono truncate">{device_id}</span>
        <span className={statusClass}>{status}</span>
      </div>
      <div className="flex items-center justify-between text-gray-500 text-xs">
        <span>{hits != null ? `${hits} hit${hits !== 1 ? 's' : ''}` : '—'}</span>
        <span>{formattedTime}</span>
      </div>
    </div>
  )
}
