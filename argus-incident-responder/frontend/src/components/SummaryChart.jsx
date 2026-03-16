import { useMemo } from 'react'

const STATUS_META = {
  MALICIOUS:  { fill: '#ef4444', glow: 'rgba(239,68,68,0.3)',  ring: '#991b1b', label: 'Malicious',  icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z M12 15.75h.007v.008H12v-.008z' },
  SUSPICIOUS: { fill: '#eab308', glow: 'rgba(234,179,8,0.25)', ring: '#854d0e', label: 'Suspicious', icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' },
  CLEAN:      { fill: '#22c55e', glow: 'rgba(34,197,94,0.25)', ring: '#166534', label: 'Clean',      icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
}

const ORDER = ['MALICIOUS', 'SUSPICIOUS', 'CLEAN']

function StatCard({ label, value, sub, accent, glow, icon }) {
  return (
    <div
      className="relative flex-1 min-w-[140px] rounded-xl p-4 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, rgba(17,24,39,0.95) 0%, rgba(17,24,39,0.8) 100%)`,
        border: `1px solid ${accent}22`,
        boxShadow: `0 0 20px ${glow}, inset 0 1px 0 rgba(255,255,255,0.03)`,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}66, transparent)` }} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
          <p className="text-white text-2xl font-bold font-mono tracking-tight leading-none">{value}</p>
          {sub && <p className="text-gray-500 text-[10px] font-mono mt-1.5">{sub}</p>}
        </div>
        {icon && (
          <div className="flex-shrink-0 rounded-lg p-1.5" style={{ background: `${accent}15` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={icon} />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

function DonutChart({ distribution, total }) {
  const sorted = useMemo(() =>
    [...distribution].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)),
    [distribution]
  )

  const segments = useMemo(() => {
    let cum = 0
    return sorted.map((d) => {
      const pct = total > 0 ? (d.count / total) * 100 : 0
      const start = cum
      cum += pct
      return { ...d, pct, start, end: cum }
    })
  }, [sorted, total])

  const size = 160
  const stroke = 20
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex items-center gap-8">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {segments.map((seg) => {
            const meta = STATUS_META[seg.status]
            const dashLen = (seg.pct / 100) * circumference
            const dashOffset = -((seg.start / 100) * circumference)
            return (
              <circle
                key={seg.status}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={meta?.fill ?? '#6b7280'}
                strokeWidth={stroke}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                style={{
                  filter: `drop-shadow(0 0 4px ${meta?.glow ?? 'transparent'})`,
                  transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease',
                }}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white text-xl font-bold font-mono leading-none">
            {total.toLocaleString()}
          </span>
          <span className="text-gray-600 text-[9px] uppercase tracking-widest mt-1">total events</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {segments.map((seg) => {
          const meta = STATUS_META[seg.status]
          return (
            <div key={seg.status} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{
                  background: meta?.fill,
                  boxShadow: `0 0 6px ${meta?.glow ?? 'transparent'}`,
                }}
              />
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-gray-200 text-sm font-mono font-semibold">
                    {seg.count.toLocaleString()}
                  </span>
                  <span className="text-gray-500 text-xs font-mono">
                    {seg.pct.toFixed(1)}%
                  </span>
                </div>
                <span className="text-gray-500 text-[10px] uppercase tracking-wider">{meta?.label ?? seg.status}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BarRow({ label, value, maxValue, accent, glow, sublabel, rank }) {
  const pct = maxValue > 0 ? Math.max(3, (value / maxValue) * 100) : 0
  return (
    <div className="group flex items-center gap-3">
      <span className="text-gray-600 text-[10px] font-mono w-4 text-right flex-shrink-0">{rank}</span>
      <span className="text-gray-300 text-xs font-mono w-28 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-5 rounded overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div
          className="h-full rounded transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${accent}cc, ${accent}88)`,
            boxShadow: `0 0 8px ${glow}`,
          }}
        />
      </div>
      <span className="text-gray-200 text-xs font-mono w-14 text-right flex-shrink-0 font-semibold">
        {value.toLocaleString()}
      </span>
      {sublabel && (
        <span className="text-red-400 text-[10px] font-mono w-20 text-right flex-shrink-0 opacity-80">
          {sublabel}
        </span>
      )}
    </div>
  )
}

