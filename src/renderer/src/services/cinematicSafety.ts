/** Shared safety contract for prose that may later become an image/video prompt. */
export type CinematicSafetyCategory =
  | 'sexual_explicit'
  | 'minor_sexualization'
  | 'graphic_gore'
  | 'sexual_violence'
  | 'hateful_dehumanization'
  | 'exploitative_abuse'

export interface CinematicSafetyFinding {
  category: CinematicSafetyCategory
  excerpt: string
  reason: string
}

export class CinematicSafetyError extends Error {
  readonly code = 'safety_rewrite_required'
  constructor(readonly findings: CinematicSafetyFinding[]) {
    super(`Nội dung còn chi tiết nhạy cảm cần chuyển thể điện ảnh an toàn (${findings.map((f) => f.category).join(', ')})`)
    this.name = 'CinematicSafetyError'
  }
}

/** Add this contract to every writing/rewrite/analysis prompt that can feed visuals. */
export const CINEMATIC_SAFETY_RULES = `CINEMATIC SAFETY FOR IMAGE/VIDEO — preserve the plot and natural prose, but make every visual beat suitable for a general-audience image/video model:
- Keep romance emotional and non-explicit. Do not describe sex acts, exposed intimate anatomy, erotic posing, fetish content or sexualized camera framing.
- Treat a character described as a child, teen, student, minor, under eighteen, young-looking or of unclear age as an adult only after the story establishes adulthood; otherwise remove sexual/romantic framing and do not place that character in an intimate situation.
- Keep danger and conflict dramatic but non-graphic: no gore, exposed organs, dismemberment, decapitation detail, mutilation, torture detail, blood splatter or lingering wounds. Use silhouettes, cutaways, sound, shaken hands, torn clothing without anatomy, dust, smoke, aftermath, witness reactions, medical care or an off-screen transition.
- Do not glorify sexual violence, coercion, trafficking, abuse, hateful dehumanization, extremist praise or attacks on protected groups. When such a beat is necessary, imply the threat, center the victim's agency and aftermath, and keep the harmful act off-screen without graphic or sexual detail.
- Never turn a safety rewrite into a new event, new character, new relationship, or different outcome. Preserve names, causality, stakes, chronology and the author's chosen language.
- Prefer cinematic substitutes: obstructed composition, distant framing, neutral clothing, decisive action, reaction shots, environmental evidence, fade to black, and the consequences after help arrives.`

/** Rewrite directive for correction passes, where the original draft is supplied as data. */
export const CINEMATIC_SAFETY_REWRITE_RULES = `${CINEMATIC_SAFETY_RULES}

SAFETY REWRITE PROCEDURE:
If the supplied draft contains an unsafe detail, make the smallest exact edit that preserves its narrative function. Replace explicit action with implication, reaction, interrupted movement, off-screen aftermath or a safe adult framing. Do not delete the beat merely to pass. If age is ambiguous in an intimate beat, remove the intimacy rather than guessing an age. The returned memory must describe the safe corrected meaning.`

const SEXUAL_EXPLICIT: Array<[RegExp, string]> = [
  [/\b(?:sex|sexual|intercourse|penetrat(?:e|ion)|oral sex|blowjob|handjob|masturbat(?:e|ion)|porn(?:ography)?|erotic|fetish)\b/iu, 'explicit sexual content'],
  [/(?:quan hệ tình dục|làm tình|giao cấu|khỏa thân|trần truồng|gợi dục|dâm ô|bộ phận sinh dục|cởi đồ)/iu, 'mô tả tình dục'],
  [/(?:성관계|성적 행위|나체|음란|性行為|性交|裸|猥褻|官能|嬌声|愛撫|処女|純潔|身悶え|喘ぎ|豊満な胸|胸を押し当て|首筋から鎖骨|指先を(?:滑らせ|這わせ|なぞる)|愛らしい悲鳴|耳朶をくすぐり|吐息が直接|白い肌.{0,16}(?:真紅|朱)|身体が熱く|体が熱く|การมีเพศสัมพันธ์|เปลือย)/su, 'explicit sexual content']
]

const MINOR_MARKERS = /(?:\b(?:child|minor|teen(?:age)?|underage|schoolgirl|schoolboy|boy|girl)\b|\b(?:1[0-7]|[1-9])[- ]?(?:year[- ]old|tuổi)\b|trẻ (?:em|con)|vị thành niên|thiếu niên|học sinh|trẻ tuổi|เด็ก|วัยรุ่น|未成年|少女|少年|女子高生|男子高校生|中学生|高校生|幼い子|子ども|เด็กนักเรียน|미성년|청소년)/iu

