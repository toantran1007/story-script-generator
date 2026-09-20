// Offline API stub, not a mock of production gate validation. Correction call
// counts in legacy suites exclude this separately exercised provider endpoint.
export function nativeGateResponse(messages) {
  if (!messages[0].content.startsWith('INDEPENDENT LANGUAGE GATE:')) return null
  return { text: JSON.stringify({ language: JSON.parse(messages[1].content).language, complete: true, chapterReview: { complete: true, noRepeatedCompletion: true, noPrematureCompletion: true, knowledgeConsistent: true }, issues: [], unresolved: [] }), finishReason: 'stop' }
}
