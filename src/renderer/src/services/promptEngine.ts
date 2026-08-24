import type { StoryStyle, Language, ChapterOutline } from '@/types'

const STYLE_PROMPTS: Record<StoryStyle, string> = {
  humorous: `Viết với giọng văn hài hước, dí dỏm, tình huống hài bất ngờ.
Sử dụng wordplay, nhịp kể nhanh, twist hài ở cuối mỗi scene.
Nhân vật có tính cách quirky, đối thoại sắc sảo, tình huống absurd nhưng relatable.`,

  dramatic: `Viết với cảm xúc mãnh liệt, cao trào rõ ràng.
Xung đột nội tâm sâu sắc, nhân vật đối mặt với quyết định khó khăn.
Build-up chậm rãi, cao trào bùng nổ, kết thúc để lại dư vị.`,

  horror: `Viết rùng rợn, tạo không khí u ám từ đầu.
Build suspense chậm, chi tiết gợi sợ hãi qua giác quan.
Sử dụng foreshadowing, unreliable narrator, twist kinh hoàng.
Không nhảy thẳng vào scare — hãy để nỗi sợ ngấm dần.`,

  romantic: `Viết lãng mạn với cảm xúc sâu lắng, chân thật.
Phát triển quan hệ tự nhiên qua chi tiết nhỏ, khoảnh khắc thân mật.
Xung đột cảm xúc nội tâm, không melodrama rẻ tiền.
Kết thúc có thể hạnh phúc hoặc bitter-sweet, nhưng phải meaningful.`,

  educational: `Viết dễ hiểu, có bài học rõ ràng lồng ghép tự nhiên.
Sử dụng storytelling để truyền tải kiến thức, không giáo điều.
Nhân vật trải qua quá trình học hỏi, khám phá.
Phù hợp mọi lứa tuổi, ngôn ngữ trong sáng.`,

  thriller: `Viết nhịp nhanh, gay cấn, mỗi scene kết thúc bằng cliffhanger.
Plot twist liên tục, thông tin bị giấu và hé lộ dần.
Nhân vật bị đẩy vào tình huống nguy hiểm, deadline gấp.
Tension tăng dần đều, không cho người đọc nghỉ.`,

  epic: `Viết với quy mô lớn, thế giới phong phú, chi tiết.
Nhiều nhân vật với arc riêng, các tuyến truyện đan xen.
World-building sâu, hệ thống quyền lực, xung đột phe phái.
Nhịp kể chậm rãi nhưng hoành tráng, climax lớn.`,

  slice_of_life: `Viết về đời thường, chi tiết nhỏ nhưng đẹp.
Không cần xung đột lớn, tập trung vào khoảnh khắc bình dị.
Cảm xúc bình dị, nhân vật gần gũi, đối thoại tự nhiên.
Giống như quan sát cuộc sống qua một khung cửa sổ.`,

  custom: ''
}

const LANGUAGE_VOICES: Record<Language, string> = {
  vi: `Viết bằng tiếng Việt tự nhiên, giàu hình ảnh, mượt mà.
Sử dụng thành ngữ, tục ngữ, so sánh ví von phù hợp ngữ cảnh.
Câu văn theo phong cách văn học Việt Nam hiện đại.
Tránh lối diễn đạt dịch máy, tránh calque từ tiếng Anh.
Đối thoại nhân vật phải tự nhiên như người Việt nói chuyện thật.`,

  en: `Write in natural, flowing English prose with vivid imagery.
Use idiomatic expressions, varied sentence structure, and strong verbs.
Follow contemporary literary English conventions.
Dialogue should feel authentic and character-appropriate.`,

  th: `เขียนด้วยภาษาไทยที่เป็นธรรมชาติ ลื่นไหล และมีภาพพจน์ชัดเจน
ใช้สำนวน จังหวะประโยค และระดับภาษาที่เหมาะกับวัฒนธรรมไทย
ชื่อตัวละคร ชื่อเล่น สถานที่ ป้าย จดหมาย และบทสนทนาต้องเป็นภาษาไทยและเหมาะกับบริบทไทย เว้นแต่แนวคิดเรื่องกำหนดเป็นอย่างอื่นอย่างชัดเจน
ห้ามใช้ภาษาเวียดนาม ชื่อภาษาเวียดนาม หรืออักษรละตินปะปนในเนื้อหาโดยเด็ดขาด`,

  ja: `自然な日本語で書いてください。
適切な敬語レベル、文学的表現、日本の文化的ニュアンスを含めてください。
会話は登場人物の性格に合った話し方で。
読みやすい文体で、漢字とひらがなのバランスを保ってください。`,

  ko: `자연스러운 한국어 문체로 작성하세요.
적절한 존댓말과 반말을 캐릭터에 맞게 사용하세요.
한국 문화적 뉘앙스와 관용 표현을 포함하세요.
문학적이면서도 읽기 편한 문체로 작성하세요.`,

  zh: `使用自然流畅的中文写作，文笔优美。
运用恰当的成语、比喻和中国文学传统的叙事手法。
对话要符合人物性格，语言生动形象。
现代文学风格，避免翻译腔。`,

  custom: ''
}

