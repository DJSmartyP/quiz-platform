import { anagramDisplay, normalise, type Grade, type GradeVerdict, type Player, type Question, type Response, type ServerOrder } from './model.ts'

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value))
export const roundScore = (value: number) => Math.max(0, Math.round(value / 10) * 10)

export function normaliseQuestion(question: Question): Question {
  const { scoreMode: _legacyScoreMode, ...clean } = question
  const points = Math.max(0, Math.round(Number(clean.points) || 0))
  const duration = Math.max(1, Math.round(Number(clean.duration) || 30))
  const placementMode = ['single', 'boolean', 'text'].includes(clean.type) && clean.placementMode === 'fastest-correct'
    ? 'fastest-correct' as const : 'none' as const
  const numberBands = clean.type === 'number'
    ? normaliseNumberBands(clean.numberBands?.length ? clean.numberBands : [{ tolerance: Math.max(0, Number(clean.tolerance) || 0), fraction: 1 }])
    : undefined
  return { ...clean, points, duration, placementMode, numberBands }
}

export function normaliseNumberBands(bands: Question['numberBands']) {
  const byTolerance = new Map<number, number>()
  for (const band of bands || []) {
    const tolerance = Math.max(0, Number(band.tolerance))
    const fraction = clamp(Number(band.fraction))
    if (Number.isFinite(tolerance) && fraction > 0) byTolerance.set(tolerance, Math.max(byTolerance.get(tolerance) || 0, fraction))
  }
  const sorted = [...byTolerance].map(([tolerance, fraction]) => ({ tolerance, fraction })).sort((a, b) => a.tolerance - b.tolerance)
  let previous = 1
  return sorted.map(band => {
    const fraction = Math.min(previous, band.fraction)
    previous = fraction
    return { ...band, fraction }
  })
}

export const questionInstruction = (question: Question): string => question.placementMode === 'fastest-correct'
  ? 'Answer correctly and quickly · Earlier correct answers score more.'
  : ({
  single: 'Pick the correct answer · Correct = full points.',
  multi: 'Select every correct answer · Wrong selections reduce your score.',
  boolean: 'Choose True or False · Correct = full points.',
  text: 'Type the correct answer · Correct = full points.',
  free: 'Write your answer · The Host awards 0%, 50% or 100%.',
  number: 'Enter your best answer · The closer you are, the more you score.',
  closest: 'Guess the number · Points are awarded by closest position.',
  ordering: 'Put everything in order · More correct ordering = more points.',
  matching: 'Match the pairs · Each correct match earns points.',
  categorise: 'Sort every item · Each correctly placed item earns points.',
  list: 'Find as many answers as you can · Each unique correct answer earns points.',
  anagram: 'Unscramble it early · Fewer revealed letters = more points.',
  'photo-reveal': 'Name the picture early · Less revealed = more points.',
  'photo-zoom': 'Name the picture early · More zoomed-in = more points.',
}[question.type])

export function scoringSummary(question: Question): string {
  const maximum = `${roundScore(question.points).toLocaleString()} max`
  if (question.placementMode === 'fastest-correct') return `${maximum} · Fastest correct`
  if (question.type === 'free') return `${maximum} · Host judged 0 / 50 / 100%`
  if (question.type === 'closest') return `${maximum} · Closest position`
  if (['anagram', 'photo-reveal', 'photo-zoom'].includes(question.type)) return `${maximum} · Earlier solve scores more`
  if (['multi', 'number', 'ordering', 'matching', 'categorise', 'list'].includes(question.type)) return `${maximum} · Partial credit available`
  return `${maximum} · Correct answer`
}

function serverOrder(response: Response): ServerOrder {
  if (response.submittedAtServer) return response.submittedAtServer
  const milliseconds = Number(response.submittedAt) || 0
  return { seconds: Math.floor(milliseconds / 1000), nanoseconds: (milliseconds % 1000) * 1_000_000 }
}

function compareResponses(a: Response, b: Response) {
  const one = serverOrder(a)
  const two = serverOrder(b)
  return one.seconds - two.seconds || one.nanoseconds - two.nanoseconds || a.playerId.localeCompare(b.playerId)
}

function sameOrder(a: Response, b: Response) {
  const one = serverOrder(a)
  const two = serverOrder(b)
  return one.seconds === two.seconds && one.nanoseconds === two.nanoseconds
}

function submittedMillis(response: Response) {
  const order = serverOrder(response)
  return order.seconds * 1000 + order.nanoseconds / 1_000_000
}

export function competitionRanks<T>(items: T[], compare: (a: T, b: T) => number, tied: (a: T, b: T) => boolean) {
  const sorted = [...items].sort(compare)
  return sorted.map((item, index) => ({ item, rank: index === 0 ? 1 : tied(item, sorted[index - 1]) ? 0 : index + 1 }))
    .map((entry, index, ranked) => ({ ...entry, rank: entry.rank || ranked[index - 1].rank }))
}

