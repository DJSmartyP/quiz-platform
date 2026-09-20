import { currentQuestion, type Game } from './model.ts'

/** Data safe for the presentation screen and every Player before/after reveal. */
export function publicGame(source: Game): Game {
  const active = currentQuestion(source)
  const showQuestion = ['question', 'open', 'closed', 'reveal'].includes(source.phase)
  const releasedAnswer = source.phase === 'reveal'
  return {
    ...source,
    questions: source.questions.map(question => ({
      id: question.id,
      type: question.type,
      round: question.round,
      points: question.points,
      duration: question.duration || 30,
      prompt: showQuestion && question.id === active?.id ? question.prompt : '',
      options: showQuestion && question.id === active?.id ? question.options : undefined,
      items: showQuestion && question.id === active?.id ? question.items : undefined,
      categories: showQuestion && question.id === active?.id ? question.categories : undefined,
      scramble: showQuestion && question.id === active?.id ? question.scramble : undefined,
      answer: releasedAnswer && question.id === active?.id ? question.answer : undefined,
      explanation: releasedAnswer && question.id === active?.id ? question.explanation : undefined,
    })),
    responses: [],
    grades: source.grades.filter(grade => grade.committed),
  }
}