// Giải phong cách / ngôn ngữ ra text hướng dẫn cho AI.
// Với preset thì lấy từ bảng, với 'custom' thì lấy mô tả người dùng nhập.
export function resolveStylePrompt(style: StoryStyle, customStyle?: string): string {
  return style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style] || ''
}

export function resolveLanguageVoice(language: Language, customLanguage?: string): string {
  return language === 'custom' ? customLanguage || '' : LANGUAGE_VOICES[language] || ''
}

export function resolveTargetLanguageName(
  language: Language,
  customLanguage?: string
): string {
  const names: Record<Exclude<Language, 'custom'>, string> = {
    vi: 'Vietnamese (Tiếng Việt)',
    en: 'English',
    th: 'Thai (ภาษาไทย)',
    ja: 'Japanese (日本語)',
    ko: 'Korean (한국어)',
    zh: 'Chinese (中文)'
  }
  return language === 'custom' ? customLanguage?.trim() || 'the user-defined language' : names[language]
}

export function targetLanguageRules(language: Language, customLanguage?: string): string {
  const target = resolveTargetLanguageName(language, customLanguage)
  const thaiRules = language === 'th' ||
    (language === 'custom' && /(?:thai|tiếng\s*thái|ภาษาไทย)/iu.test(customLanguage || ''))
    ? `
- THAI SCRIPT IS MANDATORY for every output value and every narrative sentence
- Never use Vietnamese diacritics, Vietnamese words, or Vietnamese character names such as Minh, Lan, Huy, Linh, Thao or Nguyen
- Create Thai names and nicknames written in Thai script; do not leave Vietnamese names in Latin script`
    : ''

  return `STRICT OUTPUT LANGUAGE CONTRACT:
- Target language: ${target}
- Output exclusively in the target language. Never mix Vietnamese, English, or another language into output content
- Vietnamese or English text found in instructions, examples, source ideas, Q&A, outlines, summaries, or prior context is reference material only and must never leak into the output
- Silently understand and translate source material before writing; do not copy source-language phrases
- All character names, nicknames, honorifics, place names, signs, letters, dialogue, and inner thoughts must use the target language and fit its culture
- Never copy planning labels or instruction vocabulary such as MỞ ĐẦU, THÂN, KẾT, HOOK, RISING ACTION, FORESHADOWING, or CLIMAX into output values; describe the actual story events directly in the target language
- Foreign names are allowed only when the story idea explicitly requires a foreign character or setting${thaiRules}`
}

function respondInTargetLanguage(language: Language, customLanguage?: string): string {
  if (language === 'th') return 'ตอบเป็นภาษาไทยเท่านั้น ห้ามใช้ภาษาเวียดนามปะปน'
  return `Respond only in ${resolveTargetLanguageName(language, customLanguage)}.`
}

// Khối "văn phong bản địa" — buộc AI viết như tác giả bản xứ của ngôn ngữ đầu ra,
// không phải dịch từ ngôn ngữ khác sang. Áp dụng cho MỌI ngôn ngữ, kể cả custom
// (VD: chọn tiếng Thái thì dùng thành ngữ, nhịp văn và hình ảnh của văn học Thái).
export const NATIVE_VOICE_RULES = `NATIVE VOICE — you are a NATIVE author of the target language, not a translator:
- Use idioms, proverbs, folk sayings and imagery that belong to the target language and its culture
- Follow the rhythm, sentence flow and storytelling conventions of that language's own literary tradition
- Character names, places, food, customs and gestures should feel local to that culture, unless the story idea explicitly requires otherwise
- Dialogue must sound like real native speakers of the target language, with natural registers of politeness
- NEVER produce translationese: no calqued phrases, no sentence structures borrowed from another language`

