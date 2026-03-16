function formatBytes(bytes) {
  const n = Number(bytes)
  if (bytes == null || isNaN(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1_048_576).toFixed(1)} MB`
}

function formatTimestamp(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_ROW = {
  MALICIOUS:  'bg-red-950 border-l-2 border-l-red-500',
  SUSPICIOUS: 'bg-yellow-950 border-l-2 border-l-yellow-500',
  CLEAN:      '',
}

const STATUS_BADGE = {
  MALICIOUS:  'bg-red-900 text-red-300',
  SUSPICIOUS: 'bg-yellow-900 text-yellow-300',
  CLEAN:      'bg-green-900 text-green-300',
}

const STATUS_DOT = {
  MALICIOUS:  'bg-red-500',
  SUSPICIOUS: 'bg-yellow-500',
  CLEAN:      'bg-green-500',
}

// columns to render and their display labels
// each column: { key, label, render? }
const THREAT_COLS = [
  { key: 'log_id',              label: 'Log ID' },
  { key: 'threat_intel_status', label: 'Status' },
  { key: 'src_ip',              label: 'Source IP' },
  { key: 'dest_ip',             label: 'Dest IP' },
  { key: 'dest_port',           label: 'Port' },
  { key: 'bytes',               label: 'Bytes',     render: (v) => formatBytes(v) },
  { key: 'timestamp',           label: 'Timestamp', render: (v) => formatTimestamp(v) },
]

const TRAFFIC_COLS = [
  { key: 'log_id',              label: 'Log ID' },
  { key: 'threat_intel_status', label: 'Status' },
  { key: 'src_ip',              label: 'Source IP' },
  { key: 'bytes',               label: 'Bytes',     render: (v) => formatBytes(v) },
  { key: 'timestamp',           label: 'Timestamp', render: (v) => formatTimestamp(v) },
]

const CONNECTION_COLS = [
  { key: 'device_id',  label: 'Device ID' },
  { key: 'status',     label: 'Status' },
  { key: 'hits',       label: 'Hits' },
  { key: 'last_seen',  label: 'Last Seen', render: (v) => formatTimestamp(v) },
]

function StatusBadge({ status }) {
  const badge = STATUS_BADGE[status] ?? 'bg-gray-800 text-gray-400'
  const dot   = STATUS_DOT[status]   ?? 'bg-gray-500'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-semibold ${badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status ?? 'UNKNOWN'}
    </span>
  )
}

const CONNECTION_STATUS_ROW = {
  BLOCKED: 'bg-red-950 border-l-2 border-l-red-500',
  ALLOWED: '',
  ACTIVE:  '',
  SUSPICIOUS: 'bg-yellow-950 border-l-2 border-l-yellow-500',
}

const CONNECTION_STATUS_BADGE = {
  BLOCKED:    'bg-red-900 text-red-300',
  ALLOWED:    'bg-green-900 text-green-300',
  ACTIVE:     'bg-green-900 text-green-300',
  SUSPICIOUS: 'bg-yellow-900 text-yellow-300',
}

const CONNECTION_STATUS_DOT = {
  BLOCKED:    'bg-red-500',
  ALLOWED:    'bg-green-500',
  ACTIVE:     'bg-green-500',
  SUSPICIOUS: 'bg-yellow-500',
}

function ConnectionStatusBadge({ status }) {
  const badge = CONNECTION_STATUS_BADGE[status] ?? 'bg-gray-800 text-gray-400'
  const dot   = CONNECTION_STATUS_DOT[status]   ?? 'bg-gray-500'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-semibold ${badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status ?? 'UNKNOWN'}
    </span>
  )
}

function TableRow({ row, cols, index, isConnection }) {
  const status = isConnection ? (row.status ?? 'ACTIVE') : (row.threat_intel_status ?? 'MALICIOUS')
  const rowClass = isConnection ? (CONNECTION_STATUS_ROW[status] ?? '') : (STATUS_ROW[status] ?? '')
  return (
    <tr
      className={`border-b border-gray-800 text-sm font-mono transition-colors hover:brightness-110 animate-slide-up-fade ${rowClass}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {cols.map((col) => {
        if (col.key === 'threat_intel_status') {
          return (
            <td key={col.key} className="px-4 py-2 whitespace-nowrap">
              <StatusBadge status={row[col.key]} />
            </td>
          )
        }
        if (col.key === 'status' && isConnection) {
          return (
            <td key={col.key} className="px-4 py-2 whitespace-nowrap">
              <ConnectionStatusBadge status={row[col.key]} />
            </td>
          )
        }
        const value = col.render ? col.render(row[col.key]) : (row[col.key] ?? '—')
        const textColor = col.key === 'dest_ip' ? 'text-red-300' : 'text-gray-200'
        return (
          <td key={col.key} className={`px-4 py-2 whitespace-nowrap ${textColor}`}>
            {value}
          </td>
        )
      })}
    </tr>
  )
}

export function NetworkTable({ rows, variant = 'threats' }) {
  const cols = variant === 'connections' ? CONNECTION_COLS : variant === 'threats' ? THREAT_COLS : TRAFFIC_COLS

  if (!rows || rows.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-gray-900 text-gray-500 text-xs uppercase tracking-widest">
            {cols.map((col) => (
              <th key={col.key} className="px-4 py-3 font-semibold whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-gray-950">
          {rows.map((row, idx) => (
            <TableRow key={row.log_id ?? row.device_id ?? idx} row={row} cols={cols} index={idx} isConnection={variant === 'connections'} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
