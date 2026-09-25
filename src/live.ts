import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence, signInAnonymously, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth'
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Unsubscribe } from 'firebase/firestore'
import { advanceGame, breakGame, resumeGame } from './gameEngine'
import { currentQuestion, isLastQuestionInRound, type Game, type Player, type Response } from './model'
import { publicGame } from './publicGame'
import { resultForAnswer, type OwnResult } from './reveal'
import { getGame, receiveLiveGame, receiveOwnLiveResponse, type QuizTemplate } from './store'

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
let hostAuthInstance: Auth | null = null
let playerAuthInstance: Auth | null = null
function hostAuth() { return hostAuthInstance ||= getAuth(hostApp) }
function playerAuth() { return playerAuthInstance ||= getAuth(playerApp) }
// Control belongs to one GM tab. Hash navigation and reloads retain the tab's
// token, while a Main Screen or second Host tab receives a different token.
const controllerId = sessionStorage.getItem('quiz-host-controller-id') || crypto.randomUUID()
sessionStorage.setItem('quiz-host-controller-id', controllerId)

type PublicDocument = { hostUid: string; controllerId: string; memberUids: string[]; stateVersion: number; game: Game; openedAtServer?: { toMillis(): number } }
type PrivateDocument = { hostUid: string; stateVersion: number; game: Game; openedAtServer?: { toMillis(): number } }
type HostCommand = { type: 'advance' | 'break' | 'resume' | 'void' | 'grade' | 'end'; playerId?: string; points?: number }
export type LiveSessionRecord = {
  code: string
  ownerUid: string
  title: string
  status: 'active' | 'ended'
  createdAt?: unknown
  endedAt?: unknown
  deleteAfterMs?: number
}
let liveHostCode: string | null = null
let playerConnection: { code: string; uid: string; stop: () => void } | null = null
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const adminEmail = 'nickpatel.trainer@gmail.com'
export type HostAccount = {
  uid: string
  displayName: string
  email: string
  organisationName: string
  role: 'admin' | 'host'
  status: 'active' | 'suspended'
  createdAt?: unknown
  updatedAt?: unknown
  lastLoginAt?: unknown
}
function newGameCode() {
  const values = crypto.getRandomValues(new Uint8Array(6))
  return [...values].map(value => codeAlphabet[value % codeAlphabet.length]).join('')
}

function isGoogleUser(user: User | null) {
  return Boolean(user && user.email && user.emailVerified &&
    user.providerData.some(provider => provider.providerId === 'google.com'))
}

function isApprovedAdmin(user: User | null) {
  return Boolean(isGoogleUser(user) && user?.email?.toLowerCase() === adminEmail)
}

function requireGoogleUser(user: User | null) {
  if (!user) throw new Error('Google sign-in did not complete. Try opening XP Studio in Chrome or Edge.')
  if (!isGoogleUser(user)) throw new Error('Use a verified Google account to sign in to XP Studio.')
  return user
}

function hostCodeKey(uid: string) { return `quiz-live-host-code:${uid}` }
const sessionRetentionMs = 24 * 60 * 60 * 1000

function accountFrom(user: User, data: Partial<HostAccount>): HostAccount {
  return {
    uid: user.uid,
    displayName: data.displayName || user.displayName || user.email?.split('@')[0] || 'Quiz Host',
    email: user.email || '',
    organisationName: data.organisationName || '',
    role: data.role === 'admin' || isApprovedAdmin(user) ? 'admin' : 'host',
    status: data.status === 'suspended' ? 'suspended' : 'active',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    lastLoginAt: data.lastLoginAt,
  }
}

