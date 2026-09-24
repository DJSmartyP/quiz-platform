import { useSyncExternalStore } from 'react'
import { currentQuestion, freshGame, gradeFor, isLastQuestionInRound, normalise, ranked, responseFor, scoreAnswer, scrambleWord, type Game, type Phase, type Question, type QuizTheme } from './model'
import { advanceGame, breakGame, resumeGame } from './gameEngine'

const key = 'quiz-platform-demo-v1'
const libraryKey = 'quiz-platform-library-v1'
const activeQuizKey = 'quiz-platform-active-quiz-v1'
let workspaceScope: string | null = null
const scopedKey = (base: string) => workspaceScope ? `${base}:${workspaceScope}` : base
let game: Game = (() => {
  try {
    const loaded = JSON.parse(localStorage.getItem(key) || '') as Game
    loaded.theme = loaded.theme || 'quiz-show'
    loaded.questions = loaded.questions.map(q => q.type === 'anagram' && !q.scramble ? { ...q, scramble: scrambleWord(String(q.answer)) } : q)
    if (loaded.phase === 'open' && loaded.openedAt && !loaded.closesAt) loaded.closesAt = loaded.openedAt + (loaded.questions[loaded.questionIndex].duration || 30) * 1000
    if (loaded.phase === 'scores' && isLastQuestionInRound(loaded)) loaded.phase = 'round-scores'
    localStorage.setItem(key, JSON.stringify(loaded))
    return loaded
  } catch { return freshGame() }
})()
export type QuizTemplate = { id: string; title: string; theme: QuizTheme; questions: Question[]; builtIn?: boolean; updatedAt: number }
let quizLibrary: QuizTemplate[] = (() => {
  try {
    const loaded = JSON.parse(localStorage.getItem(libraryKey) || '') as QuizTemplate[]
    if (Array.isArray(loaded) && loaded.length) return loaded.map(quiz => ({ ...quiz, theme: quiz.theme || 'quiz-show' }))
  } catch { /* Migrate the existing single quiz below. */ }
  return [{ id: 'quizforge-test', title: game.title, theme: game.theme, questions: structuredClone(game.questions), builtIn: true, updatedAt: Date.now() }]
})()
const canonicalTest = freshGame()
const storedTest = quizLibrary.find(item => item.id === 'quizforge-test')
const testTemplate: QuizTemplate = { id: 'quizforge-test', title: canonicalTest.title, theme: storedTest?.theme || canonicalTest.theme, questions: structuredClone(canonicalTest.questions), builtIn: true, updatedAt: storedTest?.updatedAt || Date.now() }
quizLibrary = [testTemplate, ...quizLibrary.filter(item => item.id !== 'quizforge-test')]
let activeQuizId = localStorage.getItem(activeQuizKey) || quizLibrary[0].id
if (!quizLibrary.some(quiz => quiz.id === activeQuizId)) activeQuizId = quizLibrary[0].id
if (activeQuizId === 'quizforge-test') game = { ...canonicalTest, theme: testTemplate.theme, code: game.code }
let librarySnapshot = { quizzes: quizLibrary, activeQuizId }
localStorage.setItem(libraryKey, JSON.stringify(quizLibrary))
localStorage.setItem(activeQuizKey, activeQuizId)
const listeners = new Set<() => void>()
let liveRole: 'host' | 'player' | 'screen' | null = null
let channel: BroadcastChannel | null = null

function bindChannel() {
  channel?.close()
  channel = 'BroadcastChannel' in window ? new BroadcastChannel(scopedKey(key)) : null
  channel?.addEventListener('message', event => { if (!liveRole) { game = event.data as Game; notify() } })
}
bindChannel()

