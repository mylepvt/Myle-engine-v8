import * as React from 'react'

type OptionLike = { value?: unknown; children?: React.ReactNode }

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

/**
 * Label of the <option> whose value matches (searches inside <optgroup> too).
 * `first` is the first option's label — what a native select shows when nothing matches.
 */
export function selectedOptionLabel(children: React.ReactNode, value: unknown): { found: string | null; first: string | null } {
  let first: string | null = null
  let found: string | null = null
  const walk = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (found !== null || !React.isValidElement<OptionLike>(child)) return
      if (child.type === 'optgroup' || child.type === React.Fragment) {
        walk(child.props.children)
        return
      }
      if (child.type !== 'option') return
      const optionValue = child.props.value ?? textOf(child.props.children)
      const label = textOf(child.props.children)
      if (first === null) first = label
      if (String(optionValue) === String(value ?? '')) found = label
    })
  }
  walk(children)
  return { found, first }
}