function accepted(question: Question, value: unknown) {
  const answers = Array.isArray(question.answer) ? question.answer : [question.answer]
  return answers.some(answer => answer !== undefined && normalise(String(answer)) === normalise(String(value ?? '')))
}

function verdictFor(points: number, maximum: number): GradeVerdict {
  return points >= maximum && maximum > 0 ? 'correct' : points > 0 ? 'partial' : 'incorrect'
}

function ordinal(rank: number) {
  const mod100 = rank % 100
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`
  return `${rank}${rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th'}`
}

export type RevealProgress = { progress: number; visible?: number; total?: number; hidden?: number }
export function progressiveRevealProgress(question: Question, response: Response, openedAt?: number): RevealProgress {
  const duration = Math.max(1, question.duration || 30)
  const elapsed = clamp((submittedMillis(response) - (openedAt ?? submittedMillis(response))) / 1000, 0, duration)
  if (question.type === 'anagram') {
    const answer = String(question.answer || '')
    const display = anagramDisplay(answer, question.scramble || answer, elapsed, duration)
    return { progress: display.positions.length ? display.lockedCount / display.positions.length : 1, visible: display.lockedCount, total: display.positions.length, hidden: display.positions.length - display.lockedCount }
  }
  if (question.type === 'photo-reveal') {
    const visible = Math.floor(elapsed / duration * 24)
    return { progress: visible / 24, visible, total: 24, hidden: 24 - visible }
  }
  return { progress: elapsed / duration }
}

function automaticGrade(question: Question, response: Response | undefined, openedAt?: number): Grade {
  const common = { playerId: response?.playerId || '', questionId: question.id, committed: false, source: 'automatic' as const }
  if (!response) return { ...common, points: 0, verdict: 'unanswered', detail: 'No answer submitted' }
  const maximum = roundScore(question.points)
  const value = response.value
  if (question.type === 'free') return { ...common, points: 0, verdict: 'pending', detail: 'Waiting for Host marking' }
  if (question.type === 'single' || question.type === 'boolean' || question.type === 'text') {
    const correct = question.type === 'text' ? accepted(question, value) : value === question.answer
    return { ...common, points: correct ? maximum : 0, verdict: correct ? 'correct' : 'incorrect', detail: correct ? 'Correct answer' : 'Incorrect answer' }
  }
  if (question.type === 'multi') {
    const expected = new Set((Array.isArray(question.answer) ? question.answer : []).map(item => normalise(String(item))))
    const choices = new Set((question.options || []).map(item => normalise(item)))
    const supplied = new Set((Array.isArray(value) ? value : []).map(item => normalise(String(item))).filter(Boolean))
    const correctSelections = [...supplied].filter(item => expected.has(item)).length
    const incorrectSelections = [...supplied].filter(item => choices.has(item) && !expected.has(item)).length
    const incorrectTotal = Math.max(1, [...choices].filter(item => !expected.has(item)).length)
    const accuracy = clamp(correctSelections / Math.max(1, expected.size) - incorrectSelections / incorrectTotal)
    const points = roundScore(maximum * accuracy)
    return { ...common, points, verdict: verdictFor(points, maximum), detail: `${correctSelections} of ${expected.size} correct${incorrectSelections ? ` · ${incorrectSelections} wrong selection${incorrectSelections === 1 ? '' : 's'}` : ''}`, metrics: { accuracy, correctSelections, incorrectSelections } }
  }
  if (question.type === 'number') {
    const supplied = Number(value)
    const target = Number(question.answer)
    const distance = Math.abs(supplied - target)
    const band = Number.isFinite(distance) ? normaliseNumberBands(question.numberBands?.length ? question.numberBands : [{ tolerance: question.tolerance || 0, fraction: 1 }]).find(item => distance <= item.tolerance) : undefined
    const points = band ? roundScore(maximum * band.fraction) : 0
    return { ...common, points, verdict: verdictFor(points, maximum), detail: band ? `Within ±${band.tolerance}` : 'Outside the scoring bands', metrics: { distance: Number.isFinite(distance) ? distance : -1, fraction: band?.fraction || 0 } }
  }
  if (question.type === 'ordering') {
    const expected = Array.isArray(question.answer) ? question.answer.map(String) : []
    const supplied = Array.isArray(value) ? value.map(String) : []
    let correctPairs = 0
    let totalPairs = 0
    for (let left = 0; left < expected.length; left += 1) for (let right = left + 1; right < expected.length; right += 1) {
      totalPairs += 1
      const leftIndex = supplied.indexOf(expected[left])
      const rightIndex = supplied.indexOf(expected[right])
      if (leftIndex >= 0 && rightIndex >= 0 && leftIndex < rightIndex) correctPairs += 1
    }
    const accuracy = totalPairs ? correctPairs / totalPairs : 0
    const points = roundScore(maximum * accuracy)
    return { ...common, points, verdict: verdictFor(points, maximum), detail: `${correctPairs} of ${totalPairs} order relationships correct`, metrics: { accuracy, correctPairs, totalPairs } }
  }
  if (question.type === 'matching' || question.type === 'categorise') {
    const expected = question.answer && typeof question.answer === 'object' && !Array.isArray(question.answer) ? question.answer as Record<string, string> : {}
    const supplied = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {}
    const keys = Object.keys(expected)
    const correctItems = keys.filter(key => supplied[key] === expected[key]).length
    const accuracy = keys.length ? correctItems / keys.length : 0
    const points = roundScore(maximum * accuracy)
    const detail = question.type === 'matching' ? `${correctItems} of ${keys.length} matched` : `${correctItems} of ${keys.length} correctly sorted`
    return { ...common, points, verdict: verdictFor(points, maximum), detail, metrics: { accuracy, correctItems, totalItems: keys.length } }
  }
  if (question.type === 'list') {
    const expected = [...new Set((Array.isArray(question.answer) ? question.answer : []).map(item => normalise(String(item))).filter(Boolean))]
    const supplied = new Set((Array.isArray(value) ? value : []).map(item => normalise(String(item))).filter(Boolean))
    const found = expected.filter(item => supplied.has(item)).length
    const accuracy = expected.length ? found / expected.length : 0
    const points = roundScore(maximum * accuracy)
    return { ...common, points, verdict: verdictFor(points, maximum), detail: `${found} of ${expected.length} answers found`, metrics: { accuracy, found, totalAnswers: expected.length } }
  }
  if (question.type === 'anagram' || question.type === 'photo-reveal' || question.type === 'photo-zoom') {
    const correct = accepted(question, value)
    if (!correct) return { ...common, points: 0, verdict: 'incorrect', detail: 'Incorrect answer' }
    const reveal = progressiveRevealProgress(question, response, openedAt)
    const fraction = 1 - 0.8 * reveal.progress
    const points = roundScore(maximum * fraction)
    const detail = question.type === 'anagram'
      ? `Solved with ${reveal.hidden || 0} letters still hidden`
      : `Solved at ${Math.round(reveal.progress * 100)}% revealed`
    return { ...common, points, verdict: 'correct', detail, metrics: { revealProgress: reveal.progress, scoreFraction: fraction } }
  }
  return { ...common, points: 0, verdict: 'incorrect', detail: 'Incorrect answer' }
}

export type ScoringContext = { openedAt?: number; existingGrades?: Grade[] }
export function scoreQuestion(questionInput: Question, responses: Response[], eligiblePlayers: Player[] | string[], context: ScoringContext = {}): Grade[] {
  const question = normaliseQuestion(questionInput)
  const eligibleIds = eligiblePlayers.map(player => typeof player === 'string' ? player : player.id)
  const relevant = responses.filter(response => response.questionId === question.id && eligibleIds.includes(response.playerId))
  const responseByPlayer = new Map(relevant.map(response => [response.playerId, response]))
  const existingByPlayer = new Map((context.existingGrades || []).filter(grade => grade.questionId === question.id && ['manual', 'override'].includes(grade.source)).map(grade => [grade.playerId, grade]))
  const grades = eligibleIds.map(playerId => {
    const existing = existingByPlayer.get(playerId)
    if (existing) return { ...existing, committed: false }
    const grade = automaticGrade(question, responseByPlayer.get(playerId), context.openedAt)
    return { ...grade, playerId }
  })

  if (question.type === 'closest') {
    const target = Number(question.answer)
    const valid = relevant.map(response => ({ response, distance: Math.abs(Number(response.value) - target) })).filter(item => Number.isFinite(item.distance))
    const ranked = competitionRanks(valid, (a, b) => a.distance - b.distance || compareResponses(a.response, b.response), (a, b) => a.distance === b.distance)
    for (const { item, rank } of ranked) {
      const points = roundScore(question.points * ((valid.length - rank + 1) / valid.length))
      const index = grades.findIndex(grade => grade.playerId === item.response.playerId)
      grades[index] = { ...grades[index], points, verdict: rank === 1 ? 'correct' : 'partial', rank, rankTotal: valid.length, detail: `${ordinal(rank)} closest`, metrics: { distance: item.distance }, source: 'automatic' }
    }
    return grades
  }

  if (question.placementMode === 'fastest-correct') {
    const correctResponses = relevant.filter(response => grades.find(grade => grade.playerId === response.playerId)?.verdict === 'correct')
    const ranked = competitionRanks(correctResponses, compareResponses, sameOrder)
    for (const { item, rank } of ranked) {
      const count = correctResponses.length
      const position = count === 1 ? 1 : 1 - ((rank - 1) / (count - 1))
      const fraction = count === 1 ? 1 : 0.7 + 0.3 * position * position
      const index = grades.findIndex(grade => grade.playerId === item.playerId)
      grades[index] = { ...grades[index], points: roundScore(question.points * fraction), rank, rankTotal: count, detail: `${ordinal(rank)} fastest correct`, metrics: { scoreFraction: fraction } }
    }
  }
  return grades
}
