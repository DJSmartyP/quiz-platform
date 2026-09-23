import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, getRedirectResult, GoogleAuthProvider, setPersistence, signInAnonymously, signInWithPopup, signInWithRedirect } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, query, runTransaction, serverTimestamp, where, type Unsubscribe } from 'firebase/firestore'
import { advanceGame, breakGame, resumeGame } from './gameEngine'
import { currentQuestion, isLastQuestionInRound, type Game, type Player, type Response } from './model'
import { publicGame } from './publicGame'
import { resultForAnswer, type OwnResult } from './reveal'
import { getGame, receiveLiveGame, receiveOwnLiveResponse } from './store'

// Firebase web configuration is public; Firestore rules enforce access.
const config = {
  apiKey: 'AIzaSyDwWVyw5tp6XX2zsApDfXhhbHwdqjhnQ5A',
  authDomain: 'nickp-quiz-platform-2026.firebaseapp.com',
  projectId: 'nickp-quiz-platform-2026',
  appId: '1:913132123361:web:07ed21875a013784f873a0',
}
const hostApp = initializeApp(config, 'quiz-host')
const playerApp = initializeApp(config, 'quiz-player')
const screenApp = initializeApp(config, 'quiz-screen')
const hostDb = getFirestore(hostApp)
const playerDb = getFirestore(playerApp)
const screenDb = getFirestore(screenApp)
const hostAuth = getAuth(hostApp)
const playerAuth = getAuth(playerApp)
// One approved admin browser keeps the same controller identity across reloads
// and normal navigation. State-version checks still reject stale double actions.
const controllerId = localStorage.getItem('quiz-host-controller-id') || crypto.randomUUID()
localStorage.setItem('quiz-host-controller-id', controllerId)

type PublicDocument = { hostUid: string; controllerId: string; memberUids: string[]; stateVersion: number; game: Game; openedAtServer?: { toMillis(): number } }
type PrivateDocument = { hostUid: string; stateVersion: number; game: Game; openedAtServer?: { toMillis(): number } }
type HostCommand = { type: 'advance' | 'break' | 'resume' | 'void' | 'grade'; playerId?: string; points?: number }
let liveHostCode: string | null = null
let playerConnection: { code: string; uid: string; stop: () => void } | null = null
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newGameCode() {
  const values = crypto.getRandomValues(new Uint8Array(6))
  return [...values].map(value => codeAlphabet[value % codeAlphabet.length]).join('')
}

export const hostRedirectKey = 'quiz-host-redirect-pending'
let redirectFinishPromise: Promise<void> | null = null

export async function hasHostSession() {
  await setPersistence(hostAuth, browserLocalPersistence)
  await hostAuth.authStateReady()
  return Boolean(hostAuth.currentUser && localStorage.getItem('quiz-live-host-code'))
}

export async function beginHostRedirect() {
  await setPersistence(hostAuth, browserLocalPersistence)
  sessionStorage.setItem(hostRedirectKey, '1')
  try { await signInWithRedirect(hostAuth, new GoogleAuthProvider()) }
  catch (error) { sessionStorage.removeItem(hostRedirectKey); throw error }
}

export function finishHostRedirect() {
  redirectFinishPromise ||= (async () => {
    await getRedirectResult(hostAuth)
    await hostAuth.authStateReady()
    if (!hostAuth.currentUser) throw new Error('Google sign-in did not complete. Try opening QuizForge in Chrome or Edge.')
  })()
  return redirectFinishPromise
}

async function hostUid(allowPopup = true) {
  await setPersistence(hostAuth, browserLocalPersistence)
  await hostAuth.authStateReady()
  const user = hostAuth.currentUser || (allowPopup ? (await signInWithPopup(hostAuth, new GoogleAuthProvider())).user : null)
  if (!user) throw new Error('Google sign-in did not complete. Try opening QuizForge in Chrome or Edge.')
  if (user.email?.toLowerCase() !== 'nickpatel.trainer@gmail.com' || !user.emailVerified ||
      !user.providerData.some(provider => provider.providerId === 'google.com')) {
    throw new Error('Only nickpatel.trainer@gmail.com can control QuizForge live games.')
  }
  // Refresh the token before Firestore listeners attach. This avoids a restored
  // browser session briefly using claims from an older authentication state.
  await user.getIdToken(true)
  return user.uid
}

