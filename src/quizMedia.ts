import type { Game } from './model'

export const quizMediaPrefix = 'quiz-media:'

export function quizMediaRef(ownerUid: string, mediaId: string) {
  return `${quizMediaPrefix}${ownerUid}/${mediaId}`
}

export function parseQuizMediaRef(value?: string) {
  if (!value?.startsWith(quizMediaPrefix)) return null
  const parts = value.slice(quizMediaPrefix.length).split('/')
  if (parts.length !== 2 || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return null
  return { ownerUid: parts[0], mediaId: parts[1] }
}

/** Apply media to the Main Screen only after publicGame released its references. */
export function withPublishedMedia(game: Game, media: { questionId: string; imageUrl?: string; answerImageUrl?: string } | null) {
  const active = game.questions[game.questionIndex]
  if (!active) return game
  const resolved = { ...active }
  for (const key of ['imageUrl', 'answerImageUrl'] as const) {
    const parsed = parseQuizMediaRef(resolved[key])
    if (parsed) resolved[key] = media?.questionId === active.id ? media[key] : undefined
  }
  return { ...game, questions: game.questions.map((question, index) => index === game.questionIndex ? resolved : question) }
}
