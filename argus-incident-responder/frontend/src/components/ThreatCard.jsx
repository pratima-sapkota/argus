const STATUS_STYLES = {
  MALICIOUS:  { border: 'border-red-700',    badge: 'bg-red-900 text-red-300',       dot: 'bg-red-500',    label: 'MALICIOUS'  },
  SUSPICIOUS: { border: 'border-yellow-600', badge: 'bg-yellow-900 text-yellow-300', dot: 'bg-yellow-500', label: 'SUSPICIOUS' },
  CLEAN:      { border: 'border-green-700',  badge: 'bg-green-900 text-green-300',   dot: 'bg-green-500',  label: 'CLEAN'      },
}
const DEFAULT_STYLE = { border: 'border-gray-700', badge: 'bg-gray-800 text-gray-400', dot: 'bg-gray-500', label: 'UNKNOWN' }

function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

export function ThreatCard({ log_id, src_ip, dest_ip, dest_port, threat_intel_status, timestamp, bytes, animationDelay = 0 }) {
  const effectiveStatus = threat_intel_status ?? 'MALICIOUS'
  const s = STATUS_STYLES[effectiveStatus] ?? DEFAULT_STYLE
  return (
    <div
      className={`animate-slide-up-fade rounded-lg border ${s.border} bg-gray-900 px-4 py-3 flex flex-col gap-2`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-semibold ${s.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
        <span className="text-gray-600 text-xs font-mono truncate">{log_id}</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-mono">
        <span><span className="text-gray-500 text-xs mr-1">SRC</span><span className="text-white">{src_ip ?? '—'}</span></span>
        {dest_ip && (
          <span>
            <span className="text-gray-500 text-xs mr-1">DST</span>
            <span className="text-red-300">{dest_ip}</span>
            {dest_port != null && <span className="text-gray-500 ml-1">:{dest_port}</span>}
          </span>
        )}
        {dest_port != null && !dest_ip && (
          <span><span className="text-gray-500 text-xs mr-1">PORT</span><span className="text-yellow-300">{dest_port}</span></span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{timestamp ? new Date(timestamp).toLocaleString() : '—'}</span>
        <span className="font-mono">{formatBytes(bytes)}</span>
      </div>
    </div>
  )
}
