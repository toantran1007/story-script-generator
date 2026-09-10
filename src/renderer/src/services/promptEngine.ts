import type {
  StoryStyle,
  Language,
  ChapterOutline,
  Outline,
  InspirationProfile,
  OriginalityReport,
  TransformationLevel
} from '@/types'
import { chapterCountFor, charsPerMinute } from '@/services/textMetrics'

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

export const STORY_VIDEO_RULES = `STORY VIDEO VISUAL RULES:
- Write for a narrated story video, not an audio-only novel. Every paragraph should describe one clear visual beat that can be illustrated in a shot of roughly ten seconds.
- Keep one dominant location, time, action and emotional focus per paragraph. Move to a new paragraph when the shot, camera focus, location or time changes.
- Lead with visible subjects, actions, expressions, objects and environmental changes. Replace abstract explanation with concrete behavior or a visual detail whenever possible.
- Do not stack several major actions into one paragraph. Let each beat finish with a readable pose, reaction, discovery or consequence before the next beat begins.
- Introduce characters, costumes, important objects and locations clearly, then keep their appearance, position, lighting and continuity stable across nearby paragraphs.
- Keep dialogue and inner thoughts concise enough to fit beside the visuals. Avoid long monologues, invisible backstory dumps and philosophical commentary that cannot be shown.
- System panels, quest windows, skill notices, level displays, signs and any other visible on-screen text are story content: write every visible word in the target script language, never Vietnamese or English, and keep the same terminology consistent throughout the story.`

export const CHARACTER_VOICE_RULES = `CHARACTER VOICE — NARRATION WITH DIRECT SPEECH:
- Keep narration as the visual backbone: actions, positions, objects, visible reactions and consequences. Give the protagonist an audible, distinctive voice when speaking is natural, rather than paraphrasing every reaction as "he realized", "she complained" or "he felt angry".
- Use short direct speech to express a decision, objection, fear, humor or attitude at meaningful moments. Let word choice and delivery fit the protagonist's personality, knowledge and immediate pressure. Do not insert a dialogue quota into every segment, force a mute/hidden character to speak, or turn the story into a transcript.
- Keep speech, thought and system information distinct. Attribute a spoken line to its speaker through nearby natural narration. Attribute an inner thought explicitly as thought, not audible speech; other characters must not react to unspoken thoughts.
- Only include system notices if the premise actually has a system. Keep its mission conditions, values and rewards precise and consistent. Distinguish an audible system announcement from a silent panel; never invent a speaking system just to fill a dialogue slot.
- A system notice may prompt a character's brief response, silence, action or thought. Choose what fits; do not mechanically repeat narration -> notification -> complaint in every scene. Do not have narration immediately explain the same emotion already conveyed by the line.
- In prose, put narration and direct dialogue on separate lines. Use native dialogue quotation marks, such as “...” or 「...」, and end each spoken sentence with punctuation inside its quotes. Prefer one quoted sentence per line; no blank paragraph gaps. Do not print role tags, screenplay labels, SSML or stage directions.
- In outline JSON, plan where a character's own words or a thought matter through the existing scene summaries; keep the required JSON schema. Do not invent a separate dialogue section or fixed scene template.
- Dialogue must lead into or respond to a concrete action that can be illustrated. Preserve the early isekai incident and the story's pacing; do not add long monologues, unrelated jokes or explanatory lore.`

export const DIRECT_SERIALIZED_SCRIPT_RULES = `DIRECT SERIALIZED SCRIPT STYLE:
- Tell events in clear chronological order: establish the exact time/place only when useful, then show what the character does, what happens, and the immediate consequence.
- Keep each paragraph focused on one action, discovery, system update, threat or decision. Do not combine several major events into one paragraph.
- Prefer short, concrete sentences and strong action verbs. Keep most sentences under roughly twenty words unless dialogue or a system value requires more.
- Put dialogue on its own line. Keep dialogue natural, brief and directly connected to the current action.
- Use concrete nouns and measurable values for status panels, levels, skills, damage, rewards and mission conditions. Format system output as compact readable lines.
- Avoid ornate scenery, decorative adjectives, metaphors, poetic comparisons, philosophical commentary, abstract emotional essays and long explanations that do not change the next action.
- Show emotion through visible behavior, decisions, speech and consequences instead of naming an abstract feeling.
- Every paragraph must move the plot, reveal a rule, raise a threat, deliver a reward or set up the next concrete action. Remove filler transitions and repeated reactions.
- Do not add camera directions, screenplay shot labels, narrator commentary or production notes inside the story text.`