// Khối "cam kết thể loại" — thể loại chọn/tự điền là hợp đồng bắt buộc, không phải gợi ý.
// AI phải phân tích thể loại thành các "lời hứa" cụ thể với người nghe rồi thực hiện đủ;
// các dòng khai báo trong ý tưởng (Thể loại:, Tông:, Độ TF:...) cũng là yêu cầu cứng.
export const GENRE_COMMITMENT_RULES = `GENRE & STYLE COMMITMENT — the chosen style is a binding contract, not a loose suggestion:
- FIRST, analyze the writing style described above: what promise does this genre make to its audience, which signature conventions, scene types, pacing patterns and emotional beats define it — then deliver those concretely, not generically
- The story must be UNMISTAKABLY recognizable as this genre from its first minutes; a fan of this genre must feel they are getting exactly what they came for, at full intensity
- If the story idea itself declares genres, sub-genres, tropes, tone, intensity ratings or content requirements (e.g. lines like "Thể loại:", "Tông:", "Độ TF:", a list of required elements), EVERY one of them is a mandatory requirement layered on top of the selected style — do not soften, dilute, skip or substitute any of them
- When the style is a custom description written by the author, treat every element of that description as required, and apply the craft conventions it implies
- Never drift into flat, generic narration: scene construction, imagery, sentence rhythm and dialogue must all carry the genre's fingerprint in every chapter`

// Khối "trung thành với bối cảnh" — neo thời đại/thế giới của truyện theo đúng ý tưởng.
// Chống lỗi: ý tưởng đương đại có MỘT yếu tố đặc biệt (thí nghiệm bí mật, vật phép...)
// bị AI phóng đại thành cả thế giới tương lai/viễn tưởng với đồ vật không tồn tại.
export const SETTING_FIDELITY_RULES = `SETTING & ERA FIDELITY — ground the story in the era the idea implies:
- Determine the story's time period and world from the idea itself. If the idea describes the present day, or does not specify an era, the setting is the CONTEMPORARY REAL WORLD — today's phones, cars, streets, homes, jobs and daily life as they exist right now
- Do NOT push a contemporary story into the future: no futuristic cities, holograms, androids, flying vehicles, neural implants, invented gadgets or technology that does not exist today, unless the idea or the author's notes explicitly contain them
- If the idea includes ONE extraordinary element (a secret experiment, a magical object, a supernatural event), keep that element at EXACTLY the scale the idea gives it — do not enlarge it into full science-fiction or fantasy world-building. Everything AROUND that element stays ordinary, recognizable and true to the era
- Fantasy, sci-fi or another-world settings are used ONLY when the idea clearly calls for them; historical settings must stay period-accurate with no anachronisms`

export function openingStrategyRules(enableHook: boolean): string {
  if (enableHook) {
    return `OPENING STRATEGY — CREATE AN AUDIENCE HOOK:
- Open with a gripping situation, striking image, meaningful danger, consequential decision, or concrete unanswered question
- Make the stakes clear in the first two minutes and create a curiosity loop answered later
- Establish character and setting around the hook without delaying it with an information dump`
  }

  return `OPENING STRATEGY — NATURAL OPENING WITHOUT A FORCED HOOK:
- Begin by naturally establishing the main character, setting, daily context, and cause of the conflict
- Do not use a cold open, teaser, curiosity loop, withheld mystery question, immediate shock, or artificial danger solely to retain the audience
- Let tension and stakes emerge gradually from the story instead of forcing them into the first two minutes`
}

// Ghi chú của tác giả — chèn vào mọi prompt khi người dùng có nhập
export function authorNotesBlock(storyNotes?: string): string {
  const notes = storyNotes?.trim()
  if (!notes) return ''
  return `\n\nAUTHOR'S NOTES — mandatory requirements from the author, follow them in everything you produce:\n${notes}\n`
}

function getDurationSpec(minutes: number): {
  wordCount: string
  structure: string
  chapters: number
} {
  const minWords = Math.max(100, Math.round(minutes * 180))
  const maxWords = Math.max(minWords, Math.round(minutes * 220))
  const wordCount = `${minWords}-${maxWords}`
  if (minutes <= 10) {
    return {
      wordCount,
      structure: 'Single act: introduction → rising action → climax → resolution',
      chapters: 1
    }
  }
  if (minutes <= 20) {
    return {
      wordCount,
      structure: '2 acts with a light subplot. Clear turning point between acts.',
      chapters: 2
    }
  }
  if (minutes <= 30) {
    return {
      wordCount,
      structure: '3 acts (setup, confrontation, resolution). 2-3 main characters, one subplot.',
      chapters: 3
    }
  }
  if (minutes <= 45) {
    return {
      wordCount,
      structure:
        '3 detailed acts with world-building. Multiple characters with distinct arcs. 2+ subplots.',
      chapters: 5
    }
  }
  if (minutes <= 60) {
    return {
      wordCount,
      structure:
        'Multi-chapter story with deep character development. Multiple interweaving plot lines. Rich world-building.',
      chapters: 7
    }
  }
  return {
    wordCount,
    structure:
      'Epic multi-chapter narrative. Complex character arcs, multiple factions/perspectives. Detailed world and lore.',
    chapters: Math.min(30, Math.ceil(minutes / 8))
  }
}

