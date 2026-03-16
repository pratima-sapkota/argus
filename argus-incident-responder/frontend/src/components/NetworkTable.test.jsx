import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NetworkTable } from './NetworkTable'

const SAMPLE_ROWS = [
  {
    log_id: 'L001',
    src_ip: '10.0.0.1',
    dest_ip: '1.2.3.4',
    dest_port: 443,
    timestamp: '2025-01-15T12:00:00Z',
    bytes: 2048,
    threat_intel_status: 'MALICIOUS',
  },
  {
    log_id: 'L002',
    src_ip: '10.0.0.2',
    dest_ip: '5.6.7.8',
    dest_port: 80,
    timestamp: '2025-01-15T11:00:00Z',
    bytes: 512,
    threat_intel_status: 'CLEAN',
  },
]

describe('NetworkTable', () => {
  it('returns null for empty rows', () => {
    const { container } = render(<NetworkTable rows={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null for undefined rows', () => {
    const { container } = render(<NetworkTable rows={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders threat variant with correct columns', () => {
    render(<NetworkTable rows={SAMPLE_ROWS} variant="threats" />)
    expect(screen.getByText('Log ID')).toBeInTheDocument()
    expect(screen.getByText('Source IP')).toBeInTheDocument()
    expect(screen.getByText('Dest IP')).toBeInTheDocument()
    expect(screen.getByText('Port')).toBeInTheDocument()
    expect(screen.getByText('Bytes')).toBeInTheDocument()
  })

  it('renders traffic variant without dest ip/port', () => {
    render(<NetworkTable rows={SAMPLE_ROWS} variant="traffic" />)
    expect(screen.getByText('Log ID')).toBeInTheDocument()
    expect(screen.getByText('Source IP')).toBeInTheDocument()
    expect(screen.queryByText('Dest IP')).not.toBeInTheDocument()
    expect(screen.queryByText('Port')).not.toBeInTheDocument()
  })

  it('renders all rows', () => {
    render(<NetworkTable rows={SAMPLE_ROWS} variant="threats" />)
    expect(screen.getByText('L001')).toBeInTheDocument()
    expect(screen.getByText('L002')).toBeInTheDocument()
  })

  it('formats bytes correctly', () => {
    render(<NetworkTable rows={SAMPLE_ROWS} variant="threats" />)
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    expect(screen.getByText('512 B')).toBeInTheDocument()
  })

  it('renders status badges', () => {
    render(<NetworkTable rows={SAMPLE_ROWS} variant="threats" />)
    expect(screen.getByText('MALICIOUS')).toBeInTheDocument()
    expect(screen.getByText('CLEAN')).toBeInTheDocument()
  })
})
