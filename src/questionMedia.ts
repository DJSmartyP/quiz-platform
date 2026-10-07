import type { Phase, Question } from './model.ts'

export function presentationImage(question: Question, phase: Phase) {
  return phase === 'reveal' && question.answerImageUrl
    ? { url: question.answerImageUrl, alt: question.answerImageAlt || '' }
    : { url: question.imageUrl, alt: question.imageAlt || '' }
}

export function questionMediaSize(question: Question): number {
  return (question.imageUrl?.length || 0) + (question.answerImageUrl?.length || 0)
}
