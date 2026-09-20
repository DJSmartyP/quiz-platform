import { useSyncExternalStore } from 'react'
import { currentQuestion, freshGame, gradeFor, isLastQuestionInRound, normalise, ranked, responseFor, scoreAnswer, scrambleWord, type Game, type Phase } from './model'
import { advanceGame, breakGame, resumeGame } from './gameEngine'

const key = 'quiz-platform-demo-v1'
let game: Game = (() => {
  try {
    const loaded = JSON.parse(localStorage.getItem(key) || '') as Game
    loaded.questions = loaded.questions.map(q => q.type === 'anagram' && !q.scramble ? { ...q, scramble: scrambleWord(String(q.answer)) } : q)
    if (loaded.phase === 'open' && loaded.openedAt && !loaded.closesAt) loaded.closesAt = loaded.openedAt + (loaded.questions[loaded.questionIndex].duration || 30) * 1000
    if (loaded.phase === 'scores' && isLastQuestionInRound(loaded)) loaded.phase = 'round-scores'
    localStorage.setItem(key, JSON.stringify(loaded))
    return loaded
  } catch { return freshGame() }
})()
const listeners = new Set<() => void>()
let liveRole: 'host' | 'player' | 'screen' | null = null
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(key) : null

function notify() { listeners.forEach(listener => listener()) }
function save(next: Game) {
  game = next
  localStorage.setItem(key, JSON.stringify(next))
  channel?.postMessage(next)
  notify()
}
channel?.addEventListener('message', event => { if (!liveRole) { game = event.data as Game; notify() } })
window.addEventListener('storage', event => { if (!liveRole && event.key === key && event.newValue) { game = JSON.parse(event.newValue) as Game; notify() } })