function listOrFallback(items: string[] | undefined, fallback: string): string {
  return items && items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`
}

function inferGenreAnchors(stylePrompt: string): string[] {
  const text = stylePrompt.toLocaleLowerCase()
  const anchors: string[] = []
  if (/(anime|hoạt hình nhật|manga)/u.test(text)) {
    anchors.push('Anime-style character expressiveness, visual set pieces, strong rival dynamics and emotionally legible reactions')
  }
  if (/(fantasy|giả tưởng|ma pháp|phép thuật)/u.test(text)) {
    anchors.push('A clearly fantastical world with concrete magic, creatures, artifacts or supernatural rules; do not flatten it into realistic social drama')
  }
  if (/(isekai|xuyên không|giao thương|cross.world|between worlds|hai thế giới)/u.test(text)) {
    anchors.push('Cross-world travel or trade is a narrative relationship only: preserve each named world\'s own era, technology and social reality instead of merging them into a future or generic fantasy civilization')
  }
  if (/(academy|học viện|học viên|trường học|school|student)/u.test(text)) {
    anchors.push('Student or academy life as an active setting: classes, training, exams, clubs, missions, rivalries or tournaments')
  }
  if (/(litrpg|hệ thống|thăng cấp|level|lv\.?|cấp độ|skill|kỹ năng|class|nghề nghiệp)/u.test(text)) {
    anchors.push('Visible progression loop: levels, skills, quests, measurable milestones, rewards and meaningful power growth')
  }
  if (/(action|hành động|chiến đấu|battle|adventure|phiêu lưu)/u.test(text)) {
    anchors.push('Concrete action and adventure scenes with tactical obstacles, escalating threats and physical consequences')
  }
  return anchors
}

/** Keep the selected genre dominant while allowing the source to contribute only compatible DNA. */
export function buildGenreFidelityContract(
  style: StoryStyle,
  customStyle?: string,
  inspirationProfile?: InspirationProfile | null
): string {
  const selected = resolveStylePrompt(style, customStyle).trim() || '(no additional style description)'
  const profile = inspirationProfile
  const inferredAnchors = inferGenreAnchors(selected)
  return `GENRE FIDELITY CONTRACT — THE SELECTED TAG ALWAYS WINS:
- Selected style/tag: ${selected}
- Treat the selected style as a binding genre contract, not a mood suggestion. Never replace it with another genre.
- Preserve the source's compatible genre DNA, core premise, progression loop and audience payoff, while changing concrete names, places, objects, event chains and ending as required by the originality contract.
- If the source suggests a conflicting genre, discard that conflict. The selected tag has priority for genre, tone and scene grammar; explicit world, era and technology facts remain hard continuity constraints.
- Every chapter must contain concrete actions, obstacles, choices or visible consequences that express the selected genre. Do not let political debate, social commentary, philosophy, governance or abstract symbolism become the main plot unless the selected tag or author notes explicitly require it.
- Abstract themes are seasoning, not the story engine. Keep the narrative centered on the selected genre's characters, goals, conflict, scene types, pacing and rewards.
- Do not add a new genre merely because it offers deeper world-building or moral complexity.

CONCRETE SELECTED-TAG ANCHORS:
${listOrFallback(inferredAnchors, 'Use concrete scenes, conflicts and pacing that make the selected tag unmistakable.')}

SOURCE GENRE DNA TO PRESERVE (compatible only):
${listOrFallback(profile?.genreCore, 'Infer the selected genre conventions from the tag and apply them concretely.')}

WORLD / ERA CORE TO PRESERVE:
${listOrFallback(profile?.settingEraCore, 'Preserve every explicitly stated world, era, technology level and cross-world relationship from the idea.')}

STORY CORE TO PRESERVE:
${listOrFallback(profile?.storyCore, 'Preserve the central emotional promise and premise mechanism without copying its plot.')}

PROGRESSION / REWARD LOOP:
${listOrFallback(profile?.progressionCore, 'Use clear, causal progression appropriate to the selected genre.')}

AUDIENCE PAYOFFS:
${listOrFallback(profile?.audiencePromise, 'Deliver the selected genre promise repeatedly through scenes, not explanations.')}

GENRE DRIFT TO AVOID:
${listOrFallback(profile?.avoidGenreDrift, 'Do not make an unrequested genre or abstract theme dominate the story.')}`
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
- Any visible system panel, quest window, skill name, level display, status message, sign or other on-screen text inside the story must also be written entirely in the target language
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
- Treat any explicit world, era, technology level, apocalypse condition or cross-world relationship in the idea, author notes or WORLD / ERA CORE as a hard setting constraint. These explicit facts take priority over generic style labels; the selected genre controls the story experience, not an unrequested era change
- An explicit fantasy, science-fiction, historical, academy or other-world tag may define the setting only when the idea or author notes actually request that world; never use a generic tag to override a clearly stated contemporary or historical world
- Only when neither the selected genre nor the idea specifies a world or era, default to the CONTEMPORARY REAL WORLD — today's phones, cars, streets, homes, jobs and daily life as they exist right now
- Do NOT push a contemporary story into the future: no futuristic cities, holograms, androids, flying vehicles, neural implants, invented gadgets or technology that does not exist today, unless the idea or the author's notes explicitly contain them
- If the idea includes ONE extraordinary element (a secret experiment, a magical object, a supernatural event), keep that element at EXACTLY the scale the idea gives it — do not enlarge it into full science-fiction or fantasy world-building. Everything AROUND that element stays ordinary, recognizable and true to the era
- Fantasy, sci-fi or another-world settings are used ONLY when the idea clearly calls for them; historical settings must stay period-accurate with no anachronisms`

// Explicitly named worlds and eras are hard continuity constraints, not optional flavor.
export const CROSS_WORLD_ERA_RULES = `CROSS-WORLD / ERA CONTINUITY:
- If the idea explicitly names multiple worlds or eras, preserve each one separately. Contemporary means present-day technology and society; historical means its actual past period.
- Cross-world travel or trade does not turn either side into the future, a sci-fi civilization or a fantasy civilization unless the idea explicitly requests that.
- A system, shop, portal or supernatural rule is a contained story mechanism. Do not invent futuristic infrastructure, holograms, androids, magical technology or steampunk machinery around it.
- Keep the source's stated apocalypse, zombie, disaster or scarcity condition at its stated technology level and social reality.
- For isekai, reincarnation, regression, rebirth and second-chance stories, honor the familiar premise grammar the idea actually names: keep the requested origin world, destination world, rebirth status and established fantasy/magic setting recognizable.
- Do not invent extra dimensions, civilizations, cosmic explanations, magic systems, academies, factions or future technologies merely to make the premise feel bigger. Expand conflicts inside the requested worlds and their established rules.`

export function hasIsekaiPremise(idea: string, style = ''): boolean {
  const withoutExclusions = (text: string): string => text.replace(
    /(?:không(?:\s+phải)?|no|not|without|non)[\s-]+(?:isekai|xuyên không|world[- ]crossing)/giu, '')
  const isekai = /(?:\bisekai\b|xuyên không|transported (?:into|to) another world|reincarnat\w* (?:into|in) another world)/iu
  if (/(?:không(?:\s+phải)?|no|not|without|non)[\s-]+(?:isekai|xuyên không)/iu.test(idea) && !isekai.test(withoutExclusions(idea))) return false
  return isekai.test(withoutExclusions(`${idea}\n${style}`))
}

export function isekaiFirstMinuteRules(firstMinuteChars?: number): string {
  const budget = firstMinuteChars && Number.isFinite(firstMinuteChars) && firstMinuteChars > 0
    ? ` (roughly ${Math.round(firstMinuteChars / 2)}–${Math.round(firstMinuteChars)} narrated characters at the configured reading speed, for pacing reference only)` : ''
  return `ISEKAI EARLY-INCIDENT GUIDANCE — CONDITIONAL:
- Apply ONLY when the author's premise actually involves isekai or transport/reincarnation into another world. Fantasy, academy life, same-world rebirth or regression alone does not require a world crossing; respect explicit exclusions.
- For isekai, prioritize the crossing-triggering incident within roughly the first thirty to sixty seconds${budget}. Establish an unmistakable sign of arrival or an immediate other-world consequence naturally, so the audience recognizes the genre instead of waiting through a long introduction.
- This is flexible pacing guidance, not a fixed timestamp or a character ceiling. An earlier incident is welcome when natural. Never pad until thirty seconds, force arrival at exactly one minute, divide scenes into timed fractions, or truncate/regenerate a valid segment merely because it extends beyond the estimated first-minute length.
- Any original-world setup must actively serve the imminent crossing or reveal character through doing. Remove detached biography, scenic tours and unrelated subplots; keep a short exchange or visual detail when it genuinely helps the incident feel clear and natural.
- Establish just enough of the original situation through a meaningful action or choice, then make the crossing visible. Do not spend this window on scenic tours, biography, daily-life montage or lore. If the story starts after arrival, establish the crossing incident briefly through concrete scene evidence within the same window, not a long flashback.
- Select the incident and staging from this story's actual premise; do not force a truck accident, death, portal, awakening or any fixed sequence onto every story. Apply the early-incident preference whether the hook option is on or off, without making the narrative mechanical.
- Keep the prose illustration-ready: identifiable character actions, a tangible trigger, a readable visual change in surroundings and an immediate reaction. Weave these into natural narration, not shot numbers, camera commands or a checklist.
- While composing, avoid unnecessary setup and bring the existing incident forward when the introduction drags. Preserve complete sentences, character actions, direct speech and logical transitions; never add an unrelated event solely to hit a timing target.`
}

export function openingStrategyRules(enableHook: boolean, stylePrompt = '', firstMinuteChars?: number): string {
  const animeFantasy = /(?:anime|manga|fantasy|giả tưởng|ma pháp|phép thuật|isekai|xuyên không|tái sinh|litrpg|hệ thống|thăng cấp)/iu.test(stylePrompt)
  const adaptiveOpening = `
ADAPTIVE OPENING CRAFT:
${isekaiFirstMinuteRules(firstMinuteChars)}
- Decide the strongest opening approach from this story's premise, protagonist, genre promise and emotional tone. Do not apply a fixed template, paragraph count, cold open, or mandatory type of inciting incident.
- Reveal personality through observable choices, behavior, gestures, dialogue and consequences. Prefer a character doing something that exposes a want, fear, value or flaw over narration that explains their personality or biography.
- Enter at the earliest scene that makes this particular story matter, then let context emerge naturally through action, sensory detail and purposeful dialogue.
- Use concrete, cinematic images and a clear chain of cause and effect, while varying sentence rhythm to suit the scene. Avoid generic atmosphere, encyclopedic exposition and long backstory before the audience has a reason to care.
- A hook may be quiet, visual, emotional, humorous, mysterious or dangerous; choose what fits this story instead of forcing shock or artificial suspense.
`
  const animeFantasyOpening = animeFantasy
    ? `
ANIME FANTASY ADAPTIVE OPENING:
- Favor a brisk, image-rich entry into this story's specific promise, with movement, a vivid setting detail or an expressive action that reveals the protagonist.
- For isekai, use the flexible early-incident guidance above and avoid a drawn-out introduction. For same-world reincarnation or regression, follow that premise without inventing a different world.
- Introduce the world's distinctive supernatural or visual rule through something happening on screen, not a lecture. Let the first meaningful goal, threat or decision emerge naturally from the protagonist's action.
- Keep fantasy terminology, system displays and world-building subordinate to character behavior and the scene's emotional beat.
`
    : ''
  if (enableHook) {
    return `OPENING STRATEGY — CREATE AN AUDIENCE HOOK:
- Open with a gripping situation, striking image, meaningful danger, consequential decision, or concrete unanswered question
- Make the audience care early through a meaningful action, emotion or consequence. Use a curiosity loop only when this story benefits from one; do not force a two-minute formula.
- Establish character and setting around the hook without delaying it with an information dump${adaptiveOpening}${animeFantasyOpening}`
  }

  return `OPENING STRATEGY — NATURAL OPENING WITHOUT A FORCED HOOK:
- Ground the audience through the main character doing something in a concrete setting. Supply daily context or background only when the scene needs it, not as a compulsory introduction.
- Do not use a cold open, teaser, curiosity loop, withheld mystery question, immediate shock, or artificial danger solely to retain the audience
- Let tension and stakes emerge gradually from the story instead of forcing them into the first two minutes${adaptiveOpening}${animeFantasyOpening}`
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
  storyNotes?: string,
  inspirationProfile?: InspirationProfile | null
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]
  const spec = getDurationSpec(duration)
  const genreFidelity = buildGenreFidelityContract(style, customStyle, inspirationProfile)

  const system = `You are a professional story consultant and script writer.
Your task: Based on the user's idea, ask 3-5 strategic questions to flesh out the story.
When a question concerns the protagonist's personality, connect it to how they act and speak under pressure rather than asking only for a biography.

Story parameters:
- Style: ${stylePrompt}
- Target duration: ${duration} minutes (~${spec.wordCount} words)
- Structure: ${spec.structure}

${respondInTargetLanguage(language, customLanguage)}

${targetLanguageRules(language, customLanguage)}

${GENRE_COMMITMENT_RULES}

${genreFidelity}

${SETTING_FIDELITY_RULES}
${CROSS_WORLD_ERA_RULES}

Rules:
- Ask questions that will significantly improve the story's depth and uniqueness
- At least one question must dig into how to fulfill the genre's core promise and the required elements the idea declares (tropes, tone, intensity)
- Each question should target a different story element (character, setting, conflict, theme, ending)
- Questions should be specific to this idea, not generic
- Questions and any suggested directions must stay inside the era and world the idea implies — do not steer a contemporary story toward futuristic or invented technology
- Format your response as a JSON array of strings, each being one question
- Return ONLY the JSON array, no other text
${authorNotesBlock(storyNotes)}`

  const user = inspirationProfile
    ? `INDEPENDENT CREATIVE BRIEF:
${inspirationProfile.creativeBrief}

ABSTRACT QUALITIES TO LEARN FROM:
${inspirationProfile.essence.map((item) => `- ${item}`).join('\n')}

MANDATORY USER REQUIREMENTS:
${inspirationProfile.requiredElements.map((item) => `- ${item}`).join('\n')}

Do not ask questions about the source work or its named characters. Ask only about developing the new independent story.`
    : `Story idea: ${idea}`

  return { system, user }
}

