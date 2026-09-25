import { currentQuestion, isLastQuestionInRound, scoreAnswer, timeScaledPoints, type Game } from './model.ts'

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
  } else if (phase === 'open') { next.phase = 'closed'; next.closedAt = Date.now() }
  else if (phase === 'closed') next.phase = 'reveal'
  else if (phase === 'reveal') {
    const q = currentQuestion(next)
    const numeric = next.responses.filter(r => r.questionId === q.id && Number.isFinite(Number(r.value)))
    const closestDistance = q.type === 'closest' && numeric.length
      ? Math.min(...numeric.map(r => Math.abs(Number(r.value) - Number(q.answer)))) : Infinity
    for (const player of next.players) {
      const existing = next.grades.find(g => g.playerId === player.id && g.questionId === q.id)
      if (existing?.committed) continue
      const response = next.responses.find(r => r.playerId === player.id && r.questionId === q.id)
      let points = existing?.points ?? (response ? scoreAnswer(q, response.value, (response.submittedAt - (next.openedAt || response.submittedAt)) / 1000) : 0)
      if (q.type === 'closest') points = response && Math.abs(Number(response.value) - Number(q.answer)) === closestDistance
        ? timeScaledPoints(q, q.points, (response.submittedAt - (next.openedAt || response.submittedAt)) / 1000) : 0
      if (existing) { existing.points = points; existing.committed = true }
      else next.grades.push({ playerId: player.id, questionId: q.id, points, committed: true })
      player.score += points
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
