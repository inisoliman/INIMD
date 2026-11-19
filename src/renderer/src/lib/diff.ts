/** يوضّح الفروق بين نسختين من نص Markdown على مستوى الأسطر. */

export interface LineRange {
  /** رقم أول سطر متغيّر (يبدأ من صفر) */
  start: number
  /** رقم آخر سطر متغيّر (شامل) */
  end: number
}

const normalize = (text: string): string => text.replace(/\r\n?/g, '\n')

/** أقصى حجم لجدول المقارنة قبل التحوّل إلى تظليل الكتلة كاملة. */
const MAX_CELLS = 2_000_000

function coalesce(lines: number[]): LineRange[] {
  const ranges: LineRange[] = []
  for (const line of lines) {
    const last = ranges[ranges.length - 1]
    if (last && line <= last.end + 1) last.end = Math.max(last.end, line)
    else ranges.push({ start: line, end: line })
  }
  return ranges
}

/**
 * يقارن نصين سطرًا بسطر ويُعيد نطاقات الأسطر المتغيّرة في النص الجديد.
 * يعتمد تقليص البادئة واللاحقة ثم LCS على الجزء الأوسط فقط، مع حدّ آمن
 * للذخيرة حتى لا تتجمد الواجهة على الملفات الضخمة.
 */
export function diffLineRanges(previous: string, next: string): LineRange[] {
  const before = normalize(previous).split('\n')
  const after = normalize(next).split('\n')

  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1

  let tailBefore = before.length - 1
  let tailAfter = after.length - 1
  while (tailBefore >= head && tailAfter >= head && before[tailBefore] === after[tailAfter]) {
    tailBefore -= 1
    tailAfter -= 1
  }

  if (tailBefore < head && tailAfter < head) return []

  const changed = new Set<number>()
  const middleBefore = tailBefore - head + 1
  const middleAfter = tailAfter - head + 1

  if (middleBefore <= 0) {
    // إضافة محضة
    for (let line = head; line <= tailAfter; line += 1) changed.add(line)
  } else if (middleAfter <= 0) {
    // حذف محض: نُبرز السطر الذي وقع عنده الحذف
    const mark = Math.min(head, after.length - 1)
    if (mark >= 0) changed.add(mark)
  } else if (middleBefore * middleAfter > MAX_CELLS) {
    // ملف ضخم: نُبرز الكتلة المتغيّرة كاملة بدل حساب LCS
    for (let line = head; line <= tailAfter; line += 1) changed.add(line)
  } else {
    const cols = middleAfter + 1
    const table = new Uint32Array((middleBefore + 1) * cols)
    for (let i = middleBefore - 1; i >= 0; i -= 1) {
      for (let j = middleAfter - 1; j >= 0; j -= 1) {
        const index = i * cols + j
        if (before[head + i] === after[head + j]) {
          table[index] = table[(i + 1) * cols + j + 1] + 1
        } else {
          table[index] = Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
        }
      }
    }

    let i = 0
    let j = 0
    while (i < middleBefore && j < middleAfter) {
      if (before[head + i] === after[head + j]) {
        i += 1
        j += 1
      } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
        i += 1
      } else {
        changed.add(head + j)
        j += 1
      }
    }
    while (j < middleAfter) {
      changed.add(head + j)
      j += 1
    }
  }

  return coalesce(Array.from(changed).sort((a, b) => a - b))
}

export function intersects(ranges: LineRange[], start: number, end: number): boolean {
  for (const range of ranges) {
    if (range.start < end && start <= range.end) return true
  }
  return false
}
