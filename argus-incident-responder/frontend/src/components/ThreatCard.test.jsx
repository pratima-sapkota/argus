import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ThreatCard } from './ThreatCard'

describe('ThreatCard', () => {
  const baseProps = {
    log_id: 'L001',
    src_ip: '10.0.0.1',
    dest_ip: '1.2.3.4',
    dest_port: 443,
    threat_intel_status: 'MALICIOUS',
    timestamp: '2025-01-15T12:00:00Z',
    bytes: 6000000,
  }

  it('renders log id and source ip', () => {
    render(<ThreatCard {...baseProps} />)
    expect(screen.getByText('L001')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
  })

  it('renders status label', () => {
    render(<ThreatCard {...baseProps} />)
    expect(screen.getByText('MALICIOUS')).toBeInTheDocument()
  })

  it('defaults to MALICIOUS when status is null', () => {
    render(<ThreatCard {...baseProps} threat_intel_status={null} />)
    expect(screen.getByText('MALICIOUS')).toBeInTheDocument()
  })

  it('renders dest ip and port', () => {
    render(<ThreatCard {...baseProps} />)
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
    expect(screen.getByText(':443')).toBeInTheDocument()
  })

  it('formats bytes as MB', () => {
    render(<ThreatCard {...baseProps} />)
    expect(screen.getByText('5.7 MB')).toBeInTheDocument()
  })

  it('renders SUSPICIOUS styling', () => {
    const { container } = render(<ThreatCard {...baseProps} threat_intel_status="SUSPICIOUS" />)
    expect(screen.getByText('SUSPICIOUS')).toBeInTheDocument()
    expect(container.firstChild.className).toContain('border-yellow-600')
  })

  it('renders CLEAN styling', () => {
    const { container } = render(<ThreatCard {...baseProps} threat_intel_status="CLEAN" />)
    expect(screen.getByText('CLEAN')).toBeInTheDocument()
    expect(container.firstChild.className).toContain('border-green-700')
  })
})