async function playerUid() {
  await setPersistence(playerAuth, browserLocalPersistence)
  await playerAuth.authStateReady()
  return (playerAuth.currentUser || (await signInAnonymously(playerAuth)).user).uid
}

function serialise<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function withRoster(game: Game, roster: Player[]): Game {
  const scores = new Map(game.players.map(player => [player.id, player.score]))
  return { ...game, players: roster.map(player => ({ ...player, score: scores.get(player.id) ?? 0 })) }
}

function timedGame(data: PublicDocument | PrivateDocument): Game {
  const openedAt = data.openedAtServer?.toMillis()
  if (!openedAt || !data.game.openedAt) return data.game
  const duration = data.game.questions[data.game.questionIndex]?.duration || 30
  return { ...data.game, openedAt, closesAt: openedAt + duration * 1000 }
}

export async function startLiveHost(onStatus: (message: string, canControl: boolean) => void, allowPopup = true, fresh = false) {
  if (!getGame().questions.length) throw new Error('Add at least one question before starting a live game.')
  const uid = await hostUid(allowPopup)
  const code = (fresh ? null : localStorage.getItem('quiz-live-host-code')) || newGameCode()
  const publicRef = doc(hostDb, 'liveGames', code)
  const privateRef = doc(hostDb, 'liveGames', code, 'private', 'engine')
  await runTransaction(hostDb, async tx => {
    const existing = await tx.get(publicRef)
    if (existing.exists()) {
      if (existing.data().hostUid !== uid) throw new Error('This code belongs to another Host.')
      if (existing.data().controllerId !== controllerId) tx.update(publicRef, { controllerId })
      return
    }
    const initial: Game = serialise({ ...getGame(), code, phase: 'lobby', questionIndex: 0,
      stateVersion: 1, players: [], responses: [], grades: [],
      openedAt: undefined, closesAt: undefined, closedAt: undefined, returnPhase: undefined })
    tx.set(publicRef, { hostUid: uid, controllerId, memberUids: [], stateVersion: initial.stateVersion, game: serialise(publicGame(initial)) })
    tx.set(privateRef, { hostUid: uid, stateVersion: initial.stateVersion, game: initial })
  })
  liveHostCode = code
  localStorage.setItem('quiz-live-host-code', code)
  let privateGame: Game | null = null
  let roster: Player[] = []
  let responses: Response[] = []
  let stopResponses: Unsubscribe | null = null
  let currentQuestionId = ''
  const renderHost = () => {
    if (!privateGame) return
    receiveLiveGame({ ...withRoster(privateGame, roster), responses }, 'host')
  }
  const stopPrivate = onSnapshot(privateRef, snap => {
    if (!snap.exists()) return
    privateGame = timedGame(snap.data() as PrivateDocument)
    const questionId = currentQuestion(privateGame).id
    if (currentQuestionId !== questionId) {
      currentQuestionId = questionId
      responses = []
      stopResponses?.()
      stopResponses = onSnapshot(query(collection(hostDb, 'liveGames', code, 'responses'), where('questionId', '==', questionId)), result => {
        responses = result.docs.map(item => item.data() as Response)
        renderHost()
      }, error => onStatus(`Answer sync error: ${error.message}`, false))
    }
    renderHost()
  }, error => onStatus(`Game sync error: ${error.message}`, false))
  const stopRoster = onSnapshot(collection(hostDb, 'liveGames', code, 'players'), result => {
    roster = result.docs.map(item => ({ id: item.id, name: item.data().name, avatarId: item.data().avatarId, score: 0 }))
    renderHost()
  }, error => onStatus(`Player sync error: ${error.message}`, false))
  const stopControl = onSnapshot(publicRef, snap => {
    if (!snap.exists()) return
    const canControl = snap.data().controllerId === controllerId
    onStatus(canControl ? 'Live across devices' : 'Another Host tab has control', canControl)
  }, error => onStatus(`Control sync error: ${error.message}`, false))
  return () => { stopPrivate(); stopRoster(); stopControl(); stopResponses?.(); liveHostCode = null }
}

