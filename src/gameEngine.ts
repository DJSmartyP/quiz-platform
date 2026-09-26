import { currentQuestion, isLastQuestionInRound, type Game } from './model.ts'
import { scoreQuestion } from './scoring.ts'

/** One deterministic Host transition. A Firestore transaction checks the expected version first. */
export function advanceGame(previous: Game): Game {
  const next = structuredClone(previous)
  const phase = previous.phase
  if (phase === 'lobby') next.phase = 'round-intro'
  else if (phase === 'round-intro') next.phase = 'question'
  else if (phase === 'question') {
    next.phase = 'open'
    next.openedAt = Date.now()
    next.closesAt = next.openedAt + (next.questions[next.questionIndex].duration || 30) * 1000
    next.closedAt = undefined
    next.questionEligiblePlayerIds = next.players.map(player => player.id)
  } else if (phase === 'open') { next.phase = 'closed'; next.closedAt = Date.now() }
  else if (phase === 'closed') {
    const question = currentQuestion(next)
    const eligible = next.questionEligiblePlayerIds || next.players.map(player => player.id)
    const otherGrades = next.grades.filter(grade => grade.questionId !== question.id)
    const currentGrades = next.grades.filter(grade => grade.questionId === question.id)
    next.grades = [...otherGrades, ...scoreQuestion(question, next.responses, eligible, { openedAt: next.openedAt, existingGrades: currentGrades })]
    next.phase = 'reveal'
  }
  else if (phase === 'reveal') {
    const q = currentQuestion(next)
    for (const grade of next.grades.filter(item => item.questionId === q.id)) {
      if (grade.committed || grade.verdict === 'pending') continue
      grade.committed = true
      const player = next.players.find(item => item.id === grade.playerId)
      if (player) player.score += grade.points
    }
    next.phase = isLastQuestionInRound(next) ? 'round-scores' : 'scores'
  } else if (phase === 'scores') {
    if (isLastQuestionInRound(next)) next.phase = 'round-scores'
    else { next.questionIndex += 1; next.phase = 'question' }
  } else if (phase === 'round-scores') next.phase = 'leaderboard'
  else if (phase === 'leaderboard') {
    if (next.questionIndex === next.questions.length - 1) next.phase = 'final'
    else { next.questionIndex += 1; next.phase = 'round-intro' }
  } else if (phase === 'final') next.phase = 'thanks'
  else if (phase === 'thanks') next.phase = 'closed-game'
  else return previous
  next.stateVersion += 1
  return next
}

export function breakGame(previous: Game): Game {
  if (!['scores', 'round-scores', 'leaderboard', 'round-intro'].includes(previous.phase)) return previous
  return { ...previous, returnPhase: previous.phase, phase: 'break', stateVersion: previous.stateVersion + 1 }
}

export function resumeGame(previous: Game): Game {
  if (previous.phase !== 'break') return previous
  const next = { ...previous, phase: previous.returnPhase || 'scores', stateVersion: previous.stateVersion + 1 }
  delete next.returnPhase
  return next
}
