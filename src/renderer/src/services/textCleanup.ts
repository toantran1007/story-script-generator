// Dọn văn bản truyện cho mục đích đọc/lồng tiếng:
// bỏ tiêu đề, nhãn chương, ký hiệu markdown — chỉ giữ lại lời kể.

/** Dòng tiêu đề markdown: `# Mạch Nước Nở Hoa`, `### Phần kết` */
const MD_HEADING = /^\s{0,3}#{1,6}\s*\S/

/** Đường kẻ ngang: `---`, `***`, `___` */
const HORIZONTAL_RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/

/**
 * Nhãn chương: `Chương 1: Mùa rau non...`, `Chương Một`, `CHƯƠNG MƯỜI BA`, `Chapter 2`.
 * Bắt buộc phải có số/số đếm ngay sau từ khoá, nên câu văn thật như
 * "Phần lớn người ta..." hay "Hồi ấy trời còn lạnh" KHÔNG bị xoá.
 */
const CHAPTER_LABEL =
  /^\s*(?:chương|chapter|phần|part|hồi|tập|episode)\s+(?:\d+|[ivxlcdm]+|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười(?:\s+\S+)?|mươi(?:\s+\S+)?)\s*(?:[:.)\-–—]\s*.*)?$/i

/**
 * Dòng tiêu đề viết hoa toàn bộ, kiểu `GIẤY BÁO PHÁT CHO NGƯỜI ĐÃ CHẾT`.
 * Điều kiện chặt để không xoá oan lời thoại gào lên hay câu văn cố ý viết hoa:
 * không có chữ thường, không có dấu ngoặc kép, không kết thúc bằng dấu câu.
 */
function isAllCapsTitle(line: string): boolean {
  const t = line.trim()
  if (t.length === 0 || t.length > 80) return false
  if (/["“”'’«»]/.test(t)) return false
  if (/[.!?…:]$/.test(t)) return false
  if (!/\p{Lu}/u.test(t)) return false
  if (/\p{Ll}/u.test(t)) return false
  const words = t.split(/\s+/)
  return words.length >= 2 && words.length <= 12
}

/** Bỏ ký hiệu nhấn mạnh nhưng giữ nguyên chữ bên trong. */
function stripInlineMarkup(line: string): string {
  return line
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^\s{0,3}>\s?/, '') // dấu trích dẫn đầu dòng
    .replace(/^\s{0,3}[*+]\s+/, '') // gạch đầu dòng markdown
}

/**
 * Làm sạch một dòng cho thu voice: chỉ giữ chữ + dấu câu đọc được (. , ! ? …),
 * loại mọi ký hiệu khiến TTS đọc sai hoặc ngắt lỗi: ( ) " ' : ; / + - — * # v.v.
 */
function sanitizeForVoice(line: string): string {
  let s = line

  // Ngoặc tròn/vuông: chú thích ngắn (không có dấu kết câu bên trong) là mô tả
  // dư thừa kiểu "(cười)", "(giọng nhỏ dần)" — bỏ cả cụm. Cụm dài hoặc có câu
  // hoàn chỉnh thì giữ chữ, chỉ bỏ dấu ngoặc.
  s = s.replace(/[(（\[［]([^)）\]］]*)[)）\]］]/g, (_m, inner: string) => {
    const t = String(inner).trim()
    if (t.length <= 60 && !/[.!?…]/.test(t)) return ''
    return ` ${t} `
  })
  // Ngoặc lẻ còn sót
  s = s.replace(/[()（）\[\]［］{}]/g, ' ')

  // Mọi loại dấu ngoặc kép / nháy: bỏ ký hiệu, giữ lời thoại
  s = s.replace(/["“”„‟«»「」『』]/g, '')
  // Nháy đơn: giữ apostrophe giữa chữ (I'm, O'Brien), bỏ các nháy bao quanh
  s = s.replace(/(^|[^\p{L}\p{N}])['‘’]|['‘’](?=[^\p{L}\p{N}]|$)/gu, '$1')

  // Hai chấm: giữa hai chữ số (giờ 10:30) → khoảng trắng; còn lại → phẩy
  s = s.replace(/(\d)\s*[:：]\s*(\d)/g, '$1 $2')
  s = s.replace(/\s*[:：]\s*/g, ', ')

  // Gạch chéo: tách thành khoảng trắng (ngày/đêm → ngày đêm)
  s = s.replace(/\s*[/\\]\s*/g, ' ')

  // Gạch thoại đầu dòng → bỏ (lời thoại thành câu trần)
  s = s.replace(/^\s*[-–—―]\s+/, '')
  // Gạch dài giữa câu → phẩy; gạch nối giữa chữ → khoảng trắng
  s = s.replace(/\s*[–—―]\s*/g, ', ')
  s = s.replace(/(\S)-(\S)/g, '$1 $2')
  s = s.replace(/\s+-\s+/g, ', ')

  // Ký hiệu còn lại không đọc được → khoảng trắng
  s = s.replace(/[+*=#~^_|<>@&$%§•·]/g, ' ')

  // Dọn hậu quả: phẩy chồng, dấu cách trước dấu câu, khoảng trắng thừa
  s = s
    .replace(/\s+([.,!?…])/g, '$1')
    .replace(/,\s*([.!?…])/g, '$1')
    .replace(/([,.!?…])\s*,+/g, '$1')
    .replace(/,{2,}/g, ',')
    .replace(/\.{4,}/g, '…')
    .replace(/ {2,}/g, ' ')
    .replace(/^\s*,\s*/, '')

  return s.trim() === '' ? '' : s.replace(/\s+$/, '')
}

/**
 * Dọn một đoạn văn bản truyện. Gọi cho từng khối ngay khi AI trả về.
 * Bỏ tiêu đề/nhãn chương/markdown, rồi làm sạch ký hiệu cho thu voice.
 * Chỉ xử lý hình thức, không thêm/bớt nội dung câu chuyện.
 */
export function stripNarrationMarkup(text: string): string {
  if (!text) return text

  const kept: string[] = []
  for (const raw of text.split('\n')) {
    const line = stripInlineMarkup(raw).replace(/\s+$/, '')
    const trimmed = line.trim()

    if (trimmed === '') {
      kept.push('')
      continue
    }
    if (MD_HEADING.test(trimmed)) continue
    if (HORIZONTAL_RULE.test(trimmed)) continue
    if (CHAPTER_LABEL.test(trimmed)) continue
    if (isAllCapsTitle(trimmed)) continue

    const voiced = sanitizeForVoice(line)
    if (voiced === '') continue
    kept.push(voiced)
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // tối đa một dòng trống giữa các đoạn
    .replace(/^\n+/, '')
}