function SectionLabel({ children, trailing }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-1 h-3 rounded-full bg-indigo-500/60" />
        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.15em]">{children}</p>
      </div>
      {trailing && <p className="text-gray-600 text-[10px] font-mono uppercase tracking-widest">{trailing}</p>}
    </div>
  )
}

function formatBytes(bytes) {
  const n = Number(bytes)
  if (bytes == null || isNaN(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`
  return `${(n / 1_073_741_824).toFixed(1)} GB`
}

export function SummaryChart({ data }) {
  if (!data || data.length === 0) return null
  const summary = data[0]
  if (summary.error) return null

  const { total_events = 0, threat_distribution = [], top_ports = [], top_source_ips = [] } = summary

  const sorted = [...threat_distribution].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  const malicious = sorted.find(d => d.status === 'MALICIOUS')?.count ?? 0
  const suspicious = sorted.find(d => d.status === 'SUSPICIOUS')?.count ?? 0
  const clean = sorted.find(d => d.status === 'CLEAN')?.count ?? 0
  const threatRate = total_events > 0 ? ((malicious / total_events) * 100).toFixed(1) : '0.0'
  const totalBytes = top_ports.reduce((s, p) => s + (p.total_bytes || 0), 0)

  const maxPortHits = Math.max(...top_ports.map(p => p.total_hits), 1)
  const maxIpHits = Math.max(...top_source_ips.map(ip => ip.total_hits), 1)

  return (
    <div className="flex flex-col gap-5 animate-slide-up-fade">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Events"
          value={total_events.toLocaleString()}
          accent="#6366f1"
          glow="rgba(99,102,241,0.15)"
          icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
        />
        <StatCard
          label="Malicious"
          value={malicious.toLocaleString()}
          sub={`${threatRate}% threat rate`}
          accent="#ef4444"
          glow="rgba(239,68,68,0.15)"
          icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
        />
        <StatCard
          label="Suspicious"
          value={suspicious.toLocaleString()}
          accent="#eab308"
          glow="rgba(234,179,8,0.12)"
          icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
        <StatCard
          label="Clean"
          value={clean.toLocaleString()}
          sub={totalBytes > 0 ? `${formatBytes(totalBytes)} total` : undefined}
          accent="#22c55e"
          glow="rgba(34,197,94,0.12)"
          icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </div>

      {/* Donut + Top Ports side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <SectionLabel>Threat Distribution</SectionLabel>
          <DonutChart distribution={threat_distribution} total={total_events} />
        </div>

        {top_ports.length > 0 && (
          <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <SectionLabel trailing="hits">Top Destination Ports</SectionLabel>
            <div className="flex flex-col gap-2.5">
              {top_ports.map((p, i) => (
                <BarRow
                  key={p.port}
                  rank={i + 1}
                  label={`Port ${p.port}`}
                  value={p.total_hits}
                  maxValue={maxPortHits}
                  accent="#6366f1"
                  glow="rgba(99,102,241,0.2)"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Source IPs */}
      {top_source_ips.length > 0 && (
        <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <SectionLabel trailing="hits · malicious">Top Source IPs</SectionLabel>
          <div className="flex flex-col gap-2.5">
            {top_source_ips.map((ip, i) => (
              <BarRow
                key={ip.src_ip}
                rank={i + 1}
                label={ip.src_ip}
                value={ip.total_hits}
                maxValue={maxIpHits}
                accent="#06b6d4"
                glow="rgba(6,182,212,0.15)"
                sublabel={ip.malicious_hits > 0 ? `${ip.malicious_hits} malicious` : null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