export function buildQuestionsPrompt(
  idea: string,
  style: StoryStyle,
  language: Language,
  duration: number,
  customStyle?: string,
  customLanguage?: string,
  storyNotes?: string
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]
  const spec = getDurationSpec(duration)

  const system = `You are a professional story consultant and script writer.
Your task: Based on the user's idea, ask 3-5 strategic questions to flesh out the story.

Story parameters:
- Style: ${stylePrompt}
- Target duration: ${duration} minutes (~${spec.wordCount} words)
- Structure: ${spec.structure}

${respondInTargetLanguage(language, customLanguage)}

${targetLanguageRules(language, customLanguage)}

${GENRE_COMMITMENT_RULES}

${SETTING_FIDELITY_RULES}

Rules:
- Ask questions that will significantly improve the story's depth and uniqueness
- At least one question must dig into how to fulfill the genre's core promise and the required elements the idea declares (tropes, tone, intensity)
- Each question should target a different story element (character, setting, conflict, theme, ending)
- Questions should be specific to this idea, not generic
- Questions and any suggested directions must stay inside the era and world the idea implies — do not steer a contemporary story toward futuristic or invented technology
- Format your response as a JSON array of strings, each being one question
- Return ONLY the JSON array, no other text
${authorNotesBlock(storyNotes)}`

  const user = `Story idea: ${idea}`

  return { system, user }
}

export function buildAutoAnswerPrompt(
  idea: string,
  questions: string[],
  style: StoryStyle,
  language: Language,
  customStyle?: string,
  customLanguage?: string,
  storyNotes?: string
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]

  const system = `You are a creative story consultant. Answer the following questions about a story idea creatively and thoughtfully.
Style direction: ${stylePrompt}
${respondInTargetLanguage(language, customLanguage)}

${targetLanguageRules(language, customLanguage)}

${GENRE_COMMITMENT_RULES}

${SETTING_FIDELITY_RULES}

Rules:
- Be creative and unexpected with your answers — avoid clichés
- Answers must serve the genre's core promise and honor every requirement the idea declares (genres, tropes, tone, intensity ratings) at full strength
- Creativity must stay INSIDE the era and world the idea implies: for a contemporary story, invent human drama, secrets and consequences — never futuristic technology or world-changing sci-fi escalation the idea did not ask for
- Each answer should add depth and uniqueness to the story
- Keep answers concise but rich (2-3 sentences each)
${authorNotesBlock(storyNotes)}- Return a JSON array of answer strings matching the order of questions
- Return ONLY the JSON array, no other text`

  const user = `Story idea: ${idea}

Questions to answer:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`

  return { system, user }
}

export function buildOutlinePrompt(
  idea: string,
  style: StoryStyle,
  language: Language,
  duration: number,
  answers: { question: string; answer: string }[],
  existingOutlines: string[],
  customStyle?: string,
  customLanguage?: string,
  storyNotes?: string,
  enableHook = true
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]
  const spec = getDurationSpec(duration)

  const antiDuplicate =
    existingOutlines.length > 0
      ? `\n\nCRITICAL — ANTI-DUPLICATION RULE:
This story's plot MUST be COMPLETELY DIFFERENT from these existing stories:
${existingOutlines.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Do NOT reuse: main characters, settings, core conflicts, or endings from the above stories.
The new story must have less than 5% plot similarity.`
      : ''

  const system = `You are a master story architect. Create a detailed chapter outline for a story.

Story parameters:
- Style: ${stylePrompt}
- Target: ${duration} minutes (~${spec.wordCount} words)
- Structure: ${spec.structure}
- Chapters: ${spec.chapters}

${respondInTargetLanguage(language, customLanguage)}

${targetLanguageRules(language, customLanguage)}
${antiDuplicate}

${GENRE_COMMITMENT_RULES}

${SETTING_FIDELITY_RULES}

${openingStrategyRules(enableHook)}

${NATIVE_VOICE_RULES}
${authorNotesBlock(storyNotes)}
Rules:
- Create exactly ${spec.chapters} chapters/sections
- Each chapter must have: number, title, detailed summary (3-5 sentences), estimated word count
- Each chapter summary must embody the genre through concrete story events, escalation and emotional beats. Do not write meta-analysis or name storytelling techniques inside a title or summary
- COMPLETE ARC (mandatory): the story must have all three parts —
  The FIRST chapter opens the story properly — introduce the main characters, the setting, and the CAUSE of the central conflict BEFORE it escalates. Never start in the middle of the crisis with no explanation
  ${enableHook
    ? 'The first chapter summary describes the opening hook naturally without writing a planning label for it'
    : 'The first chapter summary describes a natural, contextual opening and must not add a teaser, curiosity loop, or forced hook'}
  The middle chapters develop the conflict with rising stakes
  The FINAL chapter fully resolves the central conflict and the character arcs. The story must NOT end on a cliffhanger or leave the main thread unresolved
- If there is only ONE chapter, that chapter's summary must itself contain setup, development and resolution
- Character and place names must belong to the culture of the target language, unless the idea requires otherwise
- Include character development beats
- JSON string values contain only story content in the target language. Never prefix them with uppercase planning labels, English craft terms, or Vietnamese section names
- Return as a JSON object with two fields:
  - "title": the story title (string)
  - "chapters": array of objects with fields: chapter (number), title (string), summary (string), estimatedWords (number)
  - "outlineSummary": a 2-3 sentence summary of the entire plot (for duplicate checking)
- Return ONLY the JSON, no other text`

  const contextBlock = answers
    .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
    .join('\n\n')

  const user = `Story idea: ${idea}

Story context from Q&A:
${contextBlock}`

  return { system, user }
}

