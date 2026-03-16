import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TranscriptFeed } from './TranscriptFeed'

describe('TranscriptFeed', () => {
  it('shows placeholder when empty', () => {
    render(<TranscriptFeed messages={[]} />)
    expect(screen.getByText('Transcript will appear here')).toBeInTheDocument()
  })

  it('renders agent messages', () => {
    const messages = [{ role: 'agent', text: 'I found 3 threats.' }]
    render(<TranscriptFeed messages={messages} />)
    expect(screen.getByText('I found 3 threats.')).toBeInTheDocument()
  })

  it('renders user messages', () => {
    const messages = [{ role: 'user', text: 'Show me the threats.' }]
    render(<TranscriptFeed messages={messages} />)
    expect(screen.getByText('Show me the threats.')).toBeInTheDocument()
  })

  it('renders multiple messages in order', () => {
    const messages = [
      { role: 'user', text: 'Query network logs' },
      { role: 'agent', text: 'Here are the results' },
    ]
    const { container } = render(<TranscriptFeed messages={messages} />)
    const texts = container.textContent
    expect(texts).toContain('Query network logs')
    expect(texts).toContain('Here are the results')
  })

  it('renders user image when present', () => {
    const messages = [{ role: 'user', text: 'Check this', image: 'data:image/png;base64,abc' }]
    render(<TranscriptFeed messages={messages} />)
    const img = screen.getByAltText('Uploaded')
    expect(img).toBeInTheDocument()
    expect(img.src).toBe('data:image/png;base64,abc')
  })
})