export function buildAutoAnswerPrompt(
  idea: string,
  questions: string[],
  style: StoryStyle,
  language: Language,
  customStyle?: string,
  customLanguage?: string,
  storyNotes?: string,
  inspirationProfile?: InspirationProfile | null
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]
  const genreFidelity = buildGenreFidelityContract(style, customStyle, inspirationProfile)

  const system = `You are a creative story consultant. Answer the following questions about a story idea creatively and thoughtfully.
Style direction: ${stylePrompt}
For character-related answers, suggest a fitting manner of speaking or concise response to the actual situation. Keep it consistent with the character, not a mandatory catchphrase or a speaking system absent from the premise.
${respondInTargetLanguage(language, customLanguage)}

${targetLanguageRules(language, customLanguage)}

${GENRE_COMMITMENT_RULES}

${genreFidelity}

${SETTING_FIDELITY_RULES}
${CROSS_WORLD_ERA_RULES}

Rules:
- Be creative and unexpected with your answers — avoid clichés
- Answers must serve the genre's core promise and honor every requirement the idea declares (genres, tropes, tone, intensity ratings) at full strength
- Creativity must stay INSIDE the era and world the idea implies: for a contemporary story, invent human drama, secrets and consequences — never futuristic technology or world-changing sci-fi escalation the idea did not ask for
- Each answer should add depth and uniqueness to the story
- Keep answers concise but rich (2-3 sentences each)
${authorNotesBlock(storyNotes)}- Return a JSON array of answer strings matching the order of questions
- Return ONLY the JSON array, no other text`

  const user = `${inspirationProfile
    ? `Independent creative brief: ${inspirationProfile.creativeBrief}`
    : `Story idea: ${idea}`}

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
  enableHook = true,
  inspirationProfile?: InspirationProfile | null,
  transformationLevel: TransformationLevel = 'original',
  originalityFeedback: string[] = [],
  firstMinuteChars?: number
): { system: string; user: string } {
  const stylePrompt = style === 'custom' ? customStyle || '' : STYLE_PROMPTS[style]
  const spec = getDurationSpec(duration)
  spec.chapters = chapterCountFor(duration * (firstMinuteChars || charsPerMinute(language)))
  spec.structure += ' Divide the narrative into chapters targeting 4,000–6,000 characters each, with natural scene boundaries. Short stories/final chapters may be shorter. These are prose character targets, not word counts.'
  const genreFidelity = buildGenreFidelityContract(style, customStyle, inspirationProfile)

  const antiDuplicate =
    existingOutlines.length > 0
      ? `\n\nCRITICAL — ANTI-DUPLICATION RULE:
This story's plot MUST be COMPLETELY DIFFERENT from these existing stories:
${existingOutlines.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Do NOT reuse: main characters, settings, core conflicts, or endings from the above stories.
The new story must have less than 5% plot similarity.`
      : ''

  const system = `You are a master story architect. Create a detailed chapter outline for a story.

${CHARACTER_VOICE_RULES}

Story parameters:
- Style: ${stylePrompt}
- Target: ${duration} minutes (~${spec.wordCount} words)
- Structure: ${spec.structure}
- Chapters: ${spec.chapters}

${respondInTargetLanguage(language, customLanguage)}

${targetLanguageRules(language, customLanguage)}
${antiDuplicate}

${GENRE_COMMITMENT_RULES}

${genreFidelity}

${SETTING_FIDELITY_RULES}
${CROSS_WORLD_ERA_RULES}

${openingStrategyRules(enableHook, stylePrompt, firstMinuteChars)}

${NATIVE_VOICE_RULES}
${STORY_VIDEO_RULES}
${DIRECT_SERIALIZED_SCRIPT_RULES}
${authorNotesBlock(storyNotes)}
Rules:
- Create exactly ${spec.chapters} chapters/sections
- Each chapter must have: number, title, detailed summary (3-5 sentences), estimated word count
- Each chapter summary must embody the genre through concrete story events, escalation and emotional beats. Do not write meta-analysis or name storytelling techniques inside a title or summary
- COMPLETE ARC (mandatory): the story must have all three parts —
  The FIRST chapter opens with a specific scene in which character behavior makes the setting and developing conflict understandable. Describe what someone actually does, says or chooses, not a list of personality traits or a history of the world. Orient the audience inside the scene without requiring a separate introduction before the action
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

  const originalityContract = inspirationProfile
    ? buildOriginalityContract(inspirationProfile, transformationLevel, originalityFeedback)
    : ''

  const user = `${inspirationProfile
    ? `INDEPENDENT CREATIVE BRIEF: ${inspirationProfile.creativeBrief}

ABSTRACT QUALITIES TO LEARN FROM:
${inspirationProfile.essence.map((item) => `- ${item}`).join('\n')}

OPTIONAL EXPANSION OPPORTUNITIES — use only when they intensify the selected genre; ignore any item that causes genre drift:
${inspirationProfile.expansionOpportunities.map((item) => `- ${item}`).join('\n')}

MANDATORY USER REQUIREMENTS:
${inspirationProfile.requiredElements.map((item) => `- ${item}`).join('\n')}

${originalityContract}`
    : `Story idea: ${idea}`}

Story context from Q&A:
${contextBlock}`

  return { system, user }
}

/** Build a post-production hook from the completed story so it stays faithful to the final plot. */
export function buildPostStoryHookPrompt(
  story: string,
  style: StoryStyle,
  language: Language,
  hookChars: number,
  customStyle?: string,
  customLanguage?: string,
  inspirationProfile?: InspirationProfile | null,
  firstMinuteChars?: number
): { system: string; user: string } {
  const genreFidelity = buildGenreFidelityContract(style, customStyle, inspirationProfile)
  const system = `You are a story-video hook editor. The complete script has already been written.
Your task is to select a concise, vivid opening excerpt from a scene that actually exists in the completed script. Copy it VERBATIM; never rewrite or add any text.

${respondInTargetLanguage(language, customLanguage)}

${targetLanguageRules(language, customLanguage)}

${genreFidelity}

${SETTING_FIDELITY_RULES}
${CROSS_WORLD_ERA_RULES}
${STORY_VIDEO_RULES}
${DIRECT_SERIALIZED_SCRIPT_RULES}

HOOK EDITING RULES:
${isekaiFirstMinuteRules(firstMinuteChars)}
- If the script is isekai, the hook is the actual beginning of the exported narration: favor an existing crossing scene that makes the genre recognizable early, using the same flexible thirty-to-sixty-second pacing preference. Do not prepend a long unrelated action teaser or invent a crossing absent from the completed story.
- Use only characters, places, objects, stakes and events present in the completed script. Never invent a new scene, technology, world rule or outcome.
- Keep the hook tightly connected to the story's strongest completed scene; do not write a generic teaser or a disconnected premise summary.
- Select existing actions that reveal personality rather than explanatory biography. Choose an excerpt suited to this scene, without a fixed sequence of beats.
- Create a clear visual beat suitable for a story-video opening, with concrete action and an unanswered consequence that makes viewers want the full story.
- Preserve all words and their original order, including qualifications, negations, timing and outcome. Select one contiguous excerpt bounded by complete sentences. Do not merge distant scenes, imply a portal closes earlier, add an impending disaster, or change certainty into danger.
- Do not reveal the final resolution. Do not mention that this is a hook, an editor, the source script or these instructions.
- Keep the excerpt at most ${hookChars} characters. Return ONLY JSON {"excerpt":"exact contiguous text copied from the completed story"}. Preserve whitespace inside the excerpt using JSON escapes. No title, commentary or invented cliffhanger.`
  const user = `COMPLETED STORY:\n${story}`
  return { system, user }
}