export async function takeLiveControl() {
  if (!liveHostCode) throw new Error('Connect to the live game first.')
  const uid = await hostUid()
  const ref = doc(hostDb, 'liveGames', liveHostCode)
  await runTransaction(hostDb, async tx => {
    const current = await tx.get(ref)
    if (!current.exists() || current.data().hostUid !== uid) throw new Error('Host access lost.')
    tx.update(ref, { controllerId })
  })
}

/** Admin inspection is scoped to the Host's current session; rules protect private records. */
export async function inspectAdminSession(): Promise<Game> {
  const uid = await hostUid(false)
  const code = localStorage.getItem('quiz-live-host-code')
  if (!code) throw new Error('Start or reconnect a live game from the Host console first.')
  const [engine, players] = await Promise.all([
    getDoc(doc(hostDb, 'liveGames', code, 'private', 'engine')),
    getDocs(collection(hostDb, 'liveGames', code, 'players')),
  ])
  if (!engine.exists() || engine.data().hostUid !== uid) throw new Error('This live session is unavailable to your account.')
  const game = timedGame(engine.data() as PrivateDocument)
  const questionId = currentQuestion(game)?.id
  const answers = questionId ? await getDocs(query(collection(hostDb, 'liveGames', code, 'responses'), where('questionId', '==', questionId))) : null
  const roster = players.docs.map(item => ({ id: item.id, name: item.data().name, avatarId: item.data().avatarId, score: 0 }))
  return { ...withRoster(game, roster), responses: answers?.docs.map(item => item.data() as Response) || [] }
}

export async function liveHostCommand(expectedVersion: number, command: HostCommand) {
  if (!liveHostCode) throw new Error('Connect to the live game first.')
  const code = liveHostCode
  const publicRef = doc(hostDb, 'liveGames', code)
  const privateRef = doc(hostDb, 'liveGames', code, 'private', 'engine')
  const prior = getGame()
  const questionId = prior.questions[prior.questionIndex]?.id
  const playerSnapshot = await getDocs(collection(hostDb, 'liveGames', code, 'players'))
  const responseSnapshot = (command.type === 'advance' && ['closed', 'reveal'].includes(prior.phase) || command.type === 'grade' && prior.phase === 'reveal') && questionId
    ? await getDocs(query(collection(hostDb, 'liveGames', code, 'responses'), where('questionId', '==', questionId))) : null
  const roster = playerSnapshot.docs.map(item => ({ id: item.id, name: item.data().name, avatarId: item.data().avatarId, score: 0 } as Player))
  const responses = responseSnapshot?.docs.map(item => item.data() as Response) || []
  await runTransaction(hostDb, async tx => {
    const publicSnap = await tx.get(publicRef)
    const privateSnap = await tx.get(privateRef)
    if (!publicSnap.exists() || !privateSnap.exists()) throw new Error('Live game is unavailable.')
    const published = publicSnap.data() as PublicDocument
    const privateData = privateSnap.data() as PrivateDocument
    if (published.controllerId !== controllerId) throw new Error('Another Host tab controls this game. Use Take Control first.')
    if (privateData.stateVersion !== expectedVersion || published.stateVersion !== expectedVersion) throw new Error('Game changed. Review the current screen and try again.')
    const base = timedGame(privateData)
    const scoreById = new Map(base.players.map(p => [p.id, p.score]))
    base.players = roster.map(p => ({ ...p, score: scoreById.get(p.id) ?? 0 }))
    base.responses = responses
    let next: Game = base
    if (command.type === 'advance') next = advanceGame(base)
    else if (command.type === 'break') next = breakGame(base)
    else if (command.type === 'resume') next = resumeGame(base)
    else if (command.type === 'grade' && command.playerId) {
      next = structuredClone(base)
      next.grades = next.grades.filter(g => !(g.playerId === command.playerId && g.questionId === questionId))
      next.grades.push({ playerId: command.playerId, questionId, points: Math.max(0, Math.round(command.points || 0)), committed: false })
      next.stateVersion += 1
    } else if (command.type === 'void') {
      next = structuredClone(base)
      for (const player of next.players) {
        const grade = next.grades.find(g => g.playerId === player.id && g.questionId === questionId)
        if (grade?.committed) player.score = Math.max(0, player.score - grade.points)
      }
      next.grades = next.grades.filter(g => g.questionId !== questionId)
      next.phase = isLastQuestionInRound(next) ? 'round-scores' : 'scores'
      next.stateVersion += 1
    }
    if (next === base) return
    next.responses = [] // submissions stay in their own protected records
    const data = { stateVersion: next.stateVersion, game: serialise(publicGame(next)) }
    tx.update(privateRef, { stateVersion: next.stateVersion, game: serialise(next), ...(next.phase === 'open' && base.phase !== 'open' ? { openedAtServer: serverTimestamp() } : {}) })
    tx.update(publicRef, { ...data, ...(next.phase === 'open' && base.phase !== 'open' ? { openedAtServer: serverTimestamp() } : {}) })
    if (next.phase === 'reveal' && (base.phase === 'closed' || command.type === 'grade')) {
      const question = currentQuestion(next)
      for (const player of next.players) {
        if (command.type === 'grade' && player.id !== command.playerId) continue
        const response = responses.find(item => item.playerId === player.id && item.questionId === question.id)
        const grade = next.grades.find(item => item.playerId === player.id && item.questionId === question.id)
        const result = resultForAnswer(question, response, grade, responses, next.openedAt)
        tx.set(doc(hostDb, 'liveGames', code, 'results', `${player.id}_${question.id}`), { playerId: player.id, questionId: question.id, ...result })
      }
    } else if (command.type === 'advance' && base.phase === 'reveal') {
      for (const player of next.players) {
        const grade = next.grades.find(item => item.playerId === player.id && item.questionId === questionId && item.committed)
        if (!grade) continue
        const result = resultForAnswer(currentQuestion(next), responses.find(item => item.playerId === player.id && item.questionId === questionId), grade, responses, next.openedAt)
        tx.set(doc(hostDb, 'liveGames', code, 'results', `${player.id}_${questionId}`), { playerId: player.id, questionId, ...result })
      }
    }
  })
}