function notify() { listeners.forEach(listener => listener()) }
function persistLibrary() {
  librarySnapshot = { quizzes: quizLibrary, activeQuizId }
  localStorage.setItem(scopedKey(activeQuizKey), activeQuizId)
  localStorage.setItem(scopedKey(libraryKey), JSON.stringify(quizLibrary))
}
function clearLiveCode() {
  if (workspaceScope) localStorage.removeItem(`quiz-live-host-code:${workspaceScope}`)
  else localStorage.removeItem('quiz-live-host-code')
}
function syncActiveQuiz(next: Game) {
  const index = quizLibrary.findIndex(quiz => quiz.id === activeQuizId)
  if (index < 0) return
  const current = quizLibrary[index]
  if (current.title === next.title && current.theme === next.theme && JSON.stringify(current.questions) === JSON.stringify(next.questions)) return
  quizLibrary = quizLibrary.map((quiz, quizIndex) => quizIndex === index ? { ...quiz, title: next.title, theme: next.theme, questions: structuredClone(next.questions), updatedAt: Date.now() } : quiz)
  persistLibrary()
  // An edited quiz must start a new live session. Reusing the previous code
  // would reconnect the Host to the old Firestore copy instead of these edits.
  clearLiveCode()
}
function save(next: Game) {
  game = next
  syncActiveQuiz(next)
  localStorage.setItem(scopedKey(key), JSON.stringify(next))
  channel?.postMessage(next)
  notify()
}
window.addEventListener('storage', event => { if (!liveRole && event.key === scopedKey(key) && event.newValue) { game = JSON.parse(event.newValue) as Game; notify() } })
window.addEventListener('storage', event => {
  if (event.key !== scopedKey(libraryKey) || !event.newValue) return
  try { quizLibrary = JSON.parse(event.newValue) as QuizTemplate[]; activeQuizId = localStorage.getItem(scopedKey(activeQuizKey)) || quizLibrary[0]?.id; librarySnapshot = { quizzes: quizLibrary, activeQuizId }; notify() } catch { /* Ignore incomplete cross-tab writes. */ }
})

/** Switch the browser workspace to the signed-in Host before protected routes render. */
export function scopeQuizWorkspace(uid: string, migrateLegacy = false) {
  if (workspaceScope === uid) return
  const previousLibrary = structuredClone(quizLibrary)
  const previousGame = structuredClone(game)
  workspaceScope = uid
  let scopedLibrary: QuizTemplate[] = []
  try {
    const raw = localStorage.getItem(scopedKey(libraryKey))
    if (raw) scopedLibrary = JSON.parse(raw) as QuizTemplate[]
  } catch { /* A damaged local cache is replaced by the starter pack. */ }
  if (!scopedLibrary.length && migrateLegacy) scopedLibrary = previousLibrary
  const storedStarter = scopedLibrary.find(item => item.id === testTemplate.id)
  const starter = { ...testTemplate, theme: storedStarter?.theme || testTemplate.theme, updatedAt: storedStarter?.updatedAt || testTemplate.updatedAt }
  quizLibrary = [starter, ...scopedLibrary.filter(item => item.id !== starter.id).map(item => ({ ...item, theme: item.theme || 'quiz-show' }))]
  activeQuizId = localStorage.getItem(scopedKey(activeQuizKey)) || (migrateLegacy ? activeQuizId : starter.id)
  if (!quizLibrary.some(item => item.id === activeQuizId)) activeQuizId = starter.id
  try {
    const storedGame = localStorage.getItem(scopedKey(key))
    game = storedGame ? JSON.parse(storedGame) as Game : migrateLegacy && activeQuizId !== starter.id ? previousGame : gameFromQuiz(quizLibrary.find(item => item.id === activeQuizId) || starter)
  } catch { game = gameFromQuiz(quizLibrary.find(item => item.id === activeQuizId) || starter) }
  liveRole = null
  bindChannel()
  persistLibrary()
  localStorage.setItem(scopedKey(key), JSON.stringify(game))
  notify()
}