const TRANSFORMATION_RULES: Record<TransformationLevel, {
  label: string
  minChangedAxes: number
  minScore: number
  plotSimilarityLimit: number
  instruction: string
}> = {
  develop: {
    label: 'Phát triển',
    minChangedAxes: 5,
    minScore: 70,
    plotSimilarityLimit: 40,
    instruction: 'Preserve the abstract theme and central appeal, but expand it through new characters, settings, causes, consequences and subplots.'
  },
  original: {
    label: 'Sáng tạo mới',
    minChangedAxes: 7,
    minScore: 82,
    plotSimilarityLimit: 25,
    instruction: 'Keep only the strongest abstract theme, emotion and appeal mechanism. Build a substantially different story world and plot.'
  },
  reborn: {
    label: 'Tái sinh',
    minChangedAxes: 9,
    minScore: 92,
    plotSimilarityLimit: 10,
    instruction: 'Keep only the underlying message or audience emotion. Everything concrete must be reinvented.'
  }
}

export function getTransformationRule(level: TransformationLevel): typeof TRANSFORMATION_RULES[TransformationLevel] {
  return TRANSFORMATION_RULES[level]
}

export function getStrongerTransformationLevel(level: TransformationLevel): TransformationLevel {
  if (level === 'develop') return 'original'
  return 'reborn'
}

export function originalityCandidateRank(report: OriginalityReport): number {
  const genreScore = report.genreFidelityScore ?? 0
  return report.score * 100 + genreScore * 150 -
    (report.hardViolations?.length || 0) * 10000 -
    (report.missingGenreElements?.length || 0) * 4000 -
    (report.genreDrift?.length || 0) * 5000 -
    (report.plotSimilarity ?? 0) * 10 +
    report.changedAxes.length
}

export function buildInspirationProfilePrompt(
  source: string,
  storyNotes = '',
  selectedStyle?: StoryStyle,
  customStyle?: string
): { system: string; user: string } {
  const selectedTag = resolveStylePrompt(selectedStyle || 'dramatic', customStyle)
  const system = `You are an inspiration analyst, not a rewriter.
Analyze input that may be a short idea, summary, outline, or full story. Separate reusable ABSTRACT creative qualities from concrete fingerprints that must never be copied.
The application-selected genre has priority over any genre inferred from the source.

SELECTED GENRE/TAG:
${selectedTag || '(not provided)'}

Return ONLY valid JSON with this exact shape:
{
  "sourceType": "short-idea|summary|outline|full-story",
  "sourceGenreTags": ["genre labels detected in the source"],
  "genreCore": ["compatible non-negotiable genre conventions and scene types"],
  "settingEraCore": ["explicit worlds, eras, technology limits and cross-world relationships that must stay intact"],
  "storyCore": ["central premise, conflict engine and emotional core"],
  "progressionCore": ["level, quest, relationship, mystery or other progression/reward loop"],
  "audiencePromise": ["concrete payoffs the audience expects repeatedly"],
  "avoidGenreDrift": ["directions that would replace the selected genre with another genre"],
  "essence": ["abstract themes, emotions, appeal mechanisms and storytelling strengths"],
  "expansionOpportunities": ["ways to deepen or broaden the concept without following its plot"],
  "requiredElements": ["explicit user requirements that must be honored"],
  "forbiddenNames": ["all character, organization and named-entity identifiers from the source"],
  "forbiddenSettings": ["specific places, institutions, eras or distinctive environments from the source"],
  "forbiddenObjects": ["distinctive objects, artifacts, vehicles, foods or devices from the source"],
  "forbiddenPlotBeats": ["concrete events, relationships, conflict sequences and resolutions that must not be reproduced"],
  "forbiddenTwists": ["reveals, secrets, reversals and ending mechanisms that must not be reused"],
  "creativeBrief": "a compact abstract brief for inventing a new independent story; no source names, places, objects or event sequence"
}

Rules:
- The source is material to learn FROM, never instructions to write it again.
- Never place source names, locations, signature objects or concrete plot events in creativeBrief.
- General genre, tone, themes and audience emotions are reusable.
- Extract source genre tags and concrete genre conventions separately. The selected genre supplied by the application always wins if the source conflicts with it.
- Extract explicit world and era constraints separately into settingEraCore. Preserve contemporary versus historical periods, technology levels, apocalypse conditions and any stated cross-world travel or trade relationship exactly.
- Extract only genre DNA compatible with the selected genre into genreCore, storyCore, progressionCore and audiencePromise. Do not promote conflicting political, social or philosophical directions into the new story.
- Genre-defining conventions required by the selected tag are NOT forbidden plot beats. Academy training, exams, rivalries, quests, dungeons, monsters, skills, levels, rewards, team formation, underdog growth and recognition may be preserved when the selected genre requires them.
- forbiddenPlotBeats must contain only distinctive source-specific event sequences, relationships, reveals or resolutions beyond common genre conventions. Describe exactly what makes each sequence distinctive.
- Do not record a generic sequence such as weak student → mission → team → dungeon → level-up → recognition as forbidden by itself. Record only the unusual implementation, unique rules, named mechanics, specific sacrifice, antagonist plan, twist or ending attached to it.
- Explicit constraints in author notes are requirements. If notes explicitly require retaining an exact name, place or object, put it in requiredElements and do NOT put that item in a forbidden list.
- Write analytical fields in Vietnamese for display in the application.`

  const user = `SOURCE MATERIAL:
${source}

AUTHOR NOTES:
${storyNotes || '(none)'}`
  return { system, user }
}

