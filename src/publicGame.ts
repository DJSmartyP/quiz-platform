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
      placementMode: question.placementMode,
      numberBands: question.numberBands,
      duration: question.duration || 30,
      prompt: showQuestion && question.id === active?.id ? question.prompt : '',
      options: showQuestion && question.id === active?.id ? question.options : undefined,
      items: showQuestion && question.id === active?.id ? question.items : undefined,
      categories: showQuestion && question.id === active?.id ? question.categories : undefined,
      scramble: showQuestion && question.id === active?.id ? question.scramble : undefined,
      // The presentation needs the target string to animate anagrams into place.
      // It remains separate from the general answer field and is exposed only
      // for the active anagram whose solution is visibly revealed over time.
      anagramSolution: showQuestion && question.id === active?.id && question.type === 'anagram' ? String(question.answer || '') : undefined,
      imageUrl: showQuestion && question.id === active?.id ? question.imageUrl : undefined,
      imageAlt: showQuestion && question.id === active?.id ? question.imageAlt : undefined,
      answer: releasedAnswer && question.id === active?.id ? question.answer : undefined,
      explanation: releasedAnswer && question.id === active?.id ? question.explanation : undefined,
    })),
    responses: [],
    grades: source.grades.filter(grade => grade.committed),
  }
}