export function useGame() { return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => game) }
export function useQuizLibrary() { return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => librarySnapshot) }
export function getGame() { return game }
export function getActiveQuizTemplate() { return quizLibrary.find(item => item.id === activeQuizId) }
export function getLiveRole() { return liveRole }
export function leaveLiveRole(role?: 'host' | 'player' | 'screen') {
  if (!liveRole || (role && liveRole !== role)) return
  liveRole = null
  const quiz = quizLibrary.find(item => item.id === activeQuizId)
  if (quiz) game = gameFromQuiz(quiz)
  notify()
}
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
function gameFromQuiz(quiz: QuizTemplate): Game {
  return { ...freshGame(), title: quiz.title, theme: quiz.theme || 'quiz-show', questions: structuredClone(quiz.questions), code: game.code }
}
export function createQuiz(title = 'Untitled Quiz') {
  if (liveRole) throw new Error('Leave the live session before changing quizzes.')
  const id = crypto.randomUUID()
  const starter: Question = { id: crypto.randomUUID(), round: 'ROUND 1', type: 'single', prompt: 'New question', options: ['Answer A', 'Answer B', 'Answer C', 'Answer D'], answer: 'Answer A', points: 1000, duration: 30 }
  const quiz: QuizTemplate = { id, title, theme: 'quiz-show', questions: [starter], updatedAt: Date.now() }
  quizLibrary = [...quizLibrary, quiz]
  activeQuizId = id
  clearLiveCode()
  persistLibrary()
  save(gameFromQuiz(quiz))
  return id
}
export function duplicateQuiz(id: string) {
  if (liveRole) throw new Error('Leave the live session before changing quizzes.')
  const source = quizLibrary.find(item => item.id === id)
  if (!source) throw new Error('Quiz not found.')
  const quiz: QuizTemplate = {
    id: crypto.randomUUID(),
    title: `${source.title} copy`,
    theme: source.theme || 'quiz-show',
    questions: structuredClone(source.questions).map(question => ({ ...question, id: crypto.randomUUID() })),
    updatedAt: Date.now(),
  }
  quizLibrary = [...quizLibrary, quiz]
  activeQuizId = quiz.id
  clearLiveCode()
  persistLibrary()
  save(gameFromQuiz(quiz))
  return quiz
}
export function importQuiz(title: string, questions: Question[], theme: QuizTheme = 'quiz-show') {
  if (liveRole) throw new Error('Leave the live session before importing a quiz.')
  const quiz: QuizTemplate = {
    id: crypto.randomUUID(),
    title,
    theme,
    questions: structuredClone(questions).map(question => ({ ...question, id: crypto.randomUUID() })),
    updatedAt: Date.now(),
  }
  quizLibrary = [...quizLibrary, quiz]
  activeQuizId = quiz.id
  clearLiveCode()
  persistLibrary()
  save(gameFromQuiz(quiz))
  return quiz
}
export function deleteQuiz(id: string) {
  if (liveRole) throw new Error('Leave the live session before changing quizzes.')
  const target = quizLibrary.find(item => item.id === id)
  if (!target) return
  if (target.builtIn) throw new Error('The QuizForge test quiz is kept as a permanent example.')
  quizLibrary = quizLibrary.filter(item => item.id !== id)
  if (activeQuizId === id) activeQuizId = quizLibrary[0].id
  clearLiveCode()
  persistLibrary()
  save(gameFromQuiz(quizLibrary.find(item => item.id === activeQuizId)!))
}
export function replaceQuizLibrary(quizzes: QuizTemplate[]) {
  if (liveRole || !quizzes.length) return
  quizLibrary = structuredClone(quizzes).map(quiz => ({ ...quiz, theme: quiz.theme || 'quiz-show' }))
  if (!quizLibrary.some(item => item.id === activeQuizId)) activeQuizId = quizLibrary[0].id
  persistLibrary()
  const active = quizLibrary.find(item => item.id === activeQuizId)
  if (active) save(gameFromQuiz(active))
}
export function selectQuiz(id: string) {
  if (liveRole) throw new Error('Leave the live session before changing quizzes.')
  const quiz = quizLibrary.find(item => item.id === id)
  if (!quiz) throw new Error('Quiz not found.')
  activeQuizId = id
  clearLiveCode()
  persistLibrary()
  save(gameFromQuiz(quiz))
}
export function setQuizTheme(id: string, theme: QuizTheme) {
  if (liveRole) throw new Error('Leave the live session before changing its theme.')
  const index = quizLibrary.findIndex(item => item.id === id)
  if (index < 0) throw new Error('Quiz not found.')
  const next = { ...quizLibrary[index], theme, updatedAt: Date.now() }
  quizLibrary = quizLibrary.map((quiz, quizIndex) => quizIndex === index ? next : quiz)
  persistLibrary()
  if (activeQuizId === id) save(gameFromQuiz(next))
  else notify()
  return structuredClone(next)
}
export function resetGame() {
  if (liveRole) throw new Error('A live game cannot be reset as a local demo.')
  const quiz = quizLibrary.find(item => item.id === activeQuizId)
  save(quiz ? gameFromQuiz(quiz) : freshGame())
}
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