async function ensureHostAccount(user: User, recordLogin = false): Promise<HostAccount> {
  const ref = doc(hostDb, 'users', user.uid)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) {
    const account = accountFrom(user, {})
    await setDoc(ref, { ...account, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastLoginAt: serverTimestamp() })
    return account
  }
  const account = accountFrom(user, snapshot.data() as Partial<HostAccount>)
  if (recordLogin) {
    await updateDoc(ref, {
      displayName: user.displayName || account.displayName,
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
  return account
}

export async function restoreHostAccount(): Promise<HostAccount | null> {
  const auth = hostAuth()
  await setPersistence(auth, browserLocalPersistence)
  await auth.authStateReady()
  if (!auth.currentUser) return null
  const user = requireGoogleUser(auth.currentUser)
  return ensureHostAccount(user)
}

export async function signOutHost() {
  liveHostCode = null
  await signOut(hostAuth())
}

export async function hasHostSession() {
  const account = await restoreHostAccount()
  if (!account || account.status !== 'active') return false
  let code = localStorage.getItem(hostCodeKey(account.uid))
  if (!code && account.role === 'admin') {
    code = localStorage.getItem('quiz-live-host-code')
    if (code) localStorage.setItem(hostCodeKey(account.uid), code)
  }
  if (!code) return false
  const current = await getDoc(doc(hostDb, 'liveGames', code))
  if (!current.exists() || current.data().game?.phase === 'closed-game') {
    localStorage.removeItem(hostCodeKey(account.uid))
    return false
  }
  return true
}

/**
 * Called directly from the Start live session click. There must be no await
 * before signInWithPopup or browsers may treat the window as unsolicited.
 */
export async function beginHostPopup() {
  const auth = hostAuth()
  const resultPromise = signInWithPopup(auth, new GoogleAuthProvider())
  const result = await resultPromise
  const user = requireGoogleUser(result.user)
  await setPersistence(auth, browserLocalPersistence)
  await user.getIdToken(true)
  return ensureHostAccount(user, true)
}

async function hostUid(allowPopup = true) {
  const auth = hostAuth()
  await setPersistence(auth, browserLocalPersistence)
  await auth.authStateReady()
  const user = requireGoogleUser(auth.currentUser || (allowPopup ? (await signInWithPopup(auth, new GoogleAuthProvider())).user : null))
  // Refresh the token before Firestore listeners attach. This avoids a restored
  // browser session briefly using claims from an older authentication state.
  await user.getIdToken(true)
  const account = await ensureHostAccount(user)
  if (account.status !== 'active') throw new Error('This Host account is suspended. Contact the XP Studio administrator.')
  return user.uid
}

export async function hasAdminSession() {
  const account = await restoreHostAccount()
  return account?.role === 'admin' && account.status === 'active'
}

export async function listHostAccounts(): Promise<HostAccount[]> {
  if (!await hasAdminSession()) throw new Error('Administrator access is required.')
  const snapshot = await getDocs(collection(hostDb, 'users'))
  return snapshot.docs.map(item => ({ uid: item.id, ...item.data() } as HostAccount))
    .sort((a, b) => a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'admin' ? -1 : 1)
}

export async function setHostAccountStatus(uid: string, status: 'active' | 'suspended') {
  if (!await hasAdminSession()) throw new Error('Administrator access is required.')
  await updateDoc(doc(hostDb, 'users', uid), { status, updatedAt: serverTimestamp() })
}

/**
 * Merge the browser cache with the administrator's Firestore quiz library.
 * The most recently edited copy wins, then every merged quiz is persisted.
 */
export async function syncQuizLibrary(localQuizzes: QuizTemplate[], allowPopup = true): Promise<QuizTemplate[]> {
  const uid = await hostUid(allowPopup)
  const [snapshot, deletionSnapshot] = await Promise.all([
    getDocs(collection(hostDb, 'users', uid, 'quizzes')),
    getDocs(collection(hostDb, 'users', uid, 'quizDeletions')),
  ])
  const remote = snapshot.docs.map(item => item.data() as QuizTemplate)
  const deletedAt = new Map(deletionSnapshot.docs.map(item => [item.id, Number(item.data().deletedAtMs || 0)]))
  // The original single-account collection is retained as a read-only migration
  // source for the administrator. It is never exposed to normal Hosts.
  const legacy = isApprovedAdmin(hostAuth().currentUser)
    ? (await getDocs(collection(hostDb, 'quizTemplates'))).docs.map(item => item.data() as QuizTemplate)
    : []
  const merged = new Map<string, QuizTemplate>()
  for (const quiz of [...legacy, ...remote, ...localQuizzes]) {
    if ((deletedAt.get(quiz.id) || 0) >= Number(quiz.updatedAt || 0)) continue
    const current = merged.get(quiz.id)
    if (!current || quiz.updatedAt >= current.updatedAt) merged.set(quiz.id, serialise(quiz))
  }
  // The bundled test quiz is a permanent known-good test fixture. Its local
  // canonical copy wins over any older accidental cloud edit.
  for (const quiz of localQuizzes.filter(item => item.builtIn)) merged.set(quiz.id, serialise(quiz))
  const quizzes = [...merged.values()].sort((a, b) => Number(Boolean(b.builtIn)) - Number(Boolean(a.builtIn)) || b.updatedAt - a.updatedAt)
  await Promise.all(quizzes.map(quiz => setDoc(doc(hostDb, 'users', uid, 'quizzes', quiz.id), { ...serialise(quiz), ownerUid: uid })))
  return quizzes
}

export async function saveQuizTemplateCloud(quiz: QuizTemplate) {
  const uid = await hostUid(false)
  await setDoc(doc(hostDb, 'users', uid, 'quizzes', quiz.id), { ...serialise(quiz), ownerUid: uid })
}

export async function deleteQuizTemplateCloud(id: string) {
  const uid = await hostUid(false)
  const batch = writeBatch(hostDb)
  batch.set(doc(hostDb, 'users', uid, 'quizDeletions', id), { ownerUid: uid, deletedAtMs: Date.now() })
  batch.delete(doc(hostDb, 'users', uid, 'quizzes', id))
  // The administrator's original single-owner collection remains a migration
  // source. Remove the matching legacy copy as well so sync cannot resurrect a
  // deliberately deleted quiz on the next page load.
  if (isApprovedAdmin(hostAuth().currentUser)) batch.delete(doc(hostDb, 'quizTemplates', id))
  await batch.commit()
}

export async function listLiveSessions(): Promise<LiveSessionRecord[]> {
  const uid = await hostUid(false)
  const snapshot = await getDocs(collection(hostDb, 'users', uid, 'sessions'))
  return snapshot.docs.map(item => ({ code: item.id, ...item.data() } as LiveSessionRecord))
    .sort((a, b) => (b.deleteAfterMs || Number.MAX_SAFE_INTEGER) - (a.deleteAfterMs || Number.MAX_SAFE_INTEGER))
}

async function deleteSessionCollection(code: string, name: 'private' | 'players' | 'responses' | 'results') {
  while (true) {
    const snapshot = await getDocs(query(collection(hostDb, 'liveGames', code, name), limit(200)))
    if (snapshot.empty) return
    const batch = writeBatch(hostDb)
    snapshot.docs.forEach(item => batch.delete(item.ref))
    await batch.commit()
  }
}

/** Delete protected child records before the parent live-game document. */
export async function deleteLiveSession(code: string) {
  const uid = await hostUid(false)
  const upper = code.trim().toUpperCase()
  const publicRef = doc(hostDb, 'liveGames', upper)
  const current = await getDoc(publicRef)
  const ownerUid = current.exists() ? String(current.data().hostUid) : uid
  if (current.exists() && ownerUid !== uid && !isApprovedAdmin(hostAuth().currentUser)) throw new Error('Only the session owner can delete this live game.')
  for (const name of ['responses', 'results', 'players', 'private'] as const) await deleteSessionCollection(upper, name)
  if (current.exists()) await deleteDoc(publicRef)
  await deleteDoc(doc(hostDb, 'users', ownerUid, 'sessions', upper)).catch(() => undefined)
  if (localStorage.getItem(hostCodeKey(uid)) === upper) localStorage.removeItem(hostCodeKey(uid))
}

/** Spark-plan cleanup: delete ended sessions on the first Studio visit after 24 hours. */
export async function cleanupExpiredSessions() {
  const sessions = await listLiveSessions()
  const expired = sessions.filter(session => session.status === 'ended' && session.deleteAfterMs && session.deleteAfterMs <= Date.now())
  for (const session of expired) await deleteLiveSession(session.code)
  return expired.length
}

async function playerUid() {
  const auth = playerAuth()
  await setPersistence(auth, browserLocalPersistence)
  await auth.authStateReady()
  return (auth.currentUser || (await signInAnonymously(auth)).user).uid
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

export async function startLiveHost(onStatus: (message: string, canControl: boolean) => void, allowPopup = true, fresh = false, claimControl = true) {
  if (!getGame().questions.length) throw new Error('Add at least one question before starting a live game.')
  const uid = await hostUid(allowPopup)
  const code = (fresh ? null : localStorage.getItem(hostCodeKey(uid))) || newGameCode()
  const publicRef = doc(hostDb, 'liveGames', code)
  const privateRef = doc(hostDb, 'liveGames', code, 'private', 'engine')
  const sessionRef = doc(hostDb, 'users', uid, 'sessions', code)
  await runTransaction(hostDb, async tx => {
    const existing = await tx.get(publicRef)
    if (existing.exists()) {
      if (existing.data().hostUid !== uid) throw new Error('This code belongs to another Host.')
      if (existing.data().game?.phase === 'closed-game') throw new Error('This session has ended. Start a new session for a fresh game code.')
      // A restored secondary Host tab is an observer until the GM explicitly
      // presses Take Control. User-initiated starts still claim control.
      if (claimControl && existing.data().controllerId !== controllerId) tx.update(publicRef, { controllerId })
      tx.set(sessionRef, { code, ownerUid: uid, title: existing.data().game?.title || getGame().title, status: 'active' }, { merge: true })
      return
    }
    const initial: Game = serialise({ ...getGame(), code, phase: 'lobby', questionIndex: 0,
      stateVersion: 1, players: [], responses: [], grades: [],
      openedAt: undefined, closesAt: undefined, closedAt: undefined, returnPhase: undefined })
    tx.set(publicRef, { hostUid: uid, controllerId, memberUids: [], stateVersion: initial.stateVersion, game: serialise(publicGame(initial)) })
    tx.set(privateRef, { hostUid: uid, stateVersion: initial.stateVersion, game: initial })
    tx.set(sessionRef, { code, ownerUid: uid, title: initial.title, status: 'active', createdAt: serverTimestamp() })
  })
  liveHostCode = code
  localStorage.setItem(hostCodeKey(uid), code)
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
  const uid = await hostUid(false)
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
  const code = localStorage.getItem(hostCodeKey(uid))
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
  const uid = await hostUid(false)
  const code = liveHostCode
  const publicRef = doc(hostDb, 'liveGames', code)
  const privateRef = doc(hostDb, 'liveGames', code, 'private', 'engine')
  const sessionRef = doc(hostDb, 'users', uid, 'sessions', code)
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
    else if (command.type === 'end') {
      next = structuredClone(base)
      next.phase = 'closed-game'
      next.returnPhase = undefined
      next.openedAt = undefined
      next.closesAt = undefined
      next.closedAt = Date.now()
      next.stateVersion += 1
    }
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
    const ending = next.phase === 'closed-game' && base.phase !== 'closed-game'
    const deleteAfterMs = Date.now() + sessionRetentionMs
    tx.update(privateRef, { stateVersion: next.stateVersion, game: serialise(next), ...(next.phase === 'open' && base.phase !== 'open' ? { openedAtServer: serverTimestamp() } : {}) })
    tx.update(publicRef, {
      ...data,
      ...(next.phase === 'open' && base.phase !== 'open' ? { openedAtServer: serverTimestamp() } : {}),
      ...(ending ? { endedAt: serverTimestamp(), deleteAfterMs } : {}),
    })
    if (ending) {
      tx.set(sessionRef, { code, ownerUid: uid, title: next.title, status: 'ended', endedAt: serverTimestamp(), deleteAfterMs }, { merge: true })
    }
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
  if (command.type === 'end') localStorage.removeItem(hostCodeKey(uid))
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