// Prompt cho MỘT KHỐI (segment) trong một chương — dùng bởi bộ viết theo khối.
export function buildChapterChunkPrompt(
  outline: { title: string; chapters: ChapterOutline[]; outlineSummary: string },
  chapterIndex: number,
  style: StoryStyle,
  language: Language,
  opts: {
    chunkIndex: number
    totalChunks: number
    targetChars: number
    /** Khối này có phải khối cuối của chương — do bộ viết quyết định theo hạn mức còn lại */
    isLastChunk?: boolean
    /** Số ký tự còn lại của cửa sổ hook 2 phút đầu — >0 nghĩa là khối này phải viết theo luật hook */
    hookWindowChars?: number
    previousContext: string | null
    userDirection?: string
    storyNotes?: string
    customStyle?: string
    customLanguage?: string
    enableHook?: boolean
  }
): { system: string; user: string } {
  const stylePrompt = resolveStylePrompt(style, opts.customStyle)
  const langVoice = resolveLanguageVoice(language, opts.customLanguage)
  const chapter = outline.chapters[chapterIndex]
  const isFirstChunk = opts.chunkIndex === 0
  const isLastChunk = opts.isLastChunk ?? opts.chunkIndex === opts.totalChunks - 1
  const isFirstChapter = chapterIndex === 0
  const isLastChapter = chapterIndex === outline.chapters.length - 1
  const enableHook = opts.enableHook !== false

  // Mạch truyện xuyên chương: các chương đã kể + chương sắp tới,
  // để mỗi khối biết mình đứng đâu trong tổng thể và không mâu thuẫn logic
  const toldSoFar = outline.chapters
    .slice(0, chapterIndex)
    .map((c) => `- Chapter ${c.chapter} "${c.title}": ${c.summary}`)
    .join('\n')
  const nextChapter = outline.chapters[chapterIndex + 1]
  const continuityBlock = `${toldSoFar ? `\nSTORY SO FAR (already written — stay consistent with these events, do NOT retell them):\n${toldSoFar}\n` : ''}${
    nextChapter ? `\nCOMING NEXT (do not tell it yet, but you may plant subtle setup): Chapter ${nextChapter.chapter} "${nextChapter.title}": ${nextChapter.summary}\n` : ''
  }`

  // Cửa sổ hook 2 phút đầu: khối nào còn nằm trong cửa sổ này phải viết để GIỮ CHÂN
  // người nghe — mở bằng khoảnh khắc gây tò mò, nêu rủi ro, treo câu hỏi chưa trả lời
  const hookBlock =
    enableHook && (opts.hookWindowChars ?? 0) > 0
      ? `
AUDIENCE HOOK — this segment falls inside the story's FIRST TWO MINUTES of narration (~${opts.hookWindowChars} characters of that window remain). The first two minutes decide whether the listener stays or leaves — write them to HOLD attention:
- The very first sentences must seize attention: open on a moment of tension, a striking image, a burning question, an unusual claim, or a decision with consequences — NEVER on weather, waking up, scenery, or calm daily routine
- Within the first few sentences, make the STAKES felt: what the main character stands to lose, or the danger or mystery that drives the story
- Open a curiosity loop: raise a concrete question the listener must keep listening to answer, and do NOT resolve it inside these first two minutes
- Deliver at least one small turn, reveal, or escalation inside this window so the listener is rewarded for staying
- Still establish WHO, WHERE, and WHY, but weave that grounding AROUND the hook in small doses — never a slow info dump before the hook lands
`
      : ''

  const system = `You are a master storyteller writing a SEGMENT of chapter ${chapter.chapter} of "${outline.title}".

Writing style:
${stylePrompt}

Language and voice:
${langVoice}

${targetLanguageRules(language, opts.customLanguage)}

${GENRE_COMMITMENT_RULES}

${SETTING_FIDELITY_RULES}

${openingStrategyRules(enableHook)}

${NATIVE_VOICE_RULES}

Chapter ${chapter.chapter}/${outline.chapters.length}: "${chapter.title}"
Chapter plot: ${chapter.summary}
Overall story arc: ${outline.outlineSummary}
${continuityBlock}${authorNotesBlock(opts.storyNotes)}${opts.userDirection?.trim() ? `\nAuthor's additional direction (must be respected):\n${opts.userDirection.trim()}\n` : ''}${hookBlock}
OUTLINE FIDELITY:
- Treat the chapter plot and overall story arc above as fixed facts, not loose inspiration
- Preserve the stated occupations, locations, objects, relationships, era, and cause of conflict exactly
- Do not substitute a different workplace, setting, profession, key object, or premise to fit the selected style

SEGMENT RULES:
- This is segment ${opts.chunkIndex + 1}/${opts.totalChunks} of the chapter
- ${isLastChunk && isLastChapter
    ? `LENGTH BUDGET: aim for about ${opts.targetChars} characters — but closing the story PROPERLY matters more than the exact length; exceed it if the ending needs the room`
    : `LENGTH BUDGET: write about ${opts.targetChars} characters. This is a hard ceiling — do NOT exceed ${Math.round(opts.targetChars * 1.15)} characters. Count characters, not words`}
- ${isFirstChunk
    ? (isFirstChapter
        ? (enableHook
            ? 'OPEN THE STORY — execute the audience hook, then quickly establish WHO the main characters are, WHERE the story takes place, and WHY the central conflict begins'
            : 'OPEN THE STORY NATURALLY — establish WHO the main characters are, WHERE they are, and WHY the central conflict begins. Do not add a teaser, curiosity loop, cold open, immediate shock, or forced hook')
        : 'START the chapter — open straight into the scene')
    : 'CONTINUE seamlessly from where the previous segment ended'}
- ${isLastChunk
    ? (isLastChapter
        ? 'CONCLUDE this chapter AND the whole story — resolve the central conflict and the character arcs COMPLETELY, deliver the emotional payoff, and end on a note that feels finished. NEVER end the story on a cliffhanger or an unresolved thread. Do not rush the ending — give it room to breathe'
        : 'CONCLUDE this chapter — wrap up the chapter arc properly, then end with a transition or hook toward the next chapter')
    : 'Do NOT conclude yet — leave the narrative flowing, mid-scene is fine'}
- Write ONLY story prose in the target language — no meta-commentary, no author notes
- Do NOT repeat content from previous segments
- Maintain consistent tone, voice and pacing with the style described above

OUTPUT FORMAT — this text will be recorded as VOICE by a narrator, so it must be TTS-safe:
- Output PLAIN PROSE ONLY. No title, no story name, no chapter heading, no chapter number, no section label
- Never write lines like "Chương 1", "Chương Một", "Chapter 2", "Phần 3", or an ALL-CAPS title line
- No markdown whatsoever: no #, **, *, _, \`, >, ---, no bullet lists, no code blocks
- PUNCTUATION WHITELIST: use ONLY these marks: . , ! ? … — nothing else
- FORBIDDEN characters (they break voice recording): ( ) [ ] " " ' ' : ; / \\ + - — – * # & % = ~ _ | < >
- Write dialogue WITHOUT quotation marks and WITHOUT leading dashes — weave it into the narration with attribution words. Example: Bà lão cất giọng khàn đặc, cậu Kha, thư của nhà tôi đâu.
- No parenthetical asides or stage directions like (cười), (im lặng một lúc) — describe them as narration instead
- Write numbers, times and dates in words, the way a narrator would speak them (mười giờ ba mươi, ngày mười hai tháng tám)
- Start directly with the narrative sentence — nothing above it

PACING FOR SPOKEN DELIVERY — the listener needs room to breathe:
- Keep sentences short: aim for 12-20 words, never exceed about 30 words
- Split long compound sentences into separate sentences instead of chaining clauses
- Place commas at the natural breathing points inside a sentence
- Use an ellipsis (…) for a held pause: hesitation, dread, or just before a reveal
- Break into a new paragraph every 2-4 sentences — each break is a pause for the narrator
- Vary sentence length deliberately; a very short sentence after a long one lands hard
- Do NOT stack clause after clause without punctuation — a breathless wall of text is the failure mode to avoid`

  let user = `Write segment ${opts.chunkIndex + 1}/${opts.totalChunks} of chapter ${chapter.chapter} (~${opts.targetChars} characters).`
  if (opts.previousContext) {
    user += `\n\nPrevious context (how the story reads just before this segment):\n${opts.previousContext.slice(-500)}`
  }
  if (isFirstChunk && isFirstChapter) {
    user += enableHook
      ? '\n\nThis is the very first segment of the story. Execute the opening hook immediately.'
      : '\n\nThis is the very first segment of the story. Begin naturally with context and character, without an audience hook.'
  }

  return { system, user }
}

export function buildViSummaryPrompt(
  outline: { title: string; chapters: ChapterOutline[]; outlineSummary: string },
  style: StoryStyle,
  customStyle?: string
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]

  const system = `Bạn là chuyên gia phân tích kịch bản truyện. 
Nhiệm vụ: Viết tóm tắt nội dung cốt truyện CHI TIẾT bằng TIẾNG VIỆT.

LUÔN trả lời bằng tiếng Việt, bất kể ngôn ngữ gốc của outline.

Phong cách truyện: ${stylePrompt}

Yêu cầu:
- Viết tóm tắt tổng quan 3-5 câu về toàn bộ câu chuyện
- Liệt kê các nhân vật chính và vai trò
- Tóm tắt từng chương: nêu rõ diễn biến, xung đột, bước ngoặt
- Chỉ ra cao trào và kết thúc
- Nêu thông điệp / chủ đề chính của truyện
- Viết dưới dạng văn xuôi dễ đọc, KHÔNG dùng JSON
- Sử dụng heading markdown (## cho phần, ### cho chương)`

  const chaptersText = outline.chapters
    .map((c) => `Chapter ${c.chapter}: "${c.title}" — ${c.summary} (~${c.estimatedWords} words)`)
    .join('\n')

  const user = `Outline cần tóm tắt:

Tên truyện: "${outline.title}"
Tổng quan: ${outline.outlineSummary}

Chi tiết các chương:
${chaptersText}`

  return { system, user }
}

// ===== Rewrite Mode =====

export function buildScriptAnalysisPrompt(
  originalScript: string,
  style: StoryStyle,
  language: Language,
  customStyle?: string,
  customLanguage?: string
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]
  const langPrompt = language === 'custom' ? customLanguage || '' : LANGUAGE_VOICES[language]

  const system = `Bạn là chuyên gia phân tích kịch bản và biên kịch.
Nhiệm vụ: Phân tích kịch bản gốc được cung cấp và đề xuất các hướng viết lại.

LUÔN trả lời bằng TIẾNG VIỆT, bất kể ngôn ngữ gốc của kịch bản.

Trả về JSON (không wrap markdown) theo format:
{
  "analysis": "Phân tích chi tiết 5-8 câu: chủ đề chính, nhân vật, cấu trúc, điểm mạnh/yếu, thông điệp",
  "directions": [
    "Hướng 1: Mô tả cụ thể cách viết lại (3-4 câu) — thay đổi gì, giữ gì, twist mới",
    "Hướng 2: ...",
    "Hướng 3: ...",
    "Hướng 4: ..."
  ]
}

Yêu cầu cho các hướng đề xuất:
- Mỗi hướng phải KHÁC BIỆT rõ rệt (đổi thể loại, góc nhìn, bối cảnh, kết thúc, etc.)
- Phong cách mục tiêu: ${stylePrompt || 'tự do'}
- Ngôn ngữ đầu ra: ${langPrompt || 'tự do'}
- Hướng 1: Giữ cốt lõi, thay đổi phong cách kể
- Hướng 2: Đổi góc nhìn/nhân vật chính
- Hướng 3: Đổi bối cảnh/thời đại nhưng giữ xung đột
- Hướng 4: Sáng tạo hoàn toàn — chỉ lấy cảm hứng từ chủ đề`

  const user = `Phân tích kịch bản gốc sau và đề xuất 4 hướng viết lại:

--- KỊch BẢN GỐC ---
${originalScript.slice(0, 12000)}
--- HẾT ---`

  return { system, user }
}

