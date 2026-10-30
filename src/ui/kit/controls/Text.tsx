// TEXT — words, by role. Size and font come from the style; never set them yourself.
// kind: display (huge title) | title | heading | body | label | caption (quiet)
// translate="no" (0.37.0, F156): words that are never translated — a player's name, a room code. A browser's translate
// button and the fake language (?pseudo) both leave them as they are.
import type { ReactNode } from 'react'

type Kind = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption'
const tagFor = { display: 'h1', title: 'h2', heading: 'h3', body: 'p', label: 'span', caption: 'span' } as const

export function Text({ kind = 'body', translate, children }: { kind?: Kind; translate?: 'no'; children: ReactNode }) {
  const Tag = tagFor[kind]
  return <Tag className="kit-text" data-kind={kind} translate={translate}>{children}</Tag>
}
