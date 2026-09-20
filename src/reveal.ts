import { normalise, scoreAnswer, type Game, type Grade, type Question, type Response } from './model.ts'

export type Verdict = 'correct' | 'partial' | 'incorrect' | 'pending'
export type OwnResult = { points: number; verdict: Verdict }

export function answerLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'No answer submitted'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (Array.isArray(value)) return value.map(answerLabel).join(' · ')
  if (typeof value === 'object') return Object.entries(value).map(([key, answer]) => `${key} → ${answerLabel(answer)}`).join(' · ')
  return String(value)
}

export function resultForAnswer(question: Question, response: Response | undefined, grade: Grade | undefined, responses: Response[], openedAt?: number): OwnResult {
  if (!response) return { points: 0, verdict: 'incorrect' }
  if (question.type === 'free' && !grade) return { points: 0, verdict: 'pending' }
  let points = grade?.points ?? scoreAnswer(question, response.value, Math.max(0, (response.submittedAt - (openedAt || response.submittedAt)) / 1000))
  if (question.type === 'closest' && !grade) {
    const distances = responses.filter(item => item.questionId === question.id && item.value !== '').map(item => Math.abs(Number(item.value) - Number(question.answer))).filter(Number.isFinite)
    points = distances.length && Math.abs(Number(response.value) - Number(question.answer)) === Math.min(...distances) ? question.points : 0
  }
  const solvedAnagram = question.type === 'anagram' && normalise(String(response.value)) === normalise(String(question.answer))
  return { points, verdict: solvedAnagram || points >= question.points ? 'correct' : points > 0 ? 'partial' : 'incorrect' }
}

export function ownResultForGame(game: Game, playerId: string): OwnResult {
  const question = game.questions[game.questionIndex]
  return resultForAnswer(
    question,
    game.responses.find(response => response.playerId === playerId && response.questionId === question.id),
    game.grades.find(grade => grade.playerId === playerId && grade.questionId === question.id),
    game.responses,
    game.openedAt,
  )
}
