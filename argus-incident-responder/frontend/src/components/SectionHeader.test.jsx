import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SectionHeader } from './SectionHeader'

describe('SectionHeader', () => {
  it('renders title', () => {
    render(<SectionHeader title="Threats" />)
    expect(screen.getByText('Threats')).toBeInTheDocument()
  })

  it('renders entry count badge', () => {
    render(<SectionHeader title="Threats" count={5} />)
    expect(screen.getByText('5 entries')).toBeInTheDocument()
  })

  it('renders singular entry for count of 1', () => {
    render(<SectionHeader title="Threats" count={1} />)
    expect(screen.getByText('1 entry')).toBeInTheDocument()
  })

  it('does not render badge when count is null', () => {
    render(<SectionHeader title="Threats" />)
    expect(screen.queryByText(/entries/)).not.toBeInTheDocument()
  })

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(<SectionHeader title="Threats" onToggle={onToggle} expanded={false} />)
    fireEvent.click(screen.getByText('Threats'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows chevron when collapsible', () => {
    render(<SectionHeader title="Threats" onToggle={() => {}} expanded={true} />)
    expect(document.querySelector('svg')).toBeInTheDocument()
  })

  it('does not show chevron when not collapsible', () => {
    render(<SectionHeader title="Threats" />)
    expect(document.querySelector('svg')).not.toBeInTheDocument()
  })
})