const GRAPHIC_GORE: Array<[RegExp, string]> = [
  [/(?:\bgor(?:e|y)\b|blood\s+(?:splatter|spray|gush)|exposed\s+(?:organs|entrails)|dismember(?:ed|ment)|decapitat(?:e|ed|ion)|disembowel(?:ed|ment)|mutilat(?:e|ed|ion)|severed\s+(?:head|limb)|torture\s+(?:detail|scene))/iu, 'graphic gore or torture detail'],
  [/(?:máu (?:me|bắn|văng|tung tóe|xối)|nội tạng|chặt đầu|đầu lìa|phân xác|mổ bụng|tra tấn chi tiết|xác bị(?: chặt| xé))/iu, 'mô tả máu me/gore chi tiết'],
  [/(?:เลือดสาด|อวัยวะภายใน|ตัดหัว|ชิ้นส่วนร่างกาย|ทรมานอย่างละเอียด|内臓|斬首|四肢切断|血しぶき|血飛沫|拷問|体の一部|잔혹한 고어)/u, 'graphic gore or torture detail']
]

const SEXUAL_VIOLENCE: Array<[RegExp, string]> = [
  [/(?:rape|raped|sexual assault|forced sex|sex trafficking|sexual exploitation|groom(?:ed|ing))/iu, 'sexual violence or exploitation'],
  [/(?:cưỡng hiếp|hiếp dâm|xâm hại tình dục|buôn bán tình dục|bóc lột tình dục|dụ dỗ trẻ)/iu, 'bạo lực/xâm hại tình dục'],
  [/(?:ข่มขืน|ล่วงละเมิดทางเพศ|ค้ามนุษย์|性暴力|強姦|性的暴行|性虐待|児童買春|人身売買|성폭력|성착취)/u, 'sexual violence or exploitation']
]

const HATEFUL_DEHUMANIZATION: Array<[RegExp, string]> = [
  [/(?:\b(?:kill|wipe out|exterminate)\s+all\s+(?:[a-z-]+\s+)?(?:people|race|ethnicity|immigrants|believers)\b|subhuman|racial slur)/iu, 'hateful dehumanization or group violence'],
  [/(?:diệt sạch|giết hết|xóa sổ)\s+(?:người|dân tộc|tôn giáo|sắc tộc)/iu, 'kích động bạo lực với cộng đồng'],
  [/(?:ฆ่าล้างเผ่าพันธุ์|คนชั้นต่ำ|非人類|殲滅民族|인종 말살)/u, 'hateful dehumanization or group violence']
]

const EXPLOITATIVE_ABUSE: Array<[RegExp, string]> = [
  [/(?:human trafficking|forced labor|child exploitation|abusive captivity|coercive control)/iu, 'exploitative abuse'],
  [/(?:buôn người|lao động cưỡng bức|bóc lột trẻ em|giam cầm cưỡng bức|kiểm soát cưỡng ép)/iu, 'bóc lột hoặc lạm dụng'],
  [/(?:ค้ามนุษย์|แรงงานบังคับ|การแสวงหาประโยชน์จากเด็ก|人身売買|強制労働|아동 착취)/u, 'exploitative abuse']
]

function excerpt(text: string, index: number): string {
  return text.slice(Math.max(0, index - 42), Math.min(text.length, index + 90)).replace(/\s+/gu, ' ').trim()
}

function collect(text: string, category: CinematicSafetyCategory, rules: Array<[RegExp, string]>, findings: CinematicSafetyFinding[]): void {
  for (const [pattern, reason] of rules) {
    const match = pattern.exec(text)
    if (match && match.index >= 0) findings.push({ category, excerpt: excerpt(text, match.index), reason })
  }
}

function firstMatchIndex(text: string, rules: Array<[RegExp, string]>): number | null {
  const indexes = rules.map(([pattern]) => pattern.exec(text)?.index).filter((index): index is number => index !== undefined)
  return indexes.length ? Math.min(...indexes) : null
}