export function followLiveScreen(code: string, onError: (message: string) => void, onConnected: () => void) {
  const upper = code.toUpperCase()
  let publicState: Game | null = null
  let roster: Player[] = []
  const render = () => { if (publicState) receiveLiveGame(withRoster(publicState, roster), 'screen') }
  const stopGame = onSnapshot(doc(screenDb, 'liveGames', upper), snap => {
    if (!snap.exists()) { onError('No live game exists with that code.'); return }
    publicState = timedGame(snap.data() as PublicDocument)
    render()
    onConnected()
  }, error => onError(error.message))
  const stopRoster = onSnapshot(collection(screenDb, 'liveGames', upper, 'players'), result => {
    roster = result.docs.map(item => ({ id: item.id, name: item.data().name, avatarId: item.data().avatarId, score: 0 }))
    render()
  }, error => onError(error.message))
  return () => { stopGame(); stopRoster() }
}

export async function joinLiveGame(code: string, name: string, avatarId: string, onReady: (questionId: string) => void, onResult: (result: OwnResult | null) => void, onError: (message: string) => void) {
  const upper = code.trim().toUpperCase()
  const publicRef = doc(playerDb, 'liveGames', upper)
  if (!(await getDoc(publicRef)).exists()) return null
  const uid = await playerUid()
  const playerRef = doc(playerDb, 'liveGames', upper, 'players', uid)
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length > 24) throw new Error('Choose a name of 1–24 characters.')
  await runTransaction(playerDb, async tx => {
    const current = await tx.get(publicRef)
    const existing = await tx.get(playerRef)
    if (!current.exists()) throw new Error('Game no longer exists.')
    if (existing.exists()) return
    const live = current.data() as PublicDocument
    if (live.memberUids.length >= 50) throw new Error('Game full — 50 players have joined.')
    if (live.game.phase !== 'lobby' && !live.game.allowLateJoins) throw new Error('This game has already started.')
    if (live.game.players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) throw new Error('That name is already in use.')
    tx.update(publicRef, { memberUids: [...live.memberUids, uid] })
    tx.set(playerRef, { name: trimmed, avatarId })
  })
  playerConnection?.stop()
  let stopResponse: Unsubscribe | null = null
  let stopResult: Unsubscribe | null = null
  let stopRoster: Unsubscribe | null = null
  let responseQuestionId = ''
  let publicState: Game | null = null
  let roster: Player[] = []
  const render = () => {
    if (!publicState) return
    const next = withRoster(publicState, roster)
    if (!next.players.some(player => player.id === uid)) next.players.push({ id: uid, name: trimmed, avatarId, score: 0 })
    receiveLiveGame(next, 'player')
  }
  const stopGame = onSnapshot(publicRef, snap => {
    if (!snap.exists()) { onError('This game is no longer available.'); return }
    publicState = timedGame(snap.data() as PublicDocument)
    render()
    const questionId = publicState.questions[publicState.questionIndex]?.id
    if (questionId && responseQuestionId !== questionId) {
      responseQuestionId = questionId
      stopResponse?.()
      stopResult?.()
      onResult(null)
      stopResponse = onSnapshot(doc(playerDb, 'liveGames', upper, 'responses', `${uid}_${questionId}`), { includeMetadataChanges: true }, own => {
        if (own.metadata.hasPendingWrites || own.metadata.fromCache) return
        receiveOwnLiveResponse(own.exists() ? own.data() as Response : null)
        onReady(questionId)
      }, error => onError(`Answer status unavailable: ${error.message}`))
      stopResult = onSnapshot(doc(playerDb, 'liveGames', upper, 'results', `${uid}_${questionId}`), own => {
        if (!own.metadata.hasPendingWrites) onResult(own.exists() ? { points: Number(own.data().points), verdict: own.data().verdict as OwnResult['verdict'] } : null)
      }, error => onError(`Result unavailable: ${error.message}`))
    }
  }, error => onError(`Game sync unavailable: ${error.message}`))
  stopRoster = onSnapshot(collection(playerDb, 'liveGames', upper, 'players'), result => {
    roster = result.docs.map(item => ({ id: item.id, name: item.data().name, avatarId: item.data().avatarId, score: 0 }))
    render()
  }, error => onError(`Player list unavailable: ${error.message}`))
  playerConnection = { code: upper, uid, stop: () => { stopGame(); stopResponse?.(); stopResult?.(); stopRoster?.() } }
  sessionStorage.setItem('quiz-demo-player-id', uid)
  localStorage.setItem('quiz-live-player-code', upper)
  return uid
}