export function useGame() { return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => game) }
export function getGame() { return game }
export function getLiveRole() { return liveRole }
export function receiveLiveGame(next: Game, role: 'host' | 'player' | 'screen') {
  const ownId = role === 'player' ? sessionStorage.getItem('quiz-demo-player-id') : null
  const ownResponses = ownId && liveRole === 'player' ? game.responses.filter(r => r.playerId === ownId && r.questionId === next.questions[next.questionIndex]?.id) : []
  const ownPlayer = ownId && liveRole === 'player' ? game.players.find(p => p.id === ownId) : undefined
  liveRole = role
  game = { ...next,
    players: ownPlayer && !next.players.some(p => p.id === ownPlayer.id) ? [...next.players, ownPlayer] : next.players,
    responses: role === 'player' ? ownResponses : next.responses,
  }
  notify()
}
export function receiveOwnLiveResponse(response: Game['responses'][number] | null) {
  if (liveRole !== 'player') return
  game = { ...game, responses: response ? [response] : [] }
  notify()
}
export function update(fn: (draft: Game) => void) {
  if (liveRole) throw new Error('Use the Host controls for a live game.')
  const draft = structuredClone(game)
  fn(draft)
  draft.stateVersion += 1
  save(draft)
}
export function resetGame() { if (liveRole) throw new Error('A live game cannot be reset as a local demo.'); save(freshGame()) }
export function jumpToQuestion(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= game.questions.length) return
  update(d => {
    const questionId = d.questions[index].id
    for (const grade of d.grades.filter(g => g.questionId === questionId && g.committed)) {
      const player = d.players.find(p => p.id === grade.playerId)
      if (player) player.score = Math.max(0, player.score - grade.points)
    }
    d.responses = d.responses.filter(r => r.questionId !== questionId)
    d.grades = d.grades.filter(g => g.questionId !== questionId)
    d.questionIndex = index
    d.phase = 'question'
    d.openedAt = undefined
    d.closesAt = undefined
    d.closedAt = undefined
  })
}
export function joinGame(name: string, avatarId: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length > 24) throw new Error('Choose a name of 1–24 characters.')
  if (game.players.length >= 50) throw new Error('Game full — the 50-player limit has been reached.')
  if (!game.allowLateJoins && game.phase !== 'lobby') throw new Error('This game has already started.')
  if (game.players.some(p => normalise(p.name) === normalise(trimmed))) throw new Error('That name is already in use.')
  const id = crypto.randomUUID()
  update(d => { d.players.push({ id, name: trimmed, avatarId, score: 0 }) })
  sessionStorage.setItem('quiz-demo-player-id', id)
  return id
}
export function submitAnswer(playerId: string, value: unknown) {
  const q = currentQuestion(game)
  if (!q || game.phase !== 'open' || (game.closesAt && Date.now() >= game.closesAt)) throw new Error('Answers are closed.')
  const existing = responseFor(game, playerId, q.id)
  if (existing && q.type !== 'anagram') throw new Error('Your answer is already locked in.')
  if (existing && q.type === 'anagram' && gradeFor(game, playerId, q.id)?.points) throw new Error('You already solved this anagram.')
  if (existing && q.type === 'anagram' && Date.now() - existing.submittedAt < 1000) throw new Error('Wait a moment before guessing again.')
  const seconds = (Date.now() - (game.openedAt || Date.now())) / 1000
  const anagramPoints = q.type === 'anagram' ? scoreAnswer(q, value, seconds) : 0
  update(d => {
    d.responses = d.responses.filter(r => !(r.playerId === playerId && r.questionId === q.id))
    d.responses.push({ playerId, questionId: q.id, value, submittedAt: Date.now() })
    if (anagramPoints > 0) d.grades.push({ playerId, questionId: q.id, points: anagramPoints, committed: false })
  })
  return q.type === 'anagram' ? anagramPoints > 0 : undefined
}
export function expireAnswers() {
  if (liveRole) return // Live expiry is a versioned Host transition, never a Player timer write.
  if (game.phase !== 'open' || !game.closesAt || Date.now() < game.closesAt) return
  update(d => { if (d.phase === 'open' && d.closesAt && Date.now() >= d.closesAt) { d.phase = 'closed'; d.closedAt = d.closesAt } })
}
export function setGrade(playerId: string, points: number) {
  const q = currentQuestion(game)
  update(d => {
    d.grades = d.grades.filter(g => !(g.playerId === playerId && g.questionId === q.id))
    d.grades.push({ playerId, questionId: q.id, points: Math.max(0, Math.round(points)), committed: false })
  })
}
export function finaliseQuestion(expectedVersion = game.stateVersion) {
  if (game.stateVersion === expectedVersion && game.phase === 'reveal') save(advanceGame(game))
}
export function hostAction(expectedVersion = game.stateVersion) {
  if (game.stateVersion !== expectedVersion) return
  const next = advanceGame(game)
  if (next !== game) save(next)
}
export function takeBreak(expectedVersion = game.stateVersion) {
  if (game.stateVersion !== expectedVersion) return
  const next = breakGame(game)
  if (next !== game) save(next)
}
export function resumeBreak(expectedVersion = game.stateVersion) { if (game.stateVersion === expectedVersion) { const next = resumeGame(game); if (next !== game) save(next) } }
export function voidQuestion() {
  const q = currentQuestion(game)
  update(d => {
    for (const player of d.players) {
      const existing = d.grades.find(g => g.playerId === player.id && g.questionId === q.id)
      if (existing?.committed) player.score -= existing.points
    }
    d.grades = d.grades.filter(g => g.questionId !== q.id)
    d.phase = isLastQuestionInRound(d) ? 'round-scores' : 'scores'
  })
}
export function overrideScore(playerId: string, newTotal: number) {
  update(d => { const p = d.players.find(p => p.id === playerId); if (p) p.score = Math.max(0, Math.round(newTotal)) })
}
export function publicRanks() { return ranked(game.players) }
export function actionLabel(phase: Phase): string {
  return ({ lobby: 'Start quiz', 'round-intro': 'Show first question', question: 'Open answers', open: 'Close answers',
    closed: 'Reveal answer', reveal: 'Finalise scores', scores: 'Next question', 'round-scores': 'Show leaderboard', leaderboard: 'Continue', final: 'Thanks for playing',
    thanks: 'Close session', break: 'Resume quiz', 'closed-game': 'Session closed' } as Record<Phase, string>)[phase]
}
