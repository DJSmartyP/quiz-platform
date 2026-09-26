import { type Game, type Grade, type GradeVerdict, type Question, type Response } from './model.ts'
import { scoreQuestion } from './scoring.ts'

export type Verdict = GradeVerdict
export type OwnResult = Pick<Grade, 'points' | 'verdict' | 'detail' | 'rank' | 'rankTotal' | 'metrics' | 'source'>

export function answerLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'No answer submitted'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (Array.isArray(value)) return value.map(answerLabel).join(' · ')
  if (typeof value === 'object') return Object.entries(value).map(([key, answer]) => `${key} → ${answerLabel(answer)}`).join(' · ')
  return String(value)
}

export function resultForGrade(grade: Grade): OwnResult {
  const { points, verdict, detail, rank, rankTotal, metrics, source } = grade
  return { points, verdict, detail, rank, rankTotal, metrics, source }
}

/** Compatibility helper for local previews. Live results always use the authoritative stored Grade. */
export function resultForAnswer(question: Question, response: Response | undefined, grade: Grade | undefined, responses: Response[], openedAt?: number): OwnResult {
  if (grade) return resultForGrade(grade)
  const playerId = response?.playerId || '__unanswered__'
  const relevant = response && !responses.some(item => item.playerId === response.playerId && item.questionId === response.questionId) ? [...responses, response] : responses
  const eligible = [...new Set([...relevant.map(item => item.playerId), playerId])]
  const calculated = scoreQuestion(question, relevant, eligible, { openedAt }).find(item => item.playerId === playerId)!
  return resultForGrade(calculated)
}

export function ownResultForGame(game: Game, playerId: string): OwnResult {
  const question = game.questions[game.questionIndex]
  const grade = game.grades.find(item => item.playerId === playerId && item.questionId === question.id)
  if (grade) return resultForGrade(grade)
  return resultForAnswer(
    question,
    game.responses.find(response => response.playerId === playerId && response.questionId === question.id),
    undefined,
    game.responses,
    game.openedAt,
  )
}