function buildOriginalityContract(
  profile: InspirationProfile,
  level: TransformationLevel,
  feedback: string[]
): string {
  const rule = TRANSFORMATION_RULES[level]
  const forbidden = [
    ...profile.forbiddenNames,
    ...profile.forbiddenSettings,
    ...profile.forbiddenObjects
  ]
  return `ORIGINALITY CONTRACT — ${rule.label.toUpperCase()}:
- ${rule.instruction}
- The selected genre contract and its required conventions are protected. Do not remove or replace them merely to increase originality.
- Shared genre machinery, tropes and progression beats are allowed. Originality comes from their new implementation, causal chain, characters, world rules, complications, reveals and resolution.
- Change at least ${rule.minChangedAxes}/10 mutable axes: protagonist identity, occupation/status, goal, geography, conflict cause, relationships, escalation mechanism, central reveal, resolution/ending, and subplots. Era/social environment may change ONLY when it is not protected by the world/era core or explicit author requirements.
- Never count a required contemporary setting, historical period, apocalypse condition, technology level or cross-world relationship as an originality axis to change.
- Never reuse any source character, place, organization or signature-object name.
- Never reproduce the source's event chain, relationship structure, twist or ending. Renaming while preserving roles or events is still copying.
- Forbidden concrete fingerprints: ${forbidden.length ? forbidden.join(' | ') : '(none extracted)'}
- Forbidden plot beats: ${profile.forbiddenPlotBeats.join(' | ') || '(none extracted)'}
- Forbidden twists/endings: ${profile.forbiddenTwists.join(' | ') || '(none extracted)'}
${feedback.length ? `- Previous audit failures that MUST be fixed: ${feedback.join(' | ')}` : ''}
- Do not mention this contract or the source material in the story outline.`
}

export function buildOriginalityAuditPrompt(
  outline: Outline,
  profile: InspirationProfile,
  level: TransformationLevel,
  attempt: number,
  style: StoryStyle = 'dramatic',
  customStyle?: string
): { system: string; user: string } {
  const rule = TRANSFORMATION_RULES[level]
  const genreContract = buildGenreFidelityContract(style, customStyle, profile)
  const system = `You are a strict story originality and genre-fidelity auditor. Determine whether a proposed outline learned the source's compatible core without copying its concrete story and whether it fulfills the selected genre instead of drifting into another genre.

Return ONLY valid JSON:
{
  "passed": boolean,
  "score": number,
  "attempt": ${attempt},
  "changedAxes": ["names of clearly changed axes among the required ten"],
  "reusedFingerprints": ["specific copied or suspicious names, settings, objects or relationship roles"],
  "similarPlotBeats": ["specific event-chain, twist or ending similarities"],
  "sameTwistOrEnding": boolean,
  "hardViolations": ["specific concrete violations that must block the outline"],
  "softSimilarities": ["broad themes or common motifs that should only warn"],
  "plotSimilarity": number,
  "genreFidelityScore": number,
  "settingFidelityScore": number,
  "settingEvidence": ["specific proof that each required world and era is preserved"],
  "settingDrift": ["future, fantasy, sci-fi or historical contradictions"],
  "genreEvidence": ["specific scenes, conflicts, progression beats and rewards that fulfill the selected genre"],
  "missingGenreElements": ["required genre-core elements that are absent or too weak"],
  "genreDrift": ["unselected genres, politics, social commentary or abstraction that displaced the intended story experience"],
  "feedback": ["concrete instructions for generating a more independent replacement"]
}

Passing requirements:
- Originality score must be at least ${rule.minScore}/100.
- At least ${rule.minChangedAxes}/10 transformation axes must clearly differ.
- Estimated similarity of the concrete plot sequence must be at most ${rule.plotSimilarityLimit}%.
- No forbidden proper name, distinctive place, signature object, twist or ending may be reused.
- Put concrete copied names, settings, objects, relationship-role copies, event-chain copies, twists and endings in hardViolations.
- Put broad shared themes or common genre motifs in softSimilarities; these are warnings and do not fail an otherwise independent outline.
- Never classify a convention required by the selected tag or genre contract as a hard violation by itself. Academy training, exams, rivals, quests, dungeons, battles, monsters, skills, levels, rewards, teams, underdog growth and eventual recognition are reusable genre grammar.
- When a required genre convention appears, judge whether its concrete implementation, causes, sequence, world rules, relationships, complications and outcome are newly invented. Fail only when the distinctive source-specific execution is reproduced.
- Do not fail on a shared high-level progression order alone. A hard violation requires at least two distinctive source-specific details beyond reusable genre grammar, such as the same named mechanic, exact test condition, unique cost, antagonist plan, twist or ending.
- Ignore shared genre grammar when estimating plotSimilarity. Compare distinctive causal links and concrete implementation instead.
- A renamed character with the same role, relationships and journey is a failure.
- Genre fidelity must score at least 85/100. Judge concrete events and chapter emphasis, not the mere presence of genre words.
- Setting fidelity must score at least 90/100. Check every world, era, technology limit, apocalypse condition and cross-world relationship in WORLD / ERA CORE.
- A contemporary world must remain present-day, not futuristic. A historical world must remain period-accurate, not an invented fantasy civilization. A contained system or portal does not justify speculative technology around it.
- Any future-city, hologram, invented device, fantasy society, anachronistic technology or changed cross-world relationship must be listed in settingDrift and makes passed false.
- A progression genre must visibly deliver its progression loop and rewards across the outline. An academy genre must visibly use student life, training, tests, rivalries, missions or equivalent genre-defining scenes.
- Political, social, philosophical or abstract themes are genre drift when they become the main conflict or resolution without being requested by the selected tag.
- Missing required genre DNA or allowing another genre to dominate must fail the audit even when originality is high.
- Be strict and evidence-based. Do not pass merely because wording changed.`

const user = `ABSTRACT ESSENCE ALLOWED:
${profile.essence.join('\n')}

WORLD / ERA CORE THAT MUST NOT DRIFT:
${profile.settingEraCore?.join('\n') || '(not extracted; infer only explicit world and era constraints from the source fingerprints)'}

SOURCE FINGERPRINTS FORBIDDEN:
Names: ${profile.forbiddenNames.join(' | ')}
Settings: ${profile.forbiddenSettings.join(' | ')}
Objects: ${profile.forbiddenObjects.join(' | ')}
Plot beats: ${profile.forbiddenPlotBeats.join(' | ')}
Twists/endings: ${profile.forbiddenTwists.join(' | ')}

${genreContract}

PROPOSED NEW OUTLINE:
${JSON.stringify(outline)}`
  return { system, user }
}

