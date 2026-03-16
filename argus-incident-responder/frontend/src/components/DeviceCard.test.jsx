import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DeviceCard } from './DeviceCard'

describe('DeviceCard', () => {
  it('renders device id and status', () => {
    render(<DeviceCard device_id="10.0.0.1" status="ALLOWED" />)
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
    expect(screen.getByText('ALLOWED')).toBeInTheDocument()
  })

  it('renders blocked styling', () => {
    const { container } = render(<DeviceCard device_id="10.0.0.2" status="BLOCKED" />)
    const card = container.firstChild
    expect(card.className).toContain('border-red-500')
  })

  it('renders allowed styling', () => {
    const { container } = render(<DeviceCard device_id="10.0.0.1" status="ALLOWED" />)
    const card = container.firstChild
    expect(card.className).toContain('border-gray-700')
  })

  it('renders hit count', () => {
    render(<DeviceCard device_id="10.0.0.1" status="ALLOWED" hits={42} />)
    expect(screen.getByText('42 hits')).toBeInTheDocument()
  })

  it('renders singular hit for count of 1', () => {
    render(<DeviceCard device_id="10.0.0.1" status="ALLOWED" hits={1} />)
    expect(screen.getByText('1 hit')).toBeInTheDocument()
  })

  it('renders dash when hits is null', () => {
    render(<DeviceCard device_id="10.0.0.1" status="ALLOWED" />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })
})