export function buildRewriteOutlinePrompt(
  originalScript: string,
  scriptAnalysis: string,
  chosenDirection: string,
  style: StoryStyle,
  language: Language,
  duration: number,
  qaList: { question: string; answer: string }[],
  existingOutlines: string[],
  customStyle?: string,
  customLanguage?: string,
  storyNotes?: string,
  enableHook = true
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]
  const langPrompt = language === 'custom' ? customLanguage || '' : LANGUAGE_VOICES[language]
  const wordsTarget = duration * 200
  const chaptersTarget = Math.min(30, Math.max(1, Math.ceil(duration / 8)))

  let antiDupSection = ''
  if (existingOutlines.length > 0) {
    antiDupSection = `\n\nCÁC CỐT TRUYỆN ĐÃ CÓ (tránh trùng lặp >5%):\n${existingOutlines.map((o, i) => `[${i + 1}] ${o}`).join('\n')}`
  }

  const system = `You are a professional screenwriter creating a new outline from an original script, its analysis, and the selected rewrite direction.

Writing style: ${stylePrompt}
Target language voice: ${langPrompt}

${targetLanguageRules(language, customLanguage)}

${openingStrategyRules(enableHook)}

Return JSON without markdown:
{
  "title": "",
  "chapters": [
    { "chapter": 1, "title": "", "summary": "", "estimatedWords": 1000 }
  ],
  "outlineSummary": ""
}

Rules:
- Target about ${wordsTarget} words across about ${chaptersTarget} chapters
- The new plot must differ from the original by at least sixty percent. Rewrite it; do not copy it
- Preserve only the intended spirit or inspiration while creating a genuinely new story
- Give the characters culturally appropriate target-language names and use a distinct setting when suitable
- Each chapter has a clear dramatic purpose and its own conflict
- The first chapter establishes characters, setting, and the cause of the conflict before escalation. Middle chapters develop it. The final chapter completely resolves the main conflict and character arcs without a cliffhanger
- ${enableHook
    ? 'The first chapter summary describes a compelling opening hook from the first two minutes, but never prefixes it with a planning label'
    : 'The first chapter summary describes a natural contextual opening without a teaser, curiosity loop, immediate shock, or forced hook'}
- Preserve the era and world implied by the source and selected direction. Do not invent future technology or expand one unusual element into an unrelated science-fiction world
- Fulfill every genre, tone, trope, and intensity requirement from the source and selected direction through concrete events, not meta-analysis inside summaries
- JSON string values contain only target-language story content; no Vietnamese or English planning labels${antiDupSection}

${GENRE_COMMITMENT_RULES}

${SETTING_FIDELITY_RULES}

${NATIVE_VOICE_RULES}${authorNotesBlock(storyNotes)}`

  let qaSection = ''
  if (qaList.length > 0) {
    qaSection = '\n\nSOURCE Q&A:\n' +
      qaList.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join('\n\n')
  }

  const user = `ORIGINAL SCRIPT EXCERPT:
${originalScript.slice(0, 3000)}

SOURCE ANALYSIS:
${scriptAnalysis}

SELECTED REWRITE DIRECTION:
${chosenDirection}${qaSection}

Create the new outline from this material. Silently translate all source material and return only the required target-language JSON.`

  return { system, user }
}