export async function reconnectLivePlayer(code: string, onReady: (questionId: string) => void, onResult: (result: OwnResult | null) => void, onError: (message: string) => void) {
  const upper = code.toUpperCase()
  if (localStorage.getItem('quiz-live-player-code') !== upper) return null
  const uid = await playerUid()
  const existing = await getDoc(doc(playerDb, 'liveGames', upper, 'players', uid))
  if (!existing.exists()) return null
  return joinLiveGame(upper, existing.data().name, existing.data().avatarId, onReady, onResult, onError)
}

export async function submitLiveAnswer(value: unknown) {
  if (!playerConnection) throw new Error('Reconnect to the live game first.')
  const { code, uid } = playerConnection
  const publicRef = doc(playerDb, 'liveGames', code)
  let saved: Response | null = null
  await runTransaction(playerDb, async tx => {
    const current = await tx.get(publicRef)
    if (!current.exists()) throw new Error('This game has ended.')
    const game = timedGame(current.data() as PublicDocument)
    const question = currentQuestion(game)
    if (game.phase !== 'open' || (game.closesAt && Date.now() >= game.closesAt)) throw new Error('Answers are closed.')
    const responseRef = doc(playerDb, 'liveGames', code, 'responses', `${uid}_${question.id}`)
    const existing = await tx.get(responseRef)
    if (existing.exists()) throw new Error('Your answer is already locked in.')
    saved = { playerId: uid, questionId: question.id, value, submittedAt: Date.now() }
    tx.set(responseRef, saved)
  })
  if (saved) receiveOwnLiveResponse(saved) // The transaction promise is the server acknowledgement.
}