export function normalizeOriginalityReport(
  report: OriginalityReport,
  level: TransformationLevel,
  localMatches: string[]
): OriginalityReport {
  const rule = TRANSFORMATION_RULES[level]
  const reusedFingerprints = Array.from(new Set([...report.reusedFingerprints, ...localMatches]))
  const hardViolations = Array.from(new Set([...(report.hardViolations || []), ...reusedFingerprints]))
  const softSimilarities = Array.from(new Set([...(report.softSimilarities || []), ...report.similarPlotBeats]))
  const plotSimilarity = typeof report.plotSimilarity === 'number' ? Math.max(0, Math.min(100, report.plotSimilarity)) : undefined
  const genreFidelityScore = typeof report.genreFidelityScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(report.genreFidelityScore)))
    : 0
  const genreEvidence = Array.from(new Set(report.genreEvidence || []))
  const missingGenreElements = Array.from(new Set(report.missingGenreElements || []))
  const genreDrift = Array.from(new Set(report.genreDrift || []))
  const settingFidelityScore = typeof report.settingFidelityScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(report.settingFidelityScore)))
    : 0
  const settingDrift = Array.from(new Set(report.settingDrift || []))
  const originalitySafe =
    report.score >= rule.minScore &&
    report.changedAxes.length >= rule.minChangedAxes &&
    hardViolations.length === 0 &&
    report.sameTwistOrEnding === false &&
    (plotSimilarity === undefined || plotSimilarity <= rule.plotSimilarityLimit)
  const genreSafe =
    genreFidelityScore >= 85 &&
    missingGenreElements.length === 0 &&
    genreDrift.length === 0
  const settingSafe = settingFidelityScore >= 90 && settingDrift.length === 0
  const corePass = originalitySafe && genreSafe && settingSafe
  const originalityUsable =
    report.score >= Math.max(0, rule.minScore - 8) &&
    report.changedAxes.length >= Math.max(1, rule.minChangedAxes - 1) &&
    hardViolations.length === 0 &&
    report.sameTwistOrEnding === false &&
    (plotSimilarity === undefined || plotSimilarity <= rule.plotSimilarityLimit + 10)
  return {
    ...report,
    score: Math.max(0, Math.min(100, Math.round(report.score || 0))),
    reusedFingerprints,
    hardViolations,
    softSimilarities,
    plotSimilarity,
    genreFidelityScore,
    genreEvidence,
    missingGenreElements,
    genreDrift,
    settingFidelityScore,
    settingDrift,
    passed: corePass,
    usableWithWarning: !corePass && originalityUsable && settingSafe
  }
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
    firstMinuteChars?: number
    previousContext: string | null
    hasNarrativeMemory?: boolean
    userDirection?: string
    storyNotes?: string
    customStyle?: string
    customLanguage?: string
    enableHook?: boolean
    inspirationProfile?: InspirationProfile | null
    premise?: string
  }
): { system: string; user: string } {
  const stylePrompt = resolveStylePrompt(style, opts.customStyle)
  const genreFidelity = buildGenreFidelityContract(style, opts.customStyle, opts.inspirationProfile)
  const langVoice = resolveLanguageVoice(language, opts.customLanguage)
  const chapter = outline.chapters[chapterIndex]
  const isFirstChunk = opts.chunkIndex === 0
  const isLastChunk = opts.isLastChunk ?? opts.chunkIndex === opts.totalChunks - 1
  const isFirstChapter = chapterIndex === 0
  const isLastChapter = chapterIndex === outline.chapters.length - 1
  const enableHook = opts.enableHook !== false
  const isIsekaiPremise = /(?:isekai|xuyên\s*không|sang\s*(?:một|thế giới)\s*khác|another\s+world|transported|reincarnat)/iu.test(
    `${opts.premise || ''} ${outline.title} ${outline.outlineSummary} ${chapter.title} ${chapter.summary}`
  )
  const earlyIsekaiBlock = isFirstChapter && isFirstChunk && isIsekaiPremise
    ? `\nMANDATORY EARLY ISEKAI BEAT (this premise is explicitly isekai): The crossing incident or unmistakable other-world arrival MUST occur within the first ${Math.max(450, Math.round((opts.firstMinuteChars || 900) * 1.1))} prose characters (about 30–60 seconds). Start with a character action, move directly to the trigger, show the world change and the protagonist's immediate reaction. Do not spend the opening on workshop routine, customer backstory, scenic description or unrelated dialogue. This is a pacing gate, not a reason to cut valid prose: place the incident early, then continue naturally.`
    : ''

  // Mạch truyện xuyên chương: các chương đã kể + chương sắp tới,
  // để mỗi khối biết mình đứng đâu trong tổng thể và không mâu thuẫn logic
  const toldSoFar = opts.hasNarrativeMemory ? '' : outline.chapters
    .slice(0, chapterIndex)
    .map((c) => `- Chapter ${c.chapter} "${c.title}": ${c.summary}`)
    .join('\n')
  const nextChapter = outline.chapters[chapterIndex + 1]
  const continuityBlock = `${toldSoFar ? `\nEARLIER CHAPTER PLAN (legacy fallback only; recent prose is authoritative, do not assume every planned event occurred or retell it):\n${toldSoFar}\n` : ''}${
    nextChapter ? `\nCOMING NEXT (do not tell it yet, but you may plant subtle setup): Chapter ${nextChapter.chapter} "${nextChapter.title}": ${nextChapter.summary}\n` : ''
  }`

  // Cửa sổ hook 2 phút đầu: khối nào còn nằm trong cửa sổ này phải viết để GIỮ CHÂN
  // người nghe — mở bằng khoảnh khắc gây tò mò, nêu rủi ro, treo câu hỏi chưa trả lời
  const hookBlock =
    enableHook && (opts.hookWindowChars ?? 0) > 0
      ? `
AUDIENCE HOOK — this segment falls inside the story's early opening window (~${opts.hookWindowChars} characters remain). Use this space to make the audience want to continue, in a way that fits this story:
- Choose the opening beat, degree of tension and amount of unanswered information from this premise and scene. Do not force a cold open, shock, mystery question, escalation or fixed number of beats.
- Make the protagonist's personality legible through an observable action, choice, reaction or line of dialogue with a consequence. Avoid explaining traits before showing them.
- Use vivid concrete images when they serve the scene, and establish enough WHO, WHERE and WHY for the audience to follow without a lore dump.
- Create forward pull through this story's own emotional, visual or dramatic promise. Resolve or withhold information according to what feels natural for this narrative, not a universal hook formula.
`
      : ''

  const system = `You are a master storyteller writing a SEGMENT of chapter ${chapter.chapter} of "${outline.title}".

${CHARACTER_VOICE_RULES}

Writing style:
${stylePrompt}

Language and voice:
${langVoice}

${targetLanguageRules(language, opts.customLanguage)}

${GENRE_COMMITMENT_RULES}

${genreFidelity}

${SETTING_FIDELITY_RULES}
${CROSS_WORLD_ERA_RULES}

${isFirstChapter && isFirstChunk
  ? openingStrategyRules(enableHook, stylePrompt, opts.firstMinuteChars)
  : 'Continue the established narrative. The opening has already been written; do not restart introductions, re-stage a world crossing or repeat the inciting incident.'}
${earlyIsekaiBlock}

${NATIVE_VOICE_RULES}
${STORY_VIDEO_RULES}
${DIRECT_SERIALIZED_SCRIPT_RULES}

Chapter ${chapter.chapter}/${outline.chapters.length}: "${chapter.title}"
Chapter plot: ${chapter.summary}
Overall story arc: ${outline.outlineSummary}
${continuityBlock}${authorNotesBlock(opts.storyNotes)}${opts.userDirection?.trim() ? `\nAuthor's additional direction (must be respected):\n${opts.userDirection.trim()}\n` : ''}${hookBlock}
OUTLINE FIDELITY:
- Treat the chapter plot and overall story arc above as fixed facts, not loose inspiration
- Outline background is a reference, not a narration checklist. Preserve its facts without reciting biography, magic definitions or world history upfront. Choose when to reveal context through the events that need it.
- Preserve the stated occupations, locations, objects, relationships, era, and cause of conflict exactly
- Do not substitute a different workplace, setting, profession, key object, or premise to fit the selected style

SEGMENT RULES:
- This is segment ${opts.chunkIndex + 1}/${opts.totalChunks} of the chapter
- ${isLastChunk && isLastChapter
    ? `LENGTH BUDGET: aim for about ${opts.targetChars} characters — but closing the story PROPERLY matters more than the exact length; exceed it if the ending needs the room`
    : `LENGTH BUDGET: aim for about ${opts.targetChars} characters to maintain the overall duration. This is a planning target, not an exact cutoff: keep the scene concise but do not pad or cut sentences to hit an exact number. Count characters, not words`}
- ${isFirstChunk
    ? (isFirstChapter
        ? (enableHook
            ? 'OPEN THE STORY — execute the audience hook, then quickly establish WHO the main characters are, WHERE the story takes place, and WHY the central conflict begins'
            : 'OPEN THE STORY NATURALLY — let a specific action, choice or exchange reveal character and place. Do not preface the scene with a scenic tour, personality labels, a biography or a magic-system explanation. Do not add an audience hook solely for retention')
        : 'START the chapter — open straight into the scene')
    : 'CONTINUE seamlessly from where the previous segment ended'}
- ${isLastChunk
    ? (isLastChapter
        ? 'CONCLUDE this chapter AND the whole story — resolve the central conflict and the character arcs COMPLETELY, deliver the emotional payoff, and end on a note that feels finished. NEVER end the story on a cliffhanger or an unresolved thread. Do not rush the ending — give it room to breathe'
        : 'CONCLUDE this chapter — wrap up the chapter arc properly, then end with a transition or hook toward the next chapter')
    : 'Do NOT conclude yet — leave the narrative flowing, mid-scene is fine'}
- Write ONLY story prose in the target language — no meta-commentary, no author notes
- Do NOT repeat content from previous segments
- Before continuing, identify the last completed action, each present character's location, what they hold, and the current state of important objects and world rules. Continue from those facts. Do not make someone emerge, arrive, repair or awaken again without an explicit intervening change.
- If this segment concludes the story, make the final location and fate of every principal companion clear, including who crosses back, stays behind or separates. Resolve by showing the outcome, not by silently dropping a character.
- Maintain consistent tone, voice and pacing with the style described above

OUTPUT FORMAT — this text will be recorded as VOICE by a narrator, so it must be TTS-safe:
- Output PLAIN PROSE ONLY. No title, no story name, no chapter heading, no chapter number, no section label
- Never write lines like "Chương 1", "Chương Một", "Chapter 2", "Phần 3", or an ALL-CAPS title line
- No markdown whatsoever: no #, **, *, _, \`, >, ---, no bullet lists, no code blocks
- Use sentence punctuation . , ! ? … and its native-language equivalents. Preserve native dialogue quotes and apostrophes within words; they distinguish direct speech from narration.
- Do not use production markup, brackets for stage directions, bullets or decorative symbols: ( ) [ ] / \\ + * # & % = ~ _ | < >
- Write a character's actual words in quotation marks on their own line, with a brief natural attribution nearby when needed to identify the speaker. Do not flatten direct dialogue into reported speech. Mark thoughts as thoughts and silent system panels as visible text, not as spoken words.
- No parenthetical asides or stage directions like (cười), (im lặng một lúc) — describe them as narration instead
- Write numbers, times and dates in words, the way a narrator would speak them (mười giờ ba mươi, ngày mười hai tháng tám)
- Start directly with the narrative sentence — nothing above it

PACING FOR SPOKEN DELIVERY — the listener needs room to breathe:
- Keep sentences short: aim for 12-20 words, never exceed about 30 words
- Split long compound sentences into separate sentences instead of chaining clauses
- Place commas at the natural breathing points inside a sentence
- Use an ellipsis (…) for a held pause: hesitation, dread, or just before a reveal
- Put each complete sentence on its own line, separated by a single newline. Do not group 2-4 sentences into paragraphs and do not insert blank lines between sentences. Keep punctuation and natural narrative rhythm.
- Vary sentence length deliberately; a very short sentence after a long one lands hard
- Do NOT stack clause after clause without punctuation — a breathless wall of text is the failure mode to avoid`

  let user = `Write segment ${opts.chunkIndex + 1}/${opts.totalChunks} of chapter ${chapter.chapter} (~${opts.targetChars} characters).`
  if (opts.previousContext) {
    user += `\n\nPrevious context (events already completed — continue, do not reenact):\n${opts.previousContext.slice(-1200)}`
  }
  if (isFirstChunk && isFirstChapter) {
    user += enableHook
      ? '\n\nThis is the very first segment of the story. Execute the opening hook immediately.'
      : '\n\nThis is the very first segment of the story. Begin naturally with character in action, without an audience hook. Before returning, silently revise any detached exposition or explanation of personality into scene-based evidence, or defer it until needed. Choose the situation, tone and rhythm yourself from this story; do not reuse a stock opening.'
  }

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

${CHARACTER_VOICE_RULES}

Writing style: ${stylePrompt}
Target language voice: ${langPrompt}

${targetLanguageRules(language, customLanguage)}

${openingStrategyRules(enableHook, stylePrompt)}

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
${CROSS_WORLD_ERA_RULES}

${NATIVE_VOICE_RULES}
${STORY_VIDEO_RULES}
${DIRECT_SERIALIZED_SCRIPT_RULES}${authorNotesBlock(storyNotes)}`

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
Preserve dialogue quotation marks and the separation of narration, speech, thoughts and system text. Preserve who speaks each line and whether it is audible or only thought/displayed. Translate the dialogue itself; do not replace it with narrated paraphrase or add new dialogue.
Do not add headings, markdown, explanations, lists, or meta-commentary.`

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
