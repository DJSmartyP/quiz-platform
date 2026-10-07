import type { Question } from './model'

export function roundNames(questions: Question[]) {
  return [...new Set(questions.map(question => question.round))]
}

export function groupQuestionsByRound(questions: Question[]) {
  const names = roundNames(questions)
  return names.flatMap(round => questions.filter(question => question.round === round))
}

export function insertInRound(questions: Question[], question: Question) {
  const last = questions.map(item => item.round).lastIndexOf(question.round)
  const index = last < 0 ? questions.length : last + 1
  const next = [...questions]
  next.splice(index, 0, question)
  return { questions: next, index }
}

export function moveToRound(questions: Question[], questionId: string, targetRound: string) {
  const source = questions.find(item => item.id === questionId)
  if (!source) throw new Error('Question not found.')
  const without = questions.filter(item => item.id !== questionId)
  return insertInRound(without, { ...source, round: targetRound })
}