export function buildLanguageRepairPrompt(
  text: string,
  language: Language,
  customLanguage?: string,
  format: 'prose' | 'outline-json' = 'prose'
): { system: string; user: string } {
  const target = resolveTargetLanguageName(language, customLanguage)
  const formatRules = format === 'outline-json'
    ? `Return ONLY valid JSON with exactly this schema:
{
  "title": "",
  "chapters": [{ "chapter": 1, "title": "", "summary": "", "estimatedWords": 1000 }],
  "outlineSummary": ""
}
Keep JSON property names exactly as shown. Translate or localize every string value into ${target}.`
    : `Return only repaired plain story prose. Preserve meaning, plot facts, tone, paragraph flow and approximately the same length.
Do not add headings, markdown, explanations, quotation marks, lists, or meta-commentary.`

  const system = `You are a language consistency editor. Repair text that accidentally contains language contamination.

${targetLanguageRules(language, customLanguage)}

${formatRules}
- Replace leaked Vietnamese words and Vietnamese character/place names with culturally appropriate target-language equivalents
- Keep character identity and continuity consistent after renaming
- For outline JSON, preserve the exact chapter count, chapter numbers, estimated word counts, plot facts, and ordering from the input
- Do not mention that a repair was performed`

  return {
    system,
    user: `Repair the following text so every output string is exclusively in ${target}:\n\n${text}`
  }
}