export function scanCinematicSafety(text: string): CinematicSafetyFinding[] {
  const source = text.normalize('NFKC')
  if (!source.trim()) return []
  const findings: CinematicSafetyFinding[] = []
  collect(source, 'sexual_explicit', SEXUAL_EXPLICIT, findings)
  collect(source, 'graphic_gore', GRAPHIC_GORE, findings)
  collect(source, 'sexual_violence', SEXUAL_VIOLENCE, findings)
  collect(source, 'hateful_dehumanization', HATEFUL_DEHUMANIZATION, findings)
  collect(source, 'exploitative_abuse', EXPLOITATIVE_ABUSE, findings)
  const minorMatch = MINOR_MARKERS.exec(source)
  const sexualIndex = firstMatchIndex(source, [...SEXUAL_EXPLICIT, ...SEXUAL_VIOLENCE])
  if (minorMatch && sexualIndex !== null && Math.abs(minorMatch.index - sexualIndex) <= 500) {
    const match = minorMatch
    findings.push({ category: 'minor_sexualization', excerpt: excerpt(source, match?.index ?? 0), reason: 'minor or age-ambiguous character combined with sexual content' })
  }
  return findings
}

export function assertCinematicSafety(text: string): void {
  const findings = scanCinematicSafety(text)
  if (findings.length) throw new CinematicSafetyError(findings)
}

/** Conservative last-mile wording changes for a few unambiguous Japanese terms.
 * This is intentionally tiny; anything outside these exact phrases stays on the
 * model-rewrite path instead of being changed blindly.
 */
export function rewriteCinematicFallback(text: string): { text: string; replacements: number } {
  const replacements: Array<[RegExp, string]> = [
    [/官能的な接触/gu, '無遠慮な接触'],
    [/淫靡な欲望/gu, '動揺した気持ち'],
    [/嬌声/gu, '声'],
    [/喘鳴/gu, '苦しげな呼吸'],
    [/喘ぎ/gu, '苦しげな息'],
    [/身悶え/gu, '身をすくめ'],
    [/愛撫されるような/gu, '魔力を受けたような'],
    [/甘美な痺れ/gu, '強いしびれ'],
    [/肌を重ね/gu, '身を寄せ'],
    [/豊満な胸/gu, '胸元'],
    [/豊かな胸/gu, '胸元'],
    [/官能的な熱情/gu, '強い熱意'],
    [/狂熱の恋情/gu, '深い信頼'],
    [/官能の嵐/gu, '強い魔力の波'],
    [/胸を押し当て/gu, 'すがりつい'],
    [/首筋から鎖骨にかけて、?指先を滑らせ/gu, '魔力経路を確かめるように指先を当て'],
    [/首筋から鎖骨にかけて、?無自覚にそっと指先を当てる/gu, '魔力経路を確かめるように手を当てる'],
    [/指先を(?:滑らせ|這わせ|なぞる)/gu, '指先を当てる'],
    [/愛らしい悲鳴/gu, '驚きの声'],
    [/ひゃうっ/gu, '驚きの声'],
    [/潤んだ瞳/gu, '揺れる瞳'],
    [/首筋から鎖骨にかけて、?無自覚にそっと指先を当てるた/gu, '魔力経路を確かめた'],
    [/白い肌が(?:一瞬で|瞬く間に)真紅に染まる/gu, '頬が赤くなる'],
    [/白い肌が(?:一瞬で|瞬く間に)朱に染まる/gu, '頬が赤くなる'],
    [/身体が熱く/gu, '体が緊張し'],
    [/体が熱く/gu, '体が緊張し'],
    [/吐息が直接耳朶をくすぐり、/gu, '耳元で静かな声を聞き、'],
    [/白い肌が頭の天辺から爪先まで一瞬で真紅に染まり上がる/gu, '表情が一瞬でこわばる'],
    [/純潔/gu, '信仰'],
    [/血飛沫/gu, '土煙'],
    [/血しぶき/gu, '土煙'],
    [/肌を通じて/gu, '触れた手を通じて'],
    [/肌を触れ合わせて/gu, '手を添えて'],
    [/肌を重ねて/gu, '魔力を整えて']
  ]
  let next = text, count = 0
  for (const [pattern, replacement] of replacements) {
    const before = next
    next = next.replace(pattern, replacement)
    if (next !== before) count += 1
  }
  return { text: next, replacements: count }
}

export function cinematicSafetyRetryFeedback(error: unknown): string {
  if (!(error instanceof CinematicSafetyError)) return ''
  const details = error.findings.map((f) => `${f.category}: ${f.reason}; excerpt=${JSON.stringify(f.excerpt)}`).join(' | ')
  return `LOCAL SAFETY VALIDATION FAILED: ${details}. Rewrite only the unsafe spans in the SAME ORIGINAL draft using CINEMATIC SAFETY rules. Keep the plot, agency, chronology, names, outcome and natural target-language prose. Use implication, reaction, cutaway or off-screen aftermath; do not add a new event. Return the complete JSON object with all prior valid edits retained.`
}
