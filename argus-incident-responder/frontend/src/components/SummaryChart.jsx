const STATUS_COLOR = {
  MALICIOUS:  { fill: '#ef4444', bg: 'bg-red-500',    text: 'text-red-400',    label: 'Malicious' },
  SUSPICIOUS: { fill: '#eab308', bg: 'bg-yellow-500', text: 'text-yellow-400', label: 'Suspicious' },
  CLEAN:      { fill: '#22c55e', bg: 'bg-green-500',  text: 'text-green-400',  label: 'Clean' },
}

function DonutChart({ distribution, total }) {
  // Build conic-gradient stops from sorted distribution data
  const order = ['MALICIOUS', 'SUSPICIOUS', 'CLEAN']
  const sorted = [...distribution].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status)
  )

  let cumPct = 0
  const stops = sorted.map((d) => {
    const pct = total > 0 ? (d.count / total) * 100 : 0
    const start = cumPct
    cumPct += pct
    return { ...d, pct, start, end: cumPct }
  })

  const gradient = stops
    .map((s) => {
      const color = STATUS_COLOR[s.status]?.fill ?? '#6b7280'
      return `${color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`
    })
    .join(', ')

  return (
    <div className="flex items-center gap-6">
      {/* Donut */}
      <div className="relative flex-shrink-0" style={{ width: 96, height: 96 }}>
        <div
          className="w-full h-full rounded-full"
          style={{ background: `conic-gradient(${gradient})` }}
        />
        {/* Center hole */}
        <div
          className="absolute rounded-full flex flex-col items-center justify-center"
          style={{
            top: '22%', left: '22%',
            width: '56%', height: '56%',
            background: '#111827',
          }}
        >
          <span className="text-white text-xs font-bold font-mono leading-none">
            {total.toLocaleString()}
          </span>
          <span className="text-gray-600 text-[9px] uppercase tracking-wide mt-0.5">events</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-1.5">
        {stops.map((s) => {
          const c = STATUS_COLOR[s.status] ?? { bg: 'bg-gray-500', text: 'text-gray-400', label: s.status }
          return (
            <div key={s.status} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.bg}`} />
              <span className={`text-xs font-mono ${c.text} w-20`}>{c.label}</span>
              <span className="text-gray-300 text-xs font-mono font-semibold">
                {s.count.toLocaleString()}
              </span>
              <span className="text-gray-600 text-xs font-mono">
                {s.pct.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HorizontalBar({ label, value, maxValue, accent, sublabel }) {
  const pct = maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 text-xs font-mono w-28 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-4 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${pct}%`, background: accent, opacity: 0.85 }}
        />
      </div>
      <span className="text-gray-300 text-xs font-mono w-14 text-right flex-shrink-0">
        {value.toLocaleString()}
      </span>
      {sublabel && (
        <span className="text-red-400 text-xs font-mono w-20 text-right flex-shrink-0">
          {sublabel}
        </span>
      )}
    </div>
  )
}

export function SummaryChart({ data }) {
  if (!data || data.length === 0) return null
  const summary = data[0]
  if (summary.error) return null

  const { total_events = 0, threat_distribution = [], top_ports = [], top_source_ips = [] } = summary

  const maxPortHits = Math.max(...top_ports.map((p) => p.total_hits), 1)
  const maxIpHits   = Math.max(...top_source_ips.map((ip) => ip.total_hits), 1)

  return (
    <div className="flex flex-col gap-5">
      {/* Row 1: Donut + Top Ports side by side */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Threat Distribution */}
        <div className="flex-1 min-w-0">
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-3">
            Threat Distribution
          </p>
          <DonutChart distribution={threat_distribution} total={total_events} />
        </div>

        {/* Top Ports */}
        {top_ports.length > 0 && (
          <div className="flex-1 min-w-0">
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-3">
              Top Destination Ports
            </p>
            <div className="flex flex-col gap-2">
              {top_ports.map((p) => (
                <HorizontalBar
                  key={p.port}
                  label={`Port ${p.port}`}
                  value={p.total_hits}
                  maxValue={maxPortHits}
                  accent="#6366f1"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Top Source IPs */}
      {top_source_ips.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
              Top Source IPs
            </p>
            <p className="text-gray-600 text-[10px] font-mono uppercase tracking-widest">
              hits · malicious
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {top_source_ips.map((ip) => (
              <HorizontalBar
                key={ip.src_ip}
                label={ip.src_ip}
                value={ip.total_hits}
                maxValue={maxIpHits}
                accent="#06b6d4"
                sublabel={ip.malicious_hits > 0 ? `${ip.malicious_hits} malicious` : null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
