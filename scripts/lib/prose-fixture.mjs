// Exact-size, non-degenerate test text. Repeated single letters are corruption now.
export function proseFixture(length) {
  let text = '', i = 0
  while (text.length < length) text += `Scene${i++}followsthequietroad.`
  return text.slice(0, length).replace(/\s$/u, '.')
}
