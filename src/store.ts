import { useSyncExternalStore } from 'react'
import { currentQuestion, freshGame, gradeFor, normalise, ranked, responseFor, scoreAnswer, type Game, type Phase } from './model'

const key = 'quiz-platform-demo-v1'
let game: Game = (() => {
  try { return JSON.parse(localStorage.getItem(key) || '') as Game } catch { return freshGame() }
})()
const listeners = new Set<() => void>()
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(key) : null

function notify() { listeners.forEach(listener => listener()) }
function save(next: Game) {
  game = next
  localStorage.setItem(key, JSON.stringify(next))
  channel?.postMessage(next)
  notify()
}
channel?.addEventListener('message', event => { game = event.data as Game; notify() })
window.addEventListener('storage', event => { if (event.key === key && event.newValue) { game = JSON.parse(event.newValue) as Game; notify() } })

export function useGame() { return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => game) }
export function getGame() { return game }
export function update(fn: (draft: Game) => void) {
  const draft = structuredClone(game)
  fn(draft)
  draft.stateVersion += 1
  save(draft)
}
export function resetGame() { save(freshGame()) }
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
  if (!q || game.phase !== 'open') throw new Error('Answers are closed.')
  const existing = responseFor(game, playerId, q.id)
  if (existing && q.type !== 'anagram') throw new Error('Your answer is already locked in.')
  if (existing && q.type === 'anagram' && gradeFor(game, playerId, q.id)?.points) throw new Error('You already solved this anagram.')
  update(d => {
    d.responses = d.responses.filter(r => !(r.playerId === playerId && r.questionId === q.id))
    d.responses.push({ playerId, questionId: q.id, value, submittedAt: Date.now() })
    if (q.type === 'anagram') {
      const seconds = (Date.now() - (d.openedAt || Date.now())) / 1000
      const points = scoreAnswer(q, value, seconds)
      if (points > 0) d.grades.push({ playerId, questionId: q.id, points, committed: false })
    }
  })
}
export function setGrade(playerId: string, points: number) {
  const q = currentQuestion(game)
  update(d => {
    d.grades = d.grades.filter(g => !(g.playerId === playerId && g.questionId === q.id))
    d.grades.push({ playerId, questionId: q.id, points: Math.max(0, Math.round(points)), committed: false })
  })
}
export function finaliseQuestion() {
  const q = currentQuestion(game)
  if (!q || game.phase !== 'reveal') return
  update(d => {
    const numeric = d.responses.filter(r => r.questionId === q.id && Number.isFinite(Number(r.value)))
    const closestDistance = q.type === 'closest' && numeric.length
      ? Math.min(...numeric.map(r => Math.abs(Number(r.value) - Number(q.answer)))) : Infinity
    for (const player of d.players) {
      const existing = d.grades.find(g => g.playerId === player.id && g.questionId === q.id)
      if (existing?.committed) continue
      const response = d.responses.find(r => r.playerId === player.id && r.questionId === q.id)
      let points = existing?.points ?? (response ? scoreAnswer(q, response.value, (response.submittedAt - (d.openedAt || response.submittedAt)) / 1000) : 0)
      if (q.type === 'closest') points = response && Math.abs(Number(response.value) - Number(q.answer)) === closestDistance ? q.points : 0
      if (existing) { existing.points = points; existing.committed = true }
      else d.grades.push({ playerId: player.id, questionId: q.id, points, committed: true })
      player.score += points
    }
    d.phase = 'scores'
  })
}
export function hostAction() {
  const phase = game.phase
  if (phase === 'reveal') return finaliseQuestion()
  update(d => {
    if (phase === 'lobby') d.phase = 'round-intro'
    else if (phase === 'round-intro') d.phase = 'question'
    else if (phase === 'question') { d.phase = 'open'; d.openedAt = Date.now() }
    else if (phase === 'open') d.phase = 'closed'
    else if (phase === 'closed') d.phase = 'reveal'
    else if (phase === 'scores') {
      if (d.questionIndex === d.questions.length - 1) d.phase = 'final'
      else {
        const round = d.questions[d.questionIndex].round
        d.questionIndex += 1
        d.phase = d.questions[d.questionIndex].round === round ? 'question' : 'round-intro'
      }
    } else if (phase === 'final') d.phase = 'thanks'
    else if (phase === 'thanks') d.phase = 'closed-game'
  })
}
export function takeBreak() {
  if (!['scores', 'round-intro'].includes(game.phase)) return
  update(d => { d.returnPhase = d.phase; d.phase = 'break' })
}
export function resumeBreak() { if (game.phase === 'break') update(d => { d.phase = d.returnPhase || 'scores'; d.returnPhase = undefined }) }
export function voidQuestion() {
  const q = currentQuestion(game)
  update(d => {
    for (const player of d.players) {
      const existing = d.grades.find(g => g.playerId === player.id && g.questionId === q.id)
      if (existing?.committed) player.score -= existing.points
    }
    d.grades = d.grades.filter(g => g.questionId !== q.id)
    d.phase = 'scores'
  })
}
export function overrideScore(playerId: string, newTotal: number) {
  update(d => { const p = d.players.find(p => p.id === playerId); if (p) p.score = Math.max(0, Math.round(newTotal)) })
}
export function publicRanks() { return ranked(game.players) }
export function actionLabel(phase: Phase): string {
  return ({ lobby: 'Start quiz', 'round-intro': 'Show first question', question: 'Open answers', open: 'Close answers',
    closed: 'Reveal answer', reveal: 'Finalise scores', scores: 'Continue', final: 'Thanks for playing',
    thanks: 'Close session', break: 'Resume quiz', 'closed-game': 'Session closed' } as Record<Phase, string>)[phase]
}
