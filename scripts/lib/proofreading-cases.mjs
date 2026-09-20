// Test data only. Never imported by production prompts or replacement logic.
export const proofreadingCases = [
  { language: 'ja', premise: 'The protagonist is a master swordsman honored as Sword Saint. He restrains an enemy with a feint. A doctor then treats an injured guard.',
    draft: '村人は彼を牽制と呼んだ。\n彼は敵を牽制した。\n医師は負傷した衛兵を直した。',
    edits: [{ before: '村人は彼を牽制と呼んだ。', after: '村人は彼を剣聖と呼んだ。' }, { before: '医師は負傷した衛兵を直した。', after: '医師は負傷した衛兵を治した。' }],
    required: ['剣聖', '治した'], preserved: ['彼は敵を牽制した。'] },
  { language: 'th', premise: 'A woman is pregnant, a driver takes her to a hospital. The car is cramped. Use standard narrative Thai, not dialect.',
    draft: 'เธอตั้งครันและต้องไปโรงพยาบาล\nคนขับอนุญาติให้เธอขึ้นรถ\nในรถคับแคบแต่มีอุปกรณ์ครบครัน',
    edits: [{ before: 'เธอตั้งครันและต้องไปโรงพยาบาล', after: 'เธอตั้งครรภ์และต้องไปโรงพยาบาล' }, { before: 'คนขับอนุญาติให้เธอขึ้นรถ', after: 'คนขับอนุญาตให้เธอขึ้นรถ' }],
    required: ['ตั้งครรภ์', 'อนุญาต'], preserved: ['ในรถคับแคบแต่มีอุปกรณ์ครบครัน'] }
]
export const reviewReport = language => ({ language, complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] })
// Offline transport/patch fixtures only, never sent by the live runner.
export const otherLanguageCases = [
  { language: 'vi', premise: 'A student shares a book with a friend.', draft: 'Cô chia sẽ cuốn sách cho bạn.\nHai người cùng đọc sách trong thư viện.', edits: [{ before: 'chia sẽ', after: 'chia sẻ' }] },
  { language: 'en', premise: 'Two siblings own the house. The weather is fair.', draft: 'They returned to there house.\nThe weather was fair when they arrived.', edits: [{ before: 'to there house', after: 'to their house' }] },
  { language: 'ko', premise: 'Preparation is complete. A student waits quietly in the library.', draft: '준비가 됬다.\n학생은 조용한 도서관에서 친구를 기다리며 책을 읽고 있었다.', edits: [{ before: '준비가 됬다.', after: '준비가 됐다.' }] },
  { language: 'zh', premise: 'A girl walks slowly to a library, then sits down and reads.', draft: '她慢慢地走进图书官。\n她找到一个安静的座位坐下，打开书本，开始认真阅读。', edits: [{ before: '走进图书官', after: '走进图书馆' }] },
  { language: 'custom', customLanguage: 'Deutsch', premise: 'A man knows that the book is on the table.', draft: 'Er weiss, das das Buch auf dem Tisch liegt.\nEr setzt sich ruhig hin und liest.', edits: [{ before: 'Er weiss, das das Buch', after: 'Er weiß, dass das Buch' }] }
]
export function correctionPacket(test, overrides = {}) {
  let corrected = test.draft
  for (const edit of test.edits) corrected = corrected.replace(edit.before, edit.after)
  return { edits: test.edits, languageReview: reviewReport(test.customLanguage || test.language),
    review: { passed: true, issues: [], estimatedMinutes: .05, beatsComplete: true, missingBeats: [] },
    memory: { chapter: { summary: corrected, events: [], state: [], openThreads: [] }, updates: [{
      id: 'scene_fact', kind: 'fact', subject: 'scene', text: corrected.split('\n')[0], related: [], status: 'current', importance: 'normal', evidenceSentenceId: 'S1'
    }] }, ...overrides }
}
