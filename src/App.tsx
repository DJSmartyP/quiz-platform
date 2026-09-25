import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, CircleHelp, Clock3, Copy, Download, Edit3, ExternalLink, Gamepad2, House, ImagePlus, LayoutDashboard, MonitorPlay, Play, Plus, ShieldCheck, Sparkles, Trash2, Trophy, Upload, Users } from 'lucide-react'
import { anagramDisplay, currentQuestion, currentTheme, effectiveScoreMode, gradeFor, isAnswerComplete, quizThemes, ranked, rankedRound, responseFor, roundPoints, scrambleWord, typeInstructions, typeNames, type Game, type Player, type Question, type QuestionType, type QuizTheme } from './model'
import { actionLabel, createQuiz, deleteQuiz, duplicateQuiz, expireAnswers, getActiveQuizTemplate, getLiveRole, getQuizLibrarySnapshot, importQuiz, leaveLiveRole, replaceQuizLibrary, scopeQuizWorkspace, selectQuiz, setQuizTheme, update, useGame, useQuizLibrary, type QuizTemplate } from './store'
import { beginHostPopup, cleanupExpiredSessions, deleteLiveSession, deleteQuizTemplateCloud, followLiveScreen, hasHostSession, joinLiveGame, liveHostCommand, reconnectLivePlayer, restoreHostAccount, saveQuizTemplateCloud, signOutHost, startLiveHost, submitLiveAnswer, syncQuizLibrary, takeLiveControl, type HostAccount } from './live'
import { answerLabel, type OwnResult } from './reveal'
import QRCode from 'qrcode'
import AdminDashboard from './AdminDashboard'
import './App.css'
import './brand.css'

type Avatar = { id: string; name: string; src: string }
type Pack = { id: string; name: string; avatars: Avatar[] }
const packIds = [
  'default', 'platypus', 'animals', 'fantasy', 'sci-fi', 'monsters-spooks',
  'retro-arcade', 'heroes-villains', 'historical-costume',
  'pirates-adventurers', 'food-objects', 'seasonal',
]
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`
const quizThemeIds = Object.keys(quizThemes) as QuizTheme[]
const themeSurfaceStyle = (theme: QuizTheme | undefined) => {
  const id = theme || 'quiz-show'
  return {
    '--theme-background': `url("${asset(`themes/${id}/background.webp`)}")`,
    '--theme-break': `url("${asset(`themes/${id}/break.webp`)}")`,
    '--theme-thanks': `url("${asset(`themes/${id}/thanks.webp`)}")`,
  } as React.CSSProperties
}
function useThemeScenePreload(theme: QuizTheme | undefined) {
  useEffect(() => {
    const id = theme || 'quiz-show'
    const images = ['break', 'thanks'].map(scene => {
      const image = new Image()
      image.src = asset(`themes/${id}/${scene}.webp`)
      return image
    })
    return () => images.forEach(image => { image.src = '' })
  }, [theme])
}
const avatarSrc = (id: string, packs: Pack[]) => {
  for (const pack of packs) {
    const avatar = pack.avatars.find(a => a.id === id)
    if (avatar) return asset(avatar.src)
  }
  return asset('avatars/default/blue.png')
}
function usePacks() {
  const [packs, setPacks] = useState<Pack[]>([])
  useEffect(() => {
    Promise.all(packIds.map(async id => {
      const data = await fetch(asset(`avatars/${id}/manifest.json`)).then(r => r.json())
      return { id, name: data.name || (id === 'sci-fi' ? 'Sci-Fi' : id[0].toUpperCase() + id.slice(1)), avatars: data.avatars || data } as Pack
    })).then(setPacks).catch(console.error)
  }, [])
  return packs
}
function ProductLogo({ mode, compact = false, linked = false }: { mode: 'studio' | 'play'; compact?: boolean; linked?: boolean }) {
  const label = mode === 'studio' ? 'XP Studio' : 'XP Play'
  const logo = <span className={`xp-logo xp-logo-${mode} ${compact ? 'compact' : ''}`} aria-label={label}>
    <img className="xp-logo-image" src={asset(`brand/xp-${mode}-logo.png`)} alt={label}/>
  </span>
  return linked ? <Link className="brand" to="/" aria-label="XP Studio home">{logo}</Link> : logo
}
function Logo() { return <ProductLogo mode="studio" linked/> }
function XPPlayLogo({ compact = false }: { compact?: boolean }) { return <ProductLogo mode="play" compact={compact}/> }
function XPPlayCredit() { return <span className="powered-by">XP PLAY · BY SHARED XP</span> }
function PlayerPortalQr({ value }: { value: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, { width: 240, margin: 1, color: { dark: '#21163b', light: '#ffffff' } })
      .then(data => { if (active) setSrc(data) })
      .catch(() => { if (active) setSrc('') })
    return () => { active = false }
  }, [value])
  return src ? <img className="player-portal-qr" src={src} alt="QR code for the XP Play player portal"/> : null
}
const questionTypes = Object.keys(typeNames) as QuestionType[]
async function compressQuestionImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG, WEBP or other image file.')
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / bitmap.width, 720 / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not prepare the image.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of [.8, .68, .56, .44]) {
    const data = canvas.toDataURL('image/webp', quality)
    if (data.length <= 150_000) return data
  }
  throw new Error('This image is still too large after compression. Try a smaller crop.')
}
function changeQuestionType(question: Question, type: QuestionType): Question {
  const { options: _options, items: _items, categories: _categories, scramble: _scramble, tolerance: _tolerance, explanation: _explanation, ...base } = question
  const next: Question = { ...base, type }
  if (type === 'single') return { ...next, options: ['Answer A', 'Answer B', 'Answer C', 'Answer D'], answer: 'Answer A' }
  if (type === 'multi') return { ...next, options: ['Answer A', 'Answer B', 'Answer C', 'Answer D'], answer: ['Answer A'] }
  if (type === 'boolean') return { ...next, answer: true }
  if (type === 'number' || type === 'closest') return { ...next, answer: 0, tolerance: type === 'number' ? 0 : undefined }
  if (type === 'ordering') return { ...next, items: ['First item', 'Second item', 'Third item'], answer: ['First item', 'Second item', 'Third item'] }
  if (type === 'matching') return { ...next, items: ['Item 1', 'Item 2'], options: ['Match 1', 'Match 2'], answer: { 'Item 1': 'Match 1', 'Item 2': 'Match 2' } }
  if (type === 'categorise') return { ...next, items: ['Item 1', 'Item 2'], categories: ['Category 1', 'Category 2'], answer: { 'Item 1': 'Category 1', 'Item 2': 'Category 2' } }
  if (type === 'list') return { ...next, answer: ['Answer 1', 'Answer 2', 'Answer 3'] }
  if (type === 'anagram') return { ...next, answer: 'Platypus', scramble: scrambleWord('Platypus'), scoreMode: 'time' }
  return { ...next, answer: '' }
}
function validateQuestionDraft(question: Question) {
  const duration = question.duration ?? 30
  if (!question.round.trim()) return 'Enter a round name.'
  if (!question.prompt.trim()) return 'Enter a question prompt.'
  if (!Number.isFinite(question.points) || question.points < 0) return 'Points must be zero or more.'
  if (!Number.isFinite(duration) || duration < 5) return 'Timer must be at least 5 seconds.'
  if (question.type === 'anagram' && duration < 10) return 'Anagram timers must be at least 10 seconds.'
  if (['single','multi'].includes(question.type)) {
    const options = (question.options || []).map(value => value.trim()).filter(Boolean)
    if (options.length < 2) return 'Add at least two answer options.'
    if (new Set(options.map(value => value.toLocaleLowerCase())).size !== options.length) return 'Answer options must be unique.'
    const correct = Array.isArray(question.answer) ? question.answer : [question.answer]
    if (!correct.length || correct.some(answer => !options.includes(String(answer)))) return 'Choose a valid correct answer.'
  }
  if (question.type === 'ordering' && (question.items || []).length < 2) return 'Add at least two items in the correct order.'
  if (question.type === 'list' && (!Array.isArray(question.answer) || question.answer.length < 1)) return 'Add at least one expected answer.'
  if (question.type === 'text' && (!Array.isArray(question.answer) || question.answer.length < 1)) return 'Add at least one accepted answer.'
  if (['number','closest'].includes(question.type) && !Number.isFinite(Number(question.answer))) return 'Enter a valid correct number.'
  if (['matching','categorise'].includes(question.type)) {
    const items = question.items || []
    const choices = question.type === 'matching' ? question.options || [] : question.categories || []
    const answers = question.answer && typeof question.answer === 'object' && !Array.isArray(question.answer) ? question.answer as Record<string,string> : {}
    if (!items.length || !choices.length) return 'Add items and available choices.'
    if (items.some(item => !answers[item] || !choices.includes(answers[item]))) return 'Complete a valid correct pair for every item.'
  }
  if (question.type === 'anagram' && !String(question.answer || '').trim()) return 'Enter the word or phrase to scramble.'
  if (['photo-reveal', 'photo-zoom'].includes(question.type) && !question.imageUrl) return 'Add an image for this photo question.'
  if (['photo-reveal', 'photo-zoom'].includes(question.type) && !String(question.answer || '').trim()) return 'Enter the correct photo answer.'
  return ''
}
function readQuizPack(text: string): { title: string; theme: QuizTheme; roundThemes: Record<string, QuizTheme>; questions: Question[] } {
  if (text.length > 900_000) throw new Error('This quiz pack is too large to store safely.')
  const parsed = JSON.parse(text) as Record<string, unknown>
  const source = ['quizforge-pack', 'xp-studio-pack'].includes(String(parsed?.format)) ? parsed.quiz as Record<string, unknown> : parsed
  if (!source || typeof source.title !== 'string' || !source.title.trim()) throw new Error('This file does not contain a quiz name.')
  if (!Array.isArray(source.questions) || source.questions.length < 1 || source.questions.length > 500) throw new Error('A quiz pack must contain between 1 and 500 questions.')
  const questions = source.questions.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Question ${index + 1} is not valid.`)
    const question = structuredClone(value) as Question
    if (!questionTypes.includes(question.type) || typeof question.round !== 'string' || typeof question.prompt !== 'string') throw new Error(`Question ${index + 1} has an unsupported format.`)
    question.id = crypto.randomUUID()
    const invalid = validateQuestionDraft(question)
    if (invalid) throw new Error(`Question ${index + 1}: ${invalid}`)
    return question
  })
  const mediaSize = questions.reduce((total, question) => total + (question.imageUrl?.length || 0), 0)
  if (mediaSize > 650_000) throw new Error('This pack contains too much embedded image data. Use hosted image URLs for larger picture quizzes.')
  const theme = quizThemeIds.includes(source.theme as QuizTheme) ? source.theme as QuizTheme : 'quiz-show'
  const roundThemes = Object.fromEntries(Object.entries(source.roundThemes && typeof source.roundThemes === 'object' ? source.roundThemes as Record<string, unknown> : {}).filter(([, value]) => quizThemeIds.includes(value as QuizTheme))) as Record<string, QuizTheme>
  return { title: source.title.trim(), theme, roundThemes, questions }
}
const HostAccountContext = createContext<HostAccount | null>(null)
function HostGate({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const [account, setAccount] = useState<HostAccount | null | undefined>(undefined)
  const [error, setError] = useState('')
  const prepare = async (next: HostAccount | null) => {
    if (next) scopeQuizWorkspace(next.uid, next.role === 'admin')
    if (next?.status === 'active') {
      try { replaceQuizLibrary(await syncQuizLibrary(getQuizLibrarySnapshot().quizzes, false)) }
      catch (cause) { console.warn('Cloud quiz library could not be loaded.', cause) }
      void cleanupExpiredSessions().catch(error => console.warn('Expired session cleanup could not run.', error))
    }
    setAccount(next)
  }
  useEffect(() => {
    let active = true
    void restoreHostAccount().then(next => { if (active) void prepare(next) }).catch(cause => { if (active) { setError((cause as Error).message); setAccount(null) } })
    return () => { active = false }
  }, [])
  const signIn = async () => {
    setError('')
    try { await prepare(await beginHostPopup()) }
    catch (cause) { setError(friendlyAuthError(cause)) }
  }
  if (account === undefined) return <div className="account-gate"><Logo/><div className="account-card"><span className="account-kicker">XP STUDIO</span><h1>Opening your Host workspace…</h1><p>Checking your saved Google sign-in.</p></div></div>
  if (!account) return <div className="account-gate"><Logo/><div className="account-card"><span className="account-kicker">XP STUDIO HOST ACCESS</span><h1>Build and run your quizzes.</h1><p>Sign in with Google to open your private XP Studio workspace. Players never need an account.</p>{error&&<div className="error">{error}</div>}<Button onClick={()=>void signIn()}><ShieldCheck size={18}/> Sign in with Google</Button><Link className="text-link" to="/">Back to XP Studio</Link></div></div>
  if (account.status === 'suspended') return <div className="account-gate"><Logo/><div className="account-card"><span className="account-kicker">ACCOUNT PAUSED</span><h1>Your Host access is suspended.</h1><p>Contact nickpatel.trainer@gmail.com if you think this is a mistake.</p><Button variant="secondary" onClick={()=>void signOutHost().then(()=>setAccount(null))}>Sign out</Button></div></div>
  if (adminOnly && account.role !== 'admin') return <div className="account-gate"><Logo/><div className="account-card"><span className="account-kicker">ADMIN ONLY</span><h1>This area is restricted.</h1><p>Your Host account can manage its own quizzes and live games.</p><Link className="btn primary" to="/organiser">Return to workspace</Link></div></div>
  return <HostAccountContext.Provider value={account}>{children}</HostAccountContext.Provider>
}
function Shell({ children, active }: { children: React.ReactNode; active?: string }) {
  const account = useContext(HostAccountContext)
  const nav = useNavigate()
  const logOut = async () => { await signOutHost(); nav('/'); location.reload() }
  return <div className="shell"><aside className="sidebar"><Logo/><div className="side-label">XP STUDIO</div><NavLink to="/" end className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><House size={19}/> Public homepage</NavLink><div className="side-label spaced">WORKSPACE</div><NavLink to="/organiser" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><LayoutDashboard size={19}/> Overview</NavLink><NavLink to="/editor" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><Edit3 size={19}/> Quiz editor</NavLink><NavLink to="/host" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><Gamepad2 size={19}/> Host console</NavLink><NavLink to="/screen" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><MonitorPlay size={19}/> Screen launcher</NavLink>{account?.role==='admin'&&<><div className="side-label spaced">PLATFORM</div><NavLink to="/admin" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><ShieldCheck size={19}/> Host accounts</NavLink></>}<div className="side-bottom"><span className="demo-dot"/> {account?.displayName || 'Host workspace'}<small>{account?.email}</small><button className="signout-link" onClick={()=>void logOut()}>Sign out</button></div></aside><div className="shell-main"><div className="workspace-foundry-art" aria-hidden="true"><img src={asset('home/quizforge-foundry.webp')} alt=""/></div><header className="topbar"><div className="breadcrumbs">XP Studio <span>/</span> {active || 'Overview'}</div><div className="top-actions"><span className="preview-chip"><span/> CLOUD WORKSPACE</span><Link className="text-link" to="/join">XP Play Portal <ExternalLink size={15}/></Link></div></header>{children}</div></div>
}
function Button({ children, onClick, variant = 'primary', disabled = false }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary'|'secondary'|'danger'|'ghost'; disabled?: boolean }) { return <button className={`btn ${variant}`} onClick={onClick} disabled={disabled}>{children}</button> }
function Badge({ children, tone = 'purple' }: {children: React.ReactNode; tone?: 'purple'|'green'|'amber'|'gray'}) { return <span className={`badge ${tone}`}>{children}</span> }
function PlayerAvatar({ player, packs, size = 38 }: {player: Player; packs: Pack[]; size?: number}) { return <img className="player-avatar" width={size} height={size} src={avatarSrc(player.avatarId, packs)} alt=""/> }
function useClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => { expireAnswers(); setNow(Date.now()) }
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}
function Countdown({ game, className = '' }: { game: Game; className?: string }) {
  const now = useClock(game.phase === 'open')
  if (game.phase !== 'open' || !game.closesAt) return null
  const remaining = Math.max(0, Math.ceil((game.closesAt - now) / 1000))
  const duration = currentQuestion(game)?.duration || 30
  const percent = Math.min(100, Math.max(0, remaining / duration * 100))
  return <div className={`countdown ${className} ${remaining <= 5 ? 'urgent' : ''}`} role="timer" aria-label={`${remaining} seconds remaining`}><Clock3 size={20}/><strong>{remaining}</strong><span>seconds left</span><div className="countdown-track"><i style={{width:`${percent}%`}}/></div></div>
}
function AnagramBoard({ game, question }: {game: Game; question: Question}) {
  const now = useClock(game.phase === 'open')
  const answer = String(question.answer || question.anagramSolution || '')
  const scramble = question.scramble || answer.toUpperCase()
  if (!answer) return <div className="anagram-board"><div className="anagram-label">THE JUMBLED WORD</div><div className="anagram-letters">{[...scramble].map((char,index)=><span key={index}>{char === ' ' ? '\u00a0' : char}</span>)}</div></div>
  const elapsed = game.phase === 'open' || game.phase === 'closed'
    ? Math.max(0, ((game.phase === 'closed' ? game.closedAt || now : now) - (game.openedAt || now)) / 1000)
    : 0
  const display = anagramDisplay(answer, scramble, elapsed, question.duration || 30)
  const locked = new Set(display.lockedPositions)
  const waiting = game.phase === 'open' && elapsed < 5
  return <div className="anagram-board" aria-label={`Jumbled letters: ${display.text}`}><div className="anagram-label">{waiting ? 'SOLVING STARTS IN A MOMENT' : game.phase === 'open' ? 'LETTERS ARE FALLING INTO PLACE' : game.phase === 'closed' ? 'TIME IS UP' : 'THE JUMBLED WORD'}</div><div className="anagram-letters">{[...display.text].map((char, index) => <span key={index} className={`${char === ' ' ? 'space' : ''} ${locked.has(index) ? 'locked' : ''}`}>{char === ' ' ? '\u00a0' : char}</span>)}</div><div className="anagram-progress">{waiting ? 'The jumble stays still for the first 5 seconds' : `${display.lockedCount} of ${display.positions.length} letters locked`}</div></div>
}

function QuestionMediaStage({ game, question }: { game: Game; question: Question }) {
  const now = useClock(Boolean(question.imageUrl) && game.phase === 'open')
  if (!question.imageUrl) return null
  const at = game.phase === 'closed' ? game.closedAt || now : now
  const elapsed = ['open', 'closed'].includes(game.phase) ? Math.max(0, at - (game.openedAt || at)) : 0
  const progress = game.phase === 'reveal' ? 1 : Math.min(1, elapsed / ((question.duration || 30) * 1000))
  const isReveal = question.type === 'photo-reveal'
  const isZoom = question.type === 'photo-zoom'
  const visibleTiles = game.phase === 'reveal' ? 24 : Math.floor(progress * 24)
  const scale = game.phase === 'reveal' ? 1 : 3.4 - progress * 2.4
  return <div className={`question-media ${isReveal ? 'photo-reveal' : ''} ${isZoom ? 'photo-zoom' : ''}`}>
    <img src={question.imageUrl} alt={question.imageAlt || ''} style={isZoom ? { transform: `scale(${scale})` } : undefined}/>
    {isReveal && <div className="photo-cover" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} className={index < visibleTiles ? 'gone' : ''}/>)}</div>}
    {(isReveal || isZoom) && game.phase !== 'reveal' && <span className="photo-progress">{isReveal ? `${visibleTiles} / 24 panels revealed` : 'The picture is zooming out'}</span>}
  </div>
}

function HostAnswerKey({ question }: { question: Question }) {
  return <div className="host-answer-key"><div><ShieldCheck size={19}/><span>GM ANSWER KEY <small>Visible here before reveal</small></span></div><strong>{question.answer === undefined ? 'No fixed answer — mark each response' : answerLabel(question.answer)}</strong>{question.explanation && <p>{question.explanation}</p>}</div>
}

function AnswerStage({ question, revealed }: { question: Question; revealed: boolean }) {
  const choices = question.type === 'boolean' ? ['True', 'False'] : ['single', 'multi'].includes(question.type) ? question.options : undefined
  const correct = Array.isArray(question.answer) ? question.answer.map(String) : [answerLabel(question.answer)]
  if (choices?.length) return <div className={`screen-options ${revealed ? 'is-revealed' : ''}`}>{choices.map((choice, index) => {
    const isCorrect = revealed && correct.includes(choice)
    return <div key={choice} className={`option-${index} ${revealed ? isCorrect ? 'correct' : 'not-correct' : ''}`} style={{animationDelay: revealed ? `${index * 95}ms` : undefined}}><b>{'ABCD'[index] || index + 1}</b><span>{choice}</span>{isCorrect && <Check size={29} className="option-check" aria-label="Correct"/>}</div>
  })}</div>
  if (!revealed) return null
  const entries = question.answer && typeof question.answer === 'object' && !Array.isArray(question.answer)
    ? Object.entries(question.answer).map(([key, value]) => `${key} → ${value}`)
    : Array.isArray(question.answer) ? question.answer.map(String) : question.answer === undefined ? ['The Host is marking the answers'] : [answerLabel(question.answer)]
  return <div className="reveal-stage" aria-label="Correct answer"><span className="reveal-kicker">✦ ANSWER REVEALED ✦</span><div className="reveal-tiles">{entries.map((entry, index) => <div className="reveal-tile" key={`${entry}-${index}`} style={{animationDelay: `${index * 110}ms`}}><span>{String(index + 1).padStart(2, '0')}</span><strong>{entry}</strong><Check size={24}/></div>)}</div></div>
}

function PlayerReveal({ question, response, result }: { question: Question; response: Game['responses'][number] | undefined; result: OwnResult | null }) {
  const title = !result ? 'Checking your result…' : result.verdict === 'correct' ? 'You got it!' : result.verdict === 'partial' ? 'Partly right!' : result.verdict === 'pending' ? 'Host marking in progress' : 'Not this time'
  return <div className={`player-reveal ${result?.verdict || 'pending'}`} role="status"><span className="player-reveal-icon">{result?.verdict === 'correct' ? '✓' : result?.verdict === 'partial' ? '◐' : result?.verdict === 'incorrect' ? '×' : '✦'}</span><h2>{title}</h2><div className="player-reveal-detail"><small>YOUR ANSWER</small><strong>{answerLabel(response?.value)}</strong></div>{question.answer !== undefined && <div className="player-reveal-detail"><small>CORRECT ANSWER</small><strong>{answerLabel(question.answer)}</strong></div>}{question.explanation && <p>{question.explanation}</p>}{result && result.verdict !== 'pending' && <div className="player-reveal-points">{result.points.toLocaleString()} <span>points for this question</span></div>}</div>
}

function Home() {
  const nav = useNavigate()
  const showcaseAvatars = [
    ['avatars/platypus/astronaut.png', 'Astronaut platypus'],
    ['avatars/sci-fi/hologram.png', 'Hologram avatar'],
    ['avatars/retro-arcade/laser-dj.png', 'Laser DJ avatar'],
    ['avatars/fantasy/wizard.png', 'Wizard avatar'],
    ['avatars/animals/fox.png', 'Fox avatar'],
    ['avatars/heroes-villains/flying-hero.png', 'Flying hero avatar'],
  ]
  return <div className="home">
    <section className="home-stage">
      <picture className="home-stage-picture" aria-hidden="true">
        <source media="(max-width: 760px)" srcSet={asset('brand/xp-family-environment-mobile.webp')}/>
        <img src={asset('brand/xp-family-environment.webp')} alt=""/>
      </picture>
      <div className="home-stage-shade"/>
      <div className="home-nav"><Logo/><div><Link to="/organiser">Explore workspace</Link><Link to="/join" className="nav-join">Join a game <ArrowRight size={15}/></Link></div></div>
      <main className="home-main">
        <div className="home-copy">
          <div className="eyebrow"><span/> CREATE. HOST. PLAY.</div>
          <h1>Quiz night,<br/><em>built together.</em></h1>
          <p>Build brilliant rounds, bring everyone in with a code, and run the whole room from one calm host console.</p>
          <div className="home-buttons"><Button onClick={() => nav('/host')}><Play size={18}/> Host a Game</Button><Button variant="secondary" onClick={() => nav('/join')}><Users size={18}/> Join a Game</Button></div>
          <div className="home-proof"><div><strong>{questionTypes.length}</strong><span>question formats</span></div><div><strong>A cast</strong><span>of themed avatars</span></div><div><strong>Live</strong><span>across every screen</span></div></div>
        </div>
        <div className="home-art">
          <img className="art-confetti" src={asset('home/pixel-confetti.webp')} alt=""/>
          <div className="art-glow"/>
          <img className="art-platypus" src={asset('home/quizshow-host-platypus.webp')} alt="XP Studio quiz-show host platypus holding a microphone and cue cards"/>
          <div className="floating-card floating-live"><span className="live-pip"/><span>THE ROOM IS READY<strong>Players join with one code</strong></span></div>
          <div className="floating-card floating-score"><Trophy size={18}/><span>ROUND SCORES<strong>Updated live</strong></span></div>
        </div>
      </main>
      <div className="home-scroll-cue"><span/> EXPLORE XP STUDIO</div>
    </section>

    <section className="home-roster" aria-label="XP Studio avatar collection">
      <div className="home-roster-copy"><span>CHOOSE YOUR PLAYER</span><strong>A whole cast is waiting.</strong></div>
      <div className="home-avatar-line">
        {showcaseAvatars.map(([src, alt], index) => <div key={src} style={{'--avatar-index': index} as React.CSSProperties}><img src={asset(src)} alt={alt}/></div>)}
      </div>
      <span className="home-roster-count">A CHARACTER FOR EVERY PLAYER</span>
    </section>

    <section className="home-foundry" aria-labelledby="foundry-title">
      <div className="home-foundry-copy"><div className="eyebrow"><span/> INSIDE XP STUDIO</div><h2 id="foundry-title">Built like a show.<br/><em>Run like a machine.</em></h2><p>Every part of quiz night moves together: the Host fires the controls, XP Play carries the action, and the Main Screen makes the room erupt.</p></div>
      <div className="foundry-machine">
        <img src={asset('home/quizforge-foundry.webp')} alt="8-bit XP Studio foundry with glowing furnaces, pipes and quiz displays"/>
        <div className="foundry-readout foundry-readout-a"><strong>{questionTypes.length}</strong><span>QUESTION<br/>FORMATS</span></div>
        <div className="foundry-readout foundry-readout-b"><strong>{quizThemeIds.length}</strong><span>VISUAL<br/>THEMES</span></div>
        <div className="foundry-readout foundry-readout-c"><strong>LIVE</strong><span>EVERY SCREEN<br/>IN SYNC</span></div>
      </div>
    </section>

    <section className="home-experience">
      <div className="home-section-heading"><div className="eyebrow"><span/> BUILT FOR THE WHOLE ROOM</div><h2>One game.<br/><em>Every screen in sync.</em></h2><p>The host drives the show. The big screen brings the drama. Every phone becomes a personal controller.</p></div>
      <div className="home-experience-grid">
        <article className="home-experience-card host-card"><div className="experience-number">01</div><div><span>THE HOST</span><h3>Command the room</h3><p>Open answers, mark responses, reveal results and move every connected device forward.</p></div><img src={asset('avatars/platypus/engineer.png')} alt="Engineer platypus representing the host console"/></article>
        <article className="home-experience-card screen-card"><div className="experience-number">02</div><div><span>THE MAIN SCREEN</span><h3>Make every reveal land</h3><p>Questions, timers, answers and scoreboards become a show everyone can follow.</p></div><img src={asset('avatars/sci-fi/hologram.png')} alt="Hologram character representing the main presentation screen"/></article>
        <article className="home-experience-card player-card"><div className="experience-number">03</div><div><span>THE PLAYERS</span><h3>Join. Answer. Celebrate.</h3><p>Scan once, enter a code and answer from any phone with no player account needed.</p></div><img src={asset('avatars/retro-arcade/game-show-host.png')} alt="Retro game-show avatar representing players"/></article>
      </div>
    </section>

    <section className="home-formats">
      <div className="home-format-copy"><span className="format-kicker">MORE THAN MULTIPLE CHOICE</span><h2>Build rounds that keep changing the game.</h2><p>Mix classic answers with anagrams, ordering, matching, number challenges and dramatic photo reveals. Every format tells players exactly what to do.</p><Link to="/organiser" className="home-inline-link">Explore the quiz builder <ArrowRight size={17}/></Link></div>
      <div className="home-format-stack" aria-label="Example question types"><div className="format-card format-orange"><small>FASTEST FINGER</small><strong>Multiple choice</strong><span>A</span></div><div className="format-card format-cyan"><small>PICTURE ROUND</small><strong>Photo reveal</strong><span>?</span></div><div className="format-card format-magenta"><small>WORD PLAY</small><strong>Anagram</strong><span>QF</span></div></div>
    </section>

    <section className="home-capabilities">
      <div><strong>Live room sync</strong><span>Every screen follows the Host automatically.</span></div>
      <div><strong>Flexible rounds</strong><span>Mix question types and score each round together.</span></div>
      <div><strong>Built-in timers</strong><span>Accurate countdowns without constant cloud writes.</span></div>
      <div><strong>Dramatic reveals</strong><span>Answers, photos and results arrive at the right moment.</span></div>
      <div><strong>Smart scoreboards</strong><span>Round points roll cleanly into the full leaderboard.</span></div>
      <div><strong>No player account</strong><span>Open the portal, enter a code and start playing.</span></div>
    </section>

    <section className="home-final-cta">
      <img className="home-final-confetti" src={asset('home/pixel-confetti.webp')} alt=""/>
      <div><span>READY WHEN YOU ARE</span><h2>Step up and host the show.</h2><p>Create your quiz, start a session and let the room join in.</p><div className="home-buttons"><Button onClick={() => nav('/host')}><Play size={18}/> Host a Game</Button><Button variant="secondary" onClick={() => nav('/join')}><Users size={18}/> Join a Game</Button></div></div>
      <img className="home-final-host" src={asset('home/quizshow-host-platypus.webp')} alt="XP Studio host platypus"/>
    </section>

    <footer className="home-footer"><Logo/><span>Create. Host. Play.</span><small>XP Studio · XP Play · by Shared XP</small></footer>
  </div>
}
function Organiser() {
  const game = useGame(), library = useQuizLibrary(), packs = usePacks(), nav = useNavigate()
  const [cloudStatus, setCloudStatus] = useState('Loading your cloud quiz library…')
  const [cloudBusy, setCloudBusy] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const connectCloud = async () => {
    setCloudBusy(true)
    setCloudStatus('Loading your cloud quiz library…')
    try {
      const quizzes = await syncQuizLibrary(library.quizzes, false)
      replaceQuizLibrary(quizzes)
      setCloudStatus('Cloud library synced')
    } catch (error) {
      setCloudStatus(`Cloud sync failed: ${(error as Error).message}`)
    } finally { setCloudBusy(false) }
  }
  useEffect(() => {
    let active = true
    void connectCloud().catch(() => { if (active) setCloudStatus('Cloud library could not be loaded') })
    return () => { active = false }
  // The initial browser cache is intentionally captured once, then Firestore is authoritative.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const makeQuiz = async () => {
    createQuiz()
    const quiz = getActiveQuizTemplate()
    try { if (quiz) await saveQuizTemplateCloud(quiz) }
    catch (error) { setCloudStatus(`New quiz saved in this browser; cloud sync failed: ${(error as Error).message}`) }
    nav('/editor')
  }
  const openQuiz = (id: string, destination: '/editor' | '/host') => { if (id !== library.activeQuizId) selectQuiz(id); nav(destination) }
  const copyQuiz = async (id: string) => {
    const quiz = duplicateQuiz(id)
    try { await saveQuizTemplateCloud(quiz) } catch (error) { setCloudStatus(`Copy saved in browser; cloud sync failed: ${(error as Error).message}`) }
    nav('/editor')
  }
  const removeQuiz = async (id: string) => {
    if (!confirm('Delete this quiz? This cannot be undone.')) return
    setCloudBusy(true)
    setCloudStatus('Deleting quiz from your cloud library…')
    try {
      await deleteQuizTemplateCloud(id)
      deleteQuiz(id)
      setCloudStatus('Quiz deleted from your cloud library')
    } catch (error) { setCloudStatus(`Quiz could not be deleted: ${(error as Error).message}`) }
    finally { setCloudBusy(false) }
  }
  const chooseTheme = async (id: string, theme: QuizTheme) => {
    try {
      const quiz = setQuizTheme(id, theme)
      await saveQuizTemplateCloud(quiz)
      setCloudStatus(`Theme set to ${quizThemes[theme].name}`)
    } catch (error) { setCloudStatus(`Theme change failed: ${(error as Error).message}`) }
  }
  const exportQuiz = (quiz: QuizTemplate) => {
    const payload = JSON.stringify({ format: 'xp-studio-pack', version: 2, exportedAt: new Date().toISOString(), quiz: { title: quiz.title, theme: quiz.theme, roundThemes: quiz.roundThemes || {}, questions: quiz.questions } }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${quiz.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'quiz'}.xpstudio.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  const importQuizPack = async (file?: File) => {
    if (!file) return
    setCloudBusy(true)
    try {
      const pack = readQuizPack(await file.text())
      const quiz = importQuiz(pack.title, pack.questions, pack.theme, pack.roundThemes)
      try { await saveQuizTemplateCloud(quiz); setCloudStatus(`Imported “${quiz.title}” and saved it to your cloud library`) }
      catch (error) { setCloudStatus(`Imported “${quiz.title}” in this browser; cloud sync failed: ${(error as Error).message}`) }
      nav('/editor')
    } catch (error) { setCloudStatus(`Import failed: ${(error as Error).message}`) }
    finally { setCloudBusy(false); if (importInput.current) importInput.current.value = '' }
  }
  return <Shell active="Overview"><main className="page">
    <div className="page-heading"><div><div className="eyebrow dark">ORGANISER WORKSPACE</div><h1>Good evening, quizmaster.</h1><p>Start from scratch, or use the protected XP Studio test pack for a connection check.</p><span className={`cloud-status ${cloudStatus==='Cloud library synced'?'ready':''}`}><ShieldCheck size={14}/>{cloudStatus}</span></div><div className="host-head-actions"><input ref={importInput} hidden type="file" accept=".json,.xpstudio.json,.quizforge.json,application/json" onChange={event=>void importQuizPack(event.target.files?.[0])}/><Button variant="secondary" onClick={()=>importInput.current?.click()} disabled={cloudBusy}><Upload size={17}/> Import quiz pack</Button><Button onClick={()=>void makeQuiz()}><Plus size={18}/> Start new quiz</Button></div></div>
    <div className="stats-grid"><div className="stat"><span>QUIZZES</span><strong>{library.quizzes.length}</strong><small>Private cloud library</small></div><div className="stat"><span>ACTIVE QUIZ</span><strong>{game.phase === 'lobby' ? 'Ready' : 'Live'}</strong><small>{game.title}</small></div><div className="stat"><span>PLAYERS</span><strong>{game.players.length}</strong><small>In this session</small></div></div>
    <div className="section-title"><h2>Quiz library</h2><span>{library.quizzes.length} {library.quizzes.length === 1 ? 'quiz' : 'quizzes'}</span></div>
    <div className="quiz-library">{library.quizzes.map(quiz => {
      const rounds = new Set(quiz.questions.map(question => question.round)).size
      const selected = quiz.id === library.activeQuizId
      const theme = quiz.theme || 'quiz-show'
      return <div className={`quiz-card ${selected ? 'selected-quiz' : ''}`} key={quiz.id}><div className={`quiz-cover theme-${theme}`} style={{...themeSurfaceStyle(theme),backgroundImage:`linear-gradient(#080b1370,#080b1370),url(${asset(`themes/${theme}/background.webp`)})`}}><small>{quiz.builtIn?'STARTER QUIZ PACK':'THEME PREVIEW'}</small><strong>{quizThemes[theme].name}</strong><span>Question One</span></div><div className="quiz-details"><div className="quiz-badges"><Badge tone={selected?'green':'gray'}>{selected?'SELECTED':'READY'}</Badge><Badge>{quizThemes[theme].name}</Badge>{quiz.builtIn&&<Badge tone="amber">STARTER PACK</Badge>}</div><h3>{quiz.title}</h3><p>{rounds} {rounds === 1 ? 'round' : 'rounds'} · {quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'}</p><label className="quiz-theme-quick"><span>DEFAULT QUIZ THEME</span><select value={theme} onChange={event=>void chooseTheme(quiz.id,event.target.value as QuizTheme)} disabled={cloudBusy}>{quizThemeIds.map(themeId=><option key={themeId} value={themeId}>{quizThemes[themeId].name}</option>)}</select><small>Styles XP Play and the Main Screen.</small></label><div className="quiz-card-actions"><Button onClick={() => openQuiz(quiz.id,'/host')}><Play size={17}/> Host this quiz</Button>{!quiz.builtIn&&<Button variant="secondary" onClick={() => openQuiz(quiz.id,'/editor')}><Edit3 size={16}/> Edit quiz</Button>}<Button variant="ghost" onClick={()=>exportQuiz(quiz)}><Download size={15}/> Export</Button><Button variant="ghost" onClick={()=>void copyQuiz(quiz.id)}><Copy size={15}/>{quiz.builtIn?'Copy to edit':'Duplicate'}</Button>{!quiz.builtIn&&<Button variant="danger" disabled={cloudBusy} onClick={()=>void removeQuiz(quiz.id)}><Trash2 size={15}/> Delete</Button>}</div></div></div>
    })}</div>
    <div className="section-title lower"><h2>Workspace tools</h2></div><div className="feature-grid"><Link to="/join" className="feature-card"><div className="feature-icon lilac"><Users size={21}/></div><h3>XP Play Portal</h3><p>The permanent player page people bookmark, scan and use to enter each game code.</p><span>Open XP Play <ArrowRight size={16}/></span></Link><Link to="/screen" className="feature-card"><div className="feature-icon coral"><MonitorPlay size={21}/></div><h3>Screen launcher</h3><p>Enter a live session code to load its presentation on any display.</p><span>Open screen launcher <ArrowRight size={16}/></span></Link><div className="feature-card"><div className="feature-icon mint"><Sparkles size={21}/></div><h3>Avatar collection</h3><p>{packs.reduce((total,pack) => total+pack.avatars.length,0)} characters across {packs.length} avatar packs.</p><span>Available to every player <Check size={16}/></span></div></div>
  </main></Shell>
}
function Editor() {
  const game = useGame(), library = useQuizLibrary(), nav = useNavigate(), [selected, setSelected] = useState(0), [draft, setDraft] = useState(game.questions[0]), [titleDraft, setTitleDraft] = useState(game.title), [themeDraft, setThemeDraft] = useState<QuizTheme>(game.theme || 'quiz-show'), [roundThemeDraft, setRoundThemeDraft] = useState<QuizTheme | ''>(game.roundThemes?.[game.questions[0]?.round] || ''), [saved, setSaved] = useState(false), [validation, setValidation] = useState(''), [imageBusy, setImageBusy] = useState(false)
  useEffect(() => { setDraft(game.questions[selected] || game.questions[0]); setSaved(false) }, [selected, game.questions])
  useEffect(() => { setTitleDraft(game.title); setThemeDraft(game.theme || 'quiz-show') }, [game.title, game.theme])
  useEffect(() => { setRoundThemeDraft(game.roundThemes?.[game.questions[selected]?.round] || '') }, [selected, game.questions, game.roundThemes])
  const activeTemplate = library.quizzes.find(quiz => quiz.id === library.activeQuizId)
  const copyStarter = async () => {
    if (!activeTemplate) return
    const quiz = duplicateQuiz(activeTemplate.id)
    try { await saveQuizTemplateCloud(quiz) }
    catch (error) { setValidation(`Copy saved in this browser, but cloud sync failed: ${(error as Error).message}`) }
    nav('/editor')
  }
  if (activeTemplate?.builtIn) return <Shell active="Quiz editor"><main className="page editor-page"><div className="page-heading"><div><div className="eyebrow dark">QUIZ EDITOR</div><h1>{game.title}</h1><p>The built-in test quiz stays unchanged so it is always available for connection tests.</p></div></div><div className="editor-locked"><ShieldCheck size={34}/><h2>Keep the test quiz as your baseline</h2><p>Create an editable copy containing all {game.questions.length} existing questions, then change its title, rounds, formats and answers.</p><Button onClick={()=>void copyStarter()}><Copy size={17}/> Copy test quiz to edit</Button></div></main></Shell>
  if (!draft) return null
  const roundNames = [...new Set(game.questions.map(question => question.round))]
  const originalRound = game.questions[selected]?.round || draft.round
  const roundQuestionCount = game.questions.filter(question => question.round === originalRound).length
  const save = async () => {
    const word = String(draft.answer || '').trim()
    if (!titleDraft.trim()) { setValidation('Enter a quiz name.'); return }
    const invalid = validateQuestionDraft(draft)
    if (invalid) { setValidation(invalid); return }
    const mediaSize = game.questions.reduce((total, question, index) => total + (index === selected ? draft.imageUrl?.length || 0 : question.imageUrl?.length || 0), 0)
    if (mediaSize > 650_000) { setValidation('This quiz contains too much uploaded image data. Use hosted image URLs or remove an image.'); return }
    const prepared = draft.type === 'anagram' ? {...draft, round: draft.round.trim(), answer: word, duration: Math.max(10, draft.duration || 30), scramble: scrambleWord(word)} : {...draft, round: draft.round.trim()}
    update(gameDraft => {
      gameDraft.title = titleDraft.trim()
      gameDraft.theme = themeDraft
      gameDraft.questions[selected] = prepared
      const roundThemes = { ...(gameDraft.roundThemes || {}) }
      if (roundThemeDraft) roundThemes[prepared.round] = roundThemeDraft
      else delete roundThemes[prepared.round]
      gameDraft.roundThemes = roundThemes
    })
    const template = getActiveQuizTemplate()
    try {
      if (template) await saveQuizTemplateCloud(template)
      setValidation('')
    } catch (error) {
      setValidation(`Saved in this browser, but cloud sync failed: ${(error as Error).message}`)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }
  const duplicate = () => {
    const nextIndex = selected + 1
    update(gameDraft => { gameDraft.questions.splice(nextIndex, 0, { ...structuredClone(draft), id: crypto.randomUUID(), prompt: 'New question' }) })
    setSelected(nextIndex)
  }
  const addQuestion = () => {
    const nextIndex = game.questions.length
    const question: Question = { id: crypto.randomUUID(), round: draft.round || 'ROUND 1', type: 'single', prompt: 'New question', options: ['Answer A', 'Answer B', 'Answer C', 'Answer D'], answer: 'Answer A', points: 1000, scoreMode: 'fixed', duration: 30 }
    update(gameDraft => { gameDraft.questions.push(question) })
    setSelected(nextIndex)
  }
  const deleteQuestion = () => {
    if (game.questions.length <= 1 || !confirm('Delete this question from the quiz?')) return
    update(gameDraft => { gameDraft.questions.splice(selected, 1); gameDraft.questionIndex = Math.min(gameDraft.questionIndex, gameDraft.questions.length - 1) })
    setSelected(Math.max(0, selected - 1))
  }
  const renameRound = () => {
    const nextName = draft.round.trim()
    if (!nextName) { setValidation('Enter the new round name first.'); return }
    update(gameDraft => {
      for (const question of gameDraft.questions) if (question.round === originalRound) question.round = nextName
      if (gameDraft.roundThemes?.[originalRound]) {
        gameDraft.roundThemes[nextName] = gameDraft.roundThemes[originalRound]
        if (nextName !== originalRound) delete gameDraft.roundThemes[originalRound]
      }
    })
    setValidation('')
    setSaved(true)
  }
  const move = (direction: -1 | 1) => {
    const nextIndex = selected + direction
    if (nextIndex < 0 || nextIndex >= game.questions.length) return
    update(gameDraft => { [gameDraft.questions[selected], gameDraft.questions[nextIndex]] = [gameDraft.questions[nextIndex], gameDraft.questions[selected]] })
    setSelected(nextIndex)
  }
  const chooseImage = async (file?: File) => {
    if (!file) return
    setImageBusy(true)
    setValidation('')
    try {
      const imageUrl = await compressQuestionImage(file)
      setDraft(current => ({ ...current, imageUrl, imageAlt: current.imageAlt || file.name.replace(/\.[^.]+$/, '') }))
    }
    catch (error) { setValidation((error as Error).message) }
    finally { setImageBusy(false) }
  }
  const previewTheme = roundThemeDraft || themeDraft
  return <Shell active="Quiz editor"><main className="page editor-page">
    <div className="page-heading"><div><div className="eyebrow dark">QUIZ EDITOR</div><h1>{game.title}</h1><p>Name rounds, mix question types, and add optional picture stages.</p></div><Button onClick={addQuestion}><Plus size={17}/> Add question</Button></div>
    <div className="editor-grid">
      <div className="editor-list"><div className="editor-list-head"><strong>Questions</strong><span>{roundNames.length} rounds · {game.questions.length} questions</span></div>{game.questions.map((question,index) => <button key={question.id} className={`question-row ${selected===index?'chosen':''}`} onClick={() => setSelected(index)}><span className="question-number">{String(index+1).padStart(2,'0')}</span><span><strong>{question.prompt}</strong><small>{question.round} · {typeNames[question.type]}</small></span></button>)}</div>
      <div className="editor-form">
        <div className="form-top"><div><Badge>{draft.round}</Badge><h2>Question {selected+1}</h2></div><Badge tone="gray">{effectiveScoreMode(draft)==='time'?'Up to ':''}{draft.points} points</Badge></div>
        <div className="editor-identity-row"><label>Quiz name<input value={titleDraft} onChange={event=>setTitleDraft(event.target.value)} placeholder="My brilliant quiz"/></label><label>Default quiz theme<select value={themeDraft} onChange={event=>setThemeDraft(event.target.value as QuizTheme)}>{quizThemeIds.map(theme=><option key={theme} value={theme}>{quizThemes[theme].name}</option>)}</select><small className="field-help">Used by the whole quiz unless a round overrides it.</small></label></div>
        <div className={`theme-picker theme-${previewTheme}`} style={themeSurfaceStyle(previewTheme)}><div><small>{roundThemeDraft?'ROUND THEME OVERRIDE':'QUIZ DEFAULT THEME'}</small><strong>{quizThemes[previewTheme].name}</strong><span className="theme-font-preview">Question One · Ready to Play?</span><span>{quizThemes[previewTheme].description}</span></div></div>
        <div className="editor-round-card"><div><small>ROUND</small><strong>{originalRound}</strong><span>{roundQuestionCount} {roundQuestionCount === 1 ? 'question' : 'questions'} scored together</span></div><Button variant="secondary" onClick={renameRound} disabled={draft.round.trim() === originalRound}>Rename whole round</Button></div>
        <div className="editor-round-row">
          <label>Assign to round<select value={roundNames.includes(draft.round) ? draft.round : '__custom'} onChange={event => { if (event.target.value !== '__custom') { const round = event.target.value; setDraft({...draft,round}); setRoundThemeDraft(game.roundThemes?.[round] || '') } }}>{roundNames.map(name=><option key={name} value={name}>{name}</option>)}<option value="__custom">New round…</option></select></label>
          <label>Round name<input value={draft.round} onChange={event=>setDraft({...draft,round:event.target.value})} placeholder="ROUND 1 · WARM UP"/><small className="field-help">Questions with the same name form one round.</small></label>
        </div>
        <label className="editor-round-theme">Round visual theme<select value={roundThemeDraft} onChange={event=>setRoundThemeDraft(event.target.value as QuizTheme | '')}><option value="">Use quiz default · {quizThemes[themeDraft].name}</option>{quizThemeIds.map(theme=><option key={theme} value={theme}>{quizThemes[theme].name}</option>)}</select><small className="field-help">Applies to every question in {draft.round || 'this round'}. Leave on default to match the rest of the quiz.</small></label>
        <label>Question type<select value={draft.type} onChange={event=>setDraft(changeQuestionType(draft,event.target.value as QuestionType))}>{questionTypes.map(type=><option key={type} value={type}>{typeNames[type]}</option>)}</select></label>
        <label>Question prompt<textarea value={draft.prompt} onChange={event=>setDraft({...draft,prompt:event.target.value})}/></label>
        <div className="media-editor"><div className="media-editor-head"><div><strong>Question image</strong><span>Optional for every format; required for photo reveal and zoom.</span></div>{draft.imageUrl&&<button onClick={()=>setDraft({...draft,imageUrl:undefined,imageAlt:undefined})}><Trash2 size={15}/> Remove</button>}</div><label>Image URL<input value={draft.imageUrl?.startsWith('data:') ? '' : draft.imageUrl || ''} placeholder="https://…" onChange={event=>setDraft({...draft,imageUrl:event.target.value})}/></label><label className="image-upload"><ImagePlus size={18}/>{imageBusy?'Preparing image…':'Upload and compress image'}<input type="file" accept="image/*" disabled={imageBusy} onChange={event=>void chooseImage(event.target.files?.[0])}/></label>{draft.imageUrl&&<div className="media-preview"><img src={draft.imageUrl} alt={draft.imageAlt || 'Question preview'}/></div>}<label>Image description<input value={draft.imageAlt || ''} onChange={event=>setDraft({...draft,imageAlt:event.target.value})} placeholder="Describe the image for accessibility"/></label><small className="field-help">Uploads are compressed in your browser. Hosted image URLs keep large quizzes smaller.</small></div>
        {draft.options && ['single','multi'].includes(draft.type) && <label>Answer options<div className="option-edit">{draft.options.map((option,index)=><div className="option-edit-row" key={index}><input value={option} onChange={event=>{const options=draft.options?.map((value,itemIndex)=>itemIndex===index?event.target.value:value);const answer=draft.type==='single'&&draft.answer===option?event.target.value:draft.type==='multi'&&Array.isArray(draft.answer)?draft.answer.map(value=>value===option?event.target.value:value):draft.answer;setDraft({...draft,options,answer})}}/><button type="button" aria-label={`Remove option ${index+1}`} disabled={(draft.options?.length||0)<=2} onClick={()=>{const options=draft.options?.filter((_,itemIndex)=>itemIndex!==index);const answer=draft.type==='single'&&draft.answer===option?options?.[0]||'':draft.type==='multi'&&Array.isArray(draft.answer)?draft.answer.filter(value=>value!==option):draft.answer;setDraft({...draft,options,answer})}}><Trash2 size={15}/></button></div>)}<button className="option-add" type="button" onClick={()=>setDraft({...draft,options:[...(draft.options||[]),`Answer ${(draft.options?.length||0)+1}`]})}><Plus size={15}/> Add option</button></div></label>}
        {draft.type==='single'&&<label>Correct answer<select value={String(draft.answer||'')} onChange={event=>setDraft({...draft,answer:event.target.value})}>{draft.options?.map(option=><option key={option}>{option}</option>)}</select></label>}
        {draft.type==='multi'&&<label>Correct answers<input value={Array.isArray(draft.answer)?draft.answer.join(', '):''} onChange={event=>setDraft({...draft,answer:event.target.value.split(',').map(value=>value.trim()).filter(Boolean)})} placeholder="Answer A, Answer C"/><small className="field-help">Separate correct options with commas.</small></label>}
        {draft.type==='boolean'&&<label>Correct answer<select value={String(Boolean(draft.answer))} onChange={event=>setDraft({...draft,answer:event.target.value==='true'})}><option value="true">True</option><option value="false">False</option></select></label>}
        {['number','closest'].includes(draft.type)&&<label>Correct number<input type="number" value={Number(draft.answer||0)} onChange={event=>setDraft({...draft,answer:Number(event.target.value)})}/></label>}
        {draft.type==='ordering'&&<label>Items in the correct order<textarea value={(draft.items||[]).join('\n')} onChange={event=>{const items=event.target.value.split('\n').map(value=>value.trim()).filter(Boolean);setDraft({...draft,items,answer:items})}}/><small className="field-help">Enter one item per line, earliest or first at the top.</small></label>}
        {['matching','categorise'].includes(draft.type)&&<><label>Items<textarea value={(draft.items||[]).join('\n')} onChange={event=>setDraft({...draft,items:event.target.value.split('\n').map(value=>value.trim()).filter(Boolean)})}/></label><label>{draft.type==='matching'?'Available matches':'Categories'}<textarea value={(draft.type==='matching'?draft.options||[]:draft.categories||[]).join('\n')} onChange={event=>{const values=event.target.value.split('\n').map(value=>value.trim()).filter(Boolean);setDraft(draft.type==='matching'?{...draft,options:values}:{...draft,categories:values})}}/></label><label>Correct pairs<textarea value={draft.answer&&typeof draft.answer==='object'&&!Array.isArray(draft.answer)?Object.entries(draft.answer).map(([item,value])=>`${item} = ${value}`).join('\n'):''} onChange={event=>{const answer=Object.fromEntries(event.target.value.split('\n').map(line=>line.split('=').map(value=>value.trim())).filter(pair=>pair.length===2&&pair[0]&&pair[1]));setDraft({...draft,answer})}}/><small className="field-help">Use one pair per line, for example France = Paris.</small></label></>}
        {draft.type==='list'&&<label>Expected answers<textarea value={Array.isArray(draft.answer)?draft.answer.join('\n'):''} onChange={event=>setDraft({...draft,answer:event.target.value.split('\n').map(value=>value.trim()).filter(Boolean)})}/><small className="field-help">Enter one accepted list item per line.</small></label>}
        {draft.type==='anagram'&&<label>Word or phrase to scramble<input value={String(draft.answer||'')} onChange={event=>setDraft({...draft,answer:event.target.value})} placeholder="e.g. Platypus"/><small className="field-help">The same jumble is shown to every player. Minimum timer: 10 seconds.</small></label>}
        {draft.type==='text'&&<label>Accepted answers<input value={Array.isArray(draft.answer)?draft.answer.join(', '):String(draft.answer||'')} onChange={event=>setDraft({...draft,answer:event.target.value.split(',').map(value=>value.trim()).filter(Boolean)})} placeholder="Edinburgh, Edinburgh City"/><small className="field-help">Separate alternative accepted answers with commas.</small></label>}
        {['photo-reveal','photo-zoom'].includes(draft.type)&&<label>Correct answer<input value={String(draft.answer||'')} onChange={event=>setDraft({...draft,answer:event.target.value})} placeholder="Answer players should type"/></label>}
        <label>Answer explanation (optional)<textarea value={draft.explanation || ''} onChange={event=>setDraft({...draft,explanation:event.target.value})} placeholder="Shown after the answer is revealed."/></label>
        {validation&&<div className="error">{validation}</div>}
        <div className="form-two"><label>{effectiveScoreMode(draft)==='time'?'Maximum points':'Points'}<input type="number" value={draft.points} onChange={event=>setDraft({...draft,points:Number(event.target.value)})}/></label><label>Timer (seconds)<input type="number" value={draft.duration || 30} onChange={event=>setDraft({...draft,duration:Number(event.target.value)})}/></label></div>
        <div className="score-mode-editor"><div><strong>Scoring mode</strong><span>Choose whether every correct answer earns the same score or faster answers earn more.</span></div><div className="score-mode-buttons"><button type="button" className={effectiveScoreMode(draft)==='fixed'?'selected':''} onClick={()=>setDraft({...draft,scoreMode:'fixed'})}><b>Fixed</b><small>Full points for every correct answer</small></button><button type="button" className={effectiveScoreMode(draft)==='time'?'selected':''} onClick={()=>setDraft({...draft,scoreMode:'time'})}><b>Speed</b><small>100% at opening, falling to 50%</small></button></div></div>
        <div className="editor-note"><CircleHelp size={18}/> A round can contain any number and mix of question types. XP Studio shows round scores after the final consecutive question in that round, then carries those points into the overall leaderboard.</div>
        <div className="editor-order-actions"><Button variant="secondary" onClick={duplicate}><Plus size={16}/> Duplicate</Button><Button variant="secondary" disabled={selected===0} onClick={()=>move(-1)}>Move up</Button><Button variant="secondary" disabled={selected===game.questions.length-1} onClick={()=>move(1)}>Move down</Button><Button variant="danger" disabled={game.questions.length<=1} onClick={deleteQuestion}><Trash2 size={15}/> Delete</Button></div>
        <div className="form-actions"><Button onClick={()=>void save()}>{saved?<><Check size={17}/> Saved</>:<>Save question <ArrowRight size={17}/></>}</Button><Link className="text-link" to="/host">Go to Host <ArrowRight size={16}/></Link></div>
      </div>
    </div>
  </main></Shell>
}
const phaseNames: Record<string,string> = {lobby:'Lobby', 'round-intro':'Round introduction', question:'Question display', open:'Answers open', closed:'Answers closed', reveal:'Answer reveal', scores:'Question scores', 'round-scores':'Round scores', leaderboard:'Overall leaderboard', final:'Final leaderboard', thanks:'Thank you', break:'Break', 'closed-game':'Session closed'}
function friendlyAuthError(error: unknown) {
  const detail = error as { code?: string; message?: string }
  if (detail.code === 'auth/popup-blocked') return 'Your browser blocked Google sign-in. Allow popups for XP Studio and try again.'
  if (detail.code === 'auth/popup-closed-by-user') return 'Google sign-in closed before it finished. Try again and leave the sign-in window open.'
  if (detail.code === 'auth/cancelled-popup-request') return 'Another sign-in attempt is already open. Finish it, then try again.'
  return detail.message || 'Google sign-in could not be completed.'
}
function Host() {
  const game = useGame(), packs = usePacks(), q = currentQuestion(game), [copied,setCopied]=useState<'screen'|'portal'|''>('')
  const [liveStatus, setLiveStatus] = useState(''), [canControl, setCanControl] = useState(false), [liveBusy, setLiveBusy] = useState(false)
  const [endedCode, setEndedCode] = useState('')
  const stopLive = useRef<(() => void) | null>(null)
  const answered = q ? game.responses.filter(r=>r.questionId===q.id) : []
  const next = actionLabel(game.phase)
  const liveConnected = getLiveRole() === 'host'
  const portalUrl = `${location.origin}${location.pathname}#/join`
  const screenUrl = `${location.origin}${location.pathname}#/screen/${game.code}`
  const copy = async (kind: 'screen' | 'portal') => {
    await navigator.clipboard.writeText(kind === 'screen' ? screenUrl : portalUrl)
    setCopied(kind)
    setTimeout(()=>setCopied(''),1800)
  }
  const startLive = async () => {
    if (liveBusy) return
    setLiveBusy(true)
    try {
      setLiveStatus('Preparing live session…')
      stopLive.current?.()
      leaveLiveRole('host')
      setCanControl(false)
      stopLive.current = await startLiveHost((message, control) => { setLiveStatus(message); setCanControl(control) }, false)
    }
    catch (error) {
      setLiveStatus(`Live setup failed: ${friendlyAuthError(error)}`)
    }
    finally { setLiveBusy(false) }
  }
  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      try {
        setLiveStatus('Checking for an existing live session…')
        if (!(await hasHostSession())) { if (!cancelled) setLiveStatus(''); return }
        if (cancelled) return
        setLiveBusy(true)
        setLiveStatus('Reconnecting live Host…')
        const stop = await startLiveHost((message, control) => {
          if (!cancelled) { setLiveStatus(message); setCanControl(control) }
        }, false, false, false)
        if (cancelled) stop()
        else stopLive.current = stop
      } catch (error) {
        if (!cancelled) setLiveStatus(`Live setup failed: ${friendlyAuthError(error)}`)
      } finally { if (!cancelled) setLiveBusy(false) }
    }
    void restore()
    return () => { cancelled = true; stopLive.current?.(); stopLive.current = null; leaveLiveRole('host') }
  }, [])
  const startFreshLive = async () => {
    if (!confirm('Start a new live game with a new join code? Players on the current code will stay in the old session.')) return
    setLiveBusy(true)
    setLiveStatus('Starting a fresh live game…')
    try {
      stopLive.current?.()
      leaveLiveRole('host')
      setCanControl(false)
      stopLive.current = await startLiveHost((message, control) => { setLiveStatus(message); setCanControl(control) }, false, true)
    } catch (error) { setLiveStatus(`New game failed: ${(error as Error).message}`) }
    finally { setLiveBusy(false) }
  }
  const liveAction = async (type: 'advance' | 'break' | 'resume' | 'void' | 'grade' | 'end', extras: { playerId?: string; points?: number } = {}) => {
    if (liveBusy || !canControl) return
    setLiveBusy(true)
    try {
      const closingCode = game.code
      await liveHostCommand(game.stateVersion, { type, ...extras })
      if (type === 'end') {
        stopLive.current?.()
        stopLive.current = null
        leaveLiveRole('host')
        setCanControl(false)
        setEndedCode(closingCode)
        setLiveStatus(`Session ${closingCode} ended. It will be removed after 24 hours.`)
      } else setLiveStatus('Live across devices')
    }
    catch (error) { setLiveStatus((error as Error).message) }
    finally { setLiveBusy(false) }
  }
  const removeEnded = async () => {
    if (!endedCode || !confirm(`Permanently delete session ${endedCode} and all of its player answers now?`)) return
    setLiveBusy(true)
    try { await deleteLiveSession(endedCode); setLiveStatus(`Session ${endedCode} was permanently deleted.`); setEndedCode('') }
    catch (error) { setLiveStatus(`Session deletion failed: ${(error as Error).message}`) }
    finally { setLiveBusy(false) }
  }
  useEffect(() => {
    if (getLiveRole() !== 'host' || !canControl || game.phase !== 'open' || !game.closesAt) return
    const timer = window.setTimeout(() => {
      liveHostCommand(game.stateVersion, { type: 'advance' }).catch(error => setLiveStatus((error as Error).message))
    }, Math.max(0, game.closesAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [canControl, game.phase, game.closesAt, game.stateVersion])
  return <Shell active="Host console"><main className="page host-page">
    <div className="page-heading">
      <div><div className="eyebrow dark">LIVE HOST CONSOLE</div><h1>{game.title}</h1><p>{liveConnected ? 'Session ready. Open the game-specific Main Screen, invite players, then start the quiz.' : 'Start a live session to create the Main Screen link and player game code.'}</p></div>
      <div className="host-head-actions">
        {!liveConnected ? <Button onClick={()=>void startLive()} disabled={liveBusy}><Play size={17}/>{liveBusy ? 'Connecting…' : 'Start live session'}</Button> : <>
          <a className="btn secondary" href={screenUrl} target="_blank" rel="noreferrer"><MonitorPlay size={17}/> Open Main Screen</a>
          <Button variant="secondary" onClick={()=>void copy('screen')}><Copy size={16}/>{copied==='screen' ? 'Screen link copied' : 'Copy screen link'}</Button>
          <Button variant="secondary" onClick={()=>void copy('portal')}><Copy size={16}/>{copied==='portal' ? 'Portal copied' : 'Copy XP Play Portal'}</Button>
          <Button variant="ghost" onClick={()=>void startFreshLive()} disabled={liveBusy}>New session</Button>
        </>}
      </div>
    </div>
    {liveStatus&&<div className="hint" role="status">{liveStatus}{liveConnected&&!canControl&&<button onClick={async()=>{try{await takeLiveControl()}catch(error){setLiveStatus((error as Error).message)}}}>Take Control</button>}{endedCode&&<button onClick={()=>void removeEnded()} disabled={liveBusy}>Delete now</button>}</div>}
    {liveConnected ? <>
      <div className="host-session-card">
        <div><small>1 · MAIN SCREEN</small><strong>Open the game-specific presentation link</strong><span>{screenUrl}</span></div>
        <div className="host-portal-step"><PlayerPortalQr value={portalUrl}/><span><small>2 · PLAYERS JOIN</small><strong>Scan the permanent XP Play portal</strong><em>{portalUrl}</em></span></div>
        <div className="host-session-code"><small>GAME CODE</small><b>{game.code}</b></div>
      </div>
      <div className="host-status"><div><span className="status-orb"><Play size={18}/></span><div><small>CURRENT SCREEN</small><strong>{phaseNames[game.phase]}</strong></div></div><span className="host-code">GAME CODE <b>{game.code}</b></span><Countdown game={game} className="host-timer"/><span className="host-count"><Users size={18}/>{game.players.length} players</span></div>
    </> : <div className="host-session-empty"><span className="status-orb"><Play size={18}/></span><div><strong>No live session yet</strong><p>Your XP Studio sign-in is remembered by this browser. Starting a session creates a new game or reconnects your current one.</p></div></div>}
    <div className="host-grid">
      <div className="host-main">
        <div className="host-question"><div className="host-q-top"><Badge>{q?.round || 'ROUND 1'}</Badge><span>QUESTION {game.questionIndex+1} / {game.questions.length}</span></div><h2>{q?.prompt}</h2>{q?.imageUrl&&<img className="host-question-image" src={q.imageUrl} alt={q.imageAlt || 'Question image'}/>}<div className="host-q-meta"><span><Clock3 size={16}/>{q?.duration || 30}s timer</span><span><Trophy size={16}/>{q&&effectiveScoreMode(q)==='time'?'Up to ':''}{q?.points} pts</span><span>{q ? typeNames[q.type] : ''}</span>{q&&<span>{effectiveScoreMode(q)==='time'?'Speed scoring':'Fixed scoring'}</span>}</div>{q && <HostAnswerKey question={q}/>}{q?.options && <div className="host-options">{q.options.map((option,index)=><div key={option}><span>{'ABCD'[index]}</span>{option}</div>)}</div>}</div>
        <div className="control-card"><div><h3>Game controls</h3><p>{liveConnected ? 'Each action updates the Main Screen and every player automatically.' : 'Start the live session before advancing the quiz.'}</p></div><div className="control-buttons"><Button onClick={()=>void liveAction(game.phase==='break'?'resume':game.phase==='thanks'?'end':'advance')} disabled={!liveConnected||!canControl||game.phase==='closed-game'||liveBusy}>{next}<ArrowRight size={18}/></Button>{['scores','round-scores','leaderboard','round-intro'].includes(game.phase)&&<Button variant="secondary" onClick={()=>void liveAction('break')} disabled={!liveConnected||!canControl||liveBusy}>Take a break</Button>}{['question','open','closed','reveal'].includes(game.phase)&&<Button variant="danger" disabled={!liveConnected||!canControl||liveBusy} onClick={()=>{if(confirm('Void this question? Its points will be removed.'))void liveAction('void')}}>Void question</Button>}{game.phase!=='thanks'&&game.phase!=='closed-game'&&<Button variant="danger" disabled={!liveConnected||!canControl||liveBusy} onClick={()=>{if(confirm('End this live session? Players will see the themed finale. The session will be deleted after 24 hours.'))void liveAction('end')}}>End session</Button>}</div></div>
        <div className="response-card"><div className="card-title"><h3>Incoming answers</h3><Badge tone={game.phase==='open'?'green':'gray'}>{answered.length} / {game.players.length} submitted</Badge></div>{answered.length===0?<div className="empty-state">Player answers will appear here while the question is open.</div>:<div className="answer-list">{answered.map(response=>{const player=game.players.find(item=>item.id===response.playerId);if(!player)return null;const grade=gradeFor(game,player.id,q.id);return <div key={player.id} className="answer-row"><div className="answer-player"><PlayerAvatar player={player} packs={packs}/><span><strong>{player.name}</strong><small>{new Date(response.submittedAt).toLocaleTimeString()}</small></span></div><span className="response-value">{typeof response.value==='object'?JSON.stringify(response.value):String(response.value)}</span>{q.type==='free'&&<div className="mark-buttons"><button disabled={!liveConnected||!canControl} onClick={()=>void liveAction('grade',{playerId:player.id,points:q.points})}>✓</button><button disabled={!liveConnected||!canControl} onClick={()=>void liveAction('grade',{playerId:player.id,points:0})}>✕</button></div>}{grade&&<Badge tone={grade.points?'green':'gray'}>{grade.points} pts</Badge>}</div>})}</div>}</div>
      </div>
      <div className="host-side">
        <div className="side-card"><div className="card-title"><h3>Overall leaderboard</h3><Trophy size={19}/></div>{game.players.length===0?<p className="muted">Waiting for the first player to join.</p>:ranked(game.players).map((player,index)=><div className="rank-row" key={player.id}><span className="rank-num">{index+1}</span><PlayerAvatar player={player} packs={packs} size={34}/><strong>{player.name}</strong><b>{player.score}</b></div>)}</div>
        <div className="side-card helper"><h3>Live session order</h3><ol><li>Start the live session.</li><li>Open the supplied XP Play Main Screen.</li><li>Players enter the supplied code in XP Play.</li><li>Press Start quiz when the room is ready.</li></ol><Link to="/join" target="_blank">Open XP Play Portal <ExternalLink size={15}/></Link></div>
        <div className="side-card"><h3>Quiz plan</h3><p className="muted">{new Set(game.questions.map(item=>item.round)).size} rounds · {game.questions.length} questions</p><Link to="/editor">Edit questions <ArrowRight size={15}/></Link></div>
      </div>
    </div>
  </main></Shell>
}
function MainScreen() {
  const { code } = useParams()
  const nav = useNavigate()
  const [enteredCode, setEnteredCode] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [connectedCode, setConnectedCode] = useState('')
  useEffect(() => {
    if (!code) return
    setConnectionError('')
    setConnectedCode('')
    const stop = followLiveScreen(code, setConnectionError, () => setConnectedCode(code))
    return () => { stop(); leaveLiveRole('screen') }
  }, [code])
  const game=useGame(), packs=usePacks(), q=currentQuestion(game), liveTheme=currentTheme(game)
  const sceneCopy = quizThemes[liveTheme][game.phase === 'break' ? 'break' : 'finale']
  useThemeScenePreload(liveTheme)
  const showQ=['question','open','closed','reveal'].includes(game.phase)
  const ranking=ranked(game.players)
  const openCode = () => {
    const clean = enteredCode.trim().toUpperCase()
    if (clean) nav(`/screen/${clean}`)
  }
  if (!code) return <div className="screen screen-launcher pixelplay-screen-launcher" style={{backgroundImage:`linear-gradient(90deg,#03070ee8,#07101ad6),url("${asset('themes/quiz-show/background.webp')}")`}}><div className="screen-launcher-card"><XPPlayLogo/><div className="eyebrow">MAIN SCREEN · PRESENTATION DISPLAY</div><h1>Connect the big screen</h1><p>Enter the code created by the XP Studio Host console. XP Play will then follow that live game automatically.</p><label>LIVE GAME CODE<input autoFocus maxLength={6} value={enteredCode} onChange={event=>setEnteredCode(event.target.value.toUpperCase())} onKeyDown={event=>event.key==='Enter'&&openCode()} placeholder="ABC123"/></label><Button onClick={openCode} disabled={!enteredCode.trim()}>Launch XP Play <ArrowRight size={18}/></Button><small>The game-specific Main Screen link fills this in automatically.</small><div className="screen-launcher-powered"><XPPlayCredit/></div></div></div>
  if (code && connectedCode !== code) return <div className="screen"><div className="screen-centre"><h1>{connectionError || 'Connecting to the live game…'}</h1></div></div>
  return <div className={`screen theme-surface theme-${liveTheme} phase-${game.phase}`} style={themeSurfaceStyle(liveTheme)}>{connectionError&&<div className="error" role="alert">{connectionError}</div>}<div className="screen-top"><div className="screen-brand-block"><XPPlayLogo compact/><div className="screen-event"><strong>{game.title}</strong><small>{q?.round || "GET READY TO PLAY"}</small></div></div><div className="screen-code"><small>XP PLAY PORTAL</small><strong className="screen-portal">{location.host}{location.pathname}#/join</strong><span className="screen-code-value"><small>CODE</small><b>{game.code}</b></span><span className="screen-live">● LIVE</span></div></div><div className="screen-content">{game.phase==='lobby'?<div className="screen-lobby"><span className="big-star">✦</span><div className="eyebrow">GET READY TO PLAY</div><h1>{game.title}</h1><p>Scan to open XP Play, then enter</p><div className="lobby-join"><PlayerPortalQr value={`${location.origin}${location.pathname}#/join`}/><div><small>XP PLAY PLAYER PORTAL</small><strong>{location.host}{location.pathname}#/join</strong><div className="giant-code">{game.code}</div></div></div><div className="joined-avatars">{game.players.slice(0,8).map(p=><PlayerAvatar key={p.id} player={p} packs={packs} size={64}/>)}</div><small>{game.players.length} {game.players.length===1?'player':'players'} joined</small></div>:game.phase==='round-intro'?<div className="screen-centre"><span className="round-kicker">UP NEXT</span><h1>{q.round.replace(' · ','\n')}</h1><p>Get ready. The next question is coming.</p></div>:showQ?<div className="screen-question"><div className="screen-q-head"><span>{q.round}</span><span>QUESTION {game.questionIndex+1} / {game.questions.length}</span></div><div className="screen-type"><span><small>QUESTION TYPE</small><strong>{typeNames[q.type]}</strong></span><p><b>HOW TO ANSWER</b>{typeInstructions[q.type]}</p><em className="screen-scoring">{effectiveScoreMode(q)==="time"?"SPEED SCORE · UP TO "+q.points.toLocaleString():q.points.toLocaleString()+" POINTS · FIXED"}</em></div><h1>{q.prompt}</h1><QuestionMediaStage game={game} question={q}/>{q.type==='anagram'&&game.phase!=='reveal'&&<AnagramBoard game={game} question={q}/>}<AnswerStage question={q} revealed={game.phase==='reveal'}/>{game.phase!=='reveal'&&['ordering','matching','categorise'].includes(q.type)&&q.items&&<div className="screen-items">{q.items.map(item=><span key={item}>{item}</span>)}</div>}<Countdown game={game} className="screen-timer"/>{game.phase==='reveal'?<div className="screen-reveal-caption"><Sparkles size={18}/> {q.explanation || 'The correct answer is highlighted above.'}</div>:<div className="screen-footline"><span>{game.phase==='open'?'Answers open':game.phase==='closed'?'Answers closed':'Get ready to answer'}</span><span>{game.responses.filter(r=>r.questionId===q.id).length} answers received</span></div>}</div>:['scores','round-scores','leaderboard','final'].includes(game.phase)?<div className="screen-scores"><span className="round-kicker">{game.phase==="round-scores"?q.round:game.phase==="scores"?"AFTER THIS QUESTION":game.phase==="final"?"THE FINAL RESULTS":"ALL ROUNDS"}</span><h1>{game.phase==="round-scores"?"Round scores":game.phase==="final"?"Our champions":game.phase==="scores"?"Question complete":"Leaderboard"}</h1><div className="screen-ranks">{(game.phase==="round-scores"?rankedRound(game,q.round):ranking).slice(0,10).map(p=><div key={p.id}><span>#{p.rank}</span><PlayerAvatar player={p} packs={packs} size={52}/><strong>{p.name}</strong><b>{(game.phase==="round-scores"?roundPoints(game,p.id,q.round):p.score).toLocaleString()}</b></div>)}</div></div>:<div className={`screen-centre phase-scene-copy ${game.phase==='break'?'break-copy':'thanks-copy'}`}><span className="scene-symbol" aria-hidden="true">{sceneCopy.symbol}</span><span className="scene-kicker">{sceneCopy.kicker}</span><h1>{sceneCopy.title}</h1><p>{sceneCopy.screen}</p></div>}</div><div className="screen-bottom"><XPPlayCredit/><span>{phaseNames[game.phase].toUpperCase()}</span></div></div>
}
function Join() {
  const { code: routeCode } = useParams()
  const game=useGame(), packs=usePacks(), [name,setName]=useState(''), [selected,setSelected]=useState('default-blue'), [packId,setPackId]=useState('default'), [error,setError]=useState(''), [code,setCode]=useState(routeCode || ''), [answer,setAnswer]=useState<unknown>('')
  const liveTheme = currentTheme(game)
  useThemeScenePreload(liveTheme)
  const [submitting, setSubmitting] = useState(false), [readyQuestionId, setReadyQuestionId] = useState(''), [joining, setJoining] = useState(false)
  const [ownResult, setOwnResult] = useState<OwnResult | null>(null)
  const [playerId,setPlayerId]=useState(routeCode ? sessionStorage.getItem('quiz-demo-player-id')||'' : '')
  const player=game.players.find(p=>p.id===playerId), q=currentQuestion(game), pack=packs.find(p=>p.id===packId)
  const sceneCopy = quizThemes[liveTheme][game.phase === 'break' ? 'break' : 'finale']
  const existing=player&&q?responseFor(game,player.id,q.id):undefined
  const displayedResult = player && (game.phase === 'reveal' || ['scores','round-scores','leaderboard','final'].includes(game.phase)) ? ownResult : null
  useEffect(()=>{setAnswer(q?.type==='multi'||q?.type==='ordering'||q?.type==='list'?[]:q?.type==='matching'||q?.type==='categorise'?{}:'')},[q?.id,q?.type])
  useEffect(() => {
    const reconnectCode = routeCode
    if (!reconnectCode) return
    reconnectLivePlayer(reconnectCode, setReadyQuestionId, setOwnResult, setError).then(id => { if (id) setPlayerId(id) }).catch(e => setError((e as Error).message))
  }, [routeCode])
  const join=async()=>{
    if (joining) return
    setJoining(true)
    try {
      const liveId = await joinLiveGame(code,name,selected,setReadyQuestionId,setOwnResult,setError)
      if (!liveId) throw new Error('That game code is not active.')
      setPlayerId(liveId)
      window.history.replaceState(null, '', `${location.pathname}#/join/${code.trim().toUpperCase()}`)
      setError('')
    } catch(e) { setError((e as Error).message) }
    finally { setJoining(false) }
  }
  const submit=async()=>{
    if (submitting) return
    setSubmitting(true)
    try {
      await submitLiveAnswer(answer)
      setError('')
    } catch(e) { setError((e as Error).message) }
    finally { setSubmitting(false) }
  }
  const choice=(option:string)=>{const arr=Array.isArray(answer)?answer as string[]:[];setAnswer(arr.includes(option)?arr.filter(x=>x!==option):[...arr,option])}
  const isLocked=!!existing
  const answerReady = isAnswerComplete(q, answer)
  const buttonDisabled=submitting||isLocked||game.phase!=='open'||!answerReady
  return <div className={`player-app theme-surface theme-${liveTheme} phase-${game.phase}`} style={themeSurfaceStyle(liveTheme)}><div className="player-head"><div className="player-brand-block"><XPPlayLogo/><div className="player-event">{player ? game.title : "PLAYER PORTAL"}<small>{player ? "PLAYER CONTROLLER" : "JOIN WITH A GAME CODE"}</small></div></div><span className="player-demo" aria-hidden="true">⌜</span></div>{!player?<div className="join-card"><div className="join-intro"><div className="eyebrow dark">WELCOME TO XP PLAY</div><h1>Join the show</h1><p>Enter the game code, choose your character, and your phone becomes the controller.</p></div><label>GAME CODE<input className="code-input" maxLength={6} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label><label>YOUR NAME<input maxLength={24} placeholder="What should we call you?" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&join()}/></label><div className="avatar-section"><div className="avatar-heading"><strong>Choose an avatar</strong><span>{packs.reduce((n,p)=>n+p.avatars.length,0)} to pick from</span></div><div className="pack-tabs">{packs.map(p=><button key={p.id} className={packId===p.id?'selected':''} onClick={()=>setPackId(p.id)}>{p.name}</button>)}</div><div className="avatar-grid">{pack?.avatars.map(a=><button key={a.id} className={selected===a.id?'picked':''} title={a.name} onClick={()=>setSelected(a.id)}><img src={avatarSrc(a.id,packs)} alt={a.name}/>{selected===a.id&&<span><Check size={12}/></span>}</button>)}</div></div>{error&&<div className="error">{error}</div>}<Button onClick={join} disabled={joining}>{joining?"Joining…":"Join game"} <ArrowRight size={18}/></Button></div>:<div className="player-session"><div className="player-identity"><PlayerAvatar player={player} packs={packs} size={52}/><div><strong>{player.name}</strong><span>{player.score.toLocaleString()} points</span></div><Badge tone="green">● LIVE</Badge></div>{game.phase==='lobby'?<div className="player-wait"><span>✦</span><h1>You're in!</h1><p>Waiting for the host to begin. Keep this tab open.</p><div className="wait-code">GAME CODE <b>{game.code}</b></div></div>:game.phase==='round-intro'?<div className="player-wait"><span>✦</span><div className="eyebrow dark">COMING UP</div><h1>{q.round}</h1><p>Get ready for your next question.</p></div>:['question','open','closed','reveal'].includes(game.phase)?<div className="player-question"><div className="player-question-top"><span>QUESTION {game.questionIndex+1} OF {game.questions.length}</span><span>{effectiveScoreMode(q)==='time'?'UP TO ':''}{q.points} PTS · {effectiveScoreMode(q)==='time'?'SPEED':'FIXED'}</span></div><Countdown game={game} className="player-timer"/><div className="player-question-card"><span className="player-type"><small>QUESTION TYPE</small>{typeNames[q.type]}</span><h1>{game.phase==='question'?'Look at the main screen':q.prompt}</h1><p className="player-instructions"><b>{game.phase==='question'?'GET READY':game.phase==='reveal'?'ANSWER REVEAL':'HOW TO ANSWER'}</b>{game.phase==='question'?'Answer controls will appear here when the Host opens answers.':game.phase==='reveal'?'Your answer and result appear below.':typeInstructions[q.type]}{game.phase==='open'&&effectiveScoreMode(q)==='time'?' Faster correct answers earn more points.':''}</p></div>{readyQuestionId!==q.id?<div className="player-wait small"><span>⌛</span><h2>Reconnecting</h2><p>Checking your answer status…</p></div>:submitting?<div className="player-wait small"><span>⌛</span><h2>Submitting</h2><p>Waiting for the game to confirm your answer.</p></div>:game.phase==='question'?<div className="player-wait small"><span>⌛</span><h2>Question on screen</h2><p>Answers will open in a moment.</p></div>:game.phase==='closed'?<div className="player-wait small"><span>⌛</span><h2>Answers are closed</h2><p>Waiting for the host to reveal the answer.</p></div>:game.phase==='reveal'?<PlayerReveal question={q} response={existing} result={displayedResult}/>:existing?<div className="player-wait small"><span>✓</span><h2>Answer locked in</h2><p>Waiting for everyone else.</p></div>:<><div className="answers-open" role="status"><span/><div>Answers are open<small>Submit before the timer runs out.</small></div></div><AnswerInput q={q} value={answer} setValue={setAnswer} choice={choice}/>{error&&<div className="error">{error}</div>}<Button onClick={submit} disabled={buttonDisabled}>{submitting?"Submitting…":"Submit answer"} <ArrowRight size={18}/></Button></>}</div>:['scores','round-scores','leaderboard','final'].includes(game.phase)?<div className="player-wait"><Trophy size={50}/><h1>{game.phase==="round-scores"?"Round scores":game.phase==="final"?"Final results":game.phase==="leaderboard"?"Overall leaderboard":"Question complete"}</h1><p>{game.phase==="round-scores"?"You scored "+roundPoints(game,player.id,q.round).toLocaleString()+" points in "+q.round+".":"You have "+player.score.toLocaleString()+" points overall."}</p>{displayedResult&&<p>This question: {displayedResult.points.toLocaleString()} points</p>}<div className="player-rank">Rank #{ranked(game.players).find(p=>p.id===player.id)?.rank || '—'}</div></div>:<div className="player-wait phase-player-card"><span>{sceneCopy.symbol}</span><small className="scene-kicker">{sceneCopy.kicker}</small><h1>{sceneCopy.playerTitle}</h1><p>{sceneCopy.player}{game.phase==='break'?'':` Your final score is ${player.score.toLocaleString()} points.`}</p></div>}</div>}<div className="player-footer"><XPPlayCredit/><span>XP PLAY LIVE</span></div></div>
}
function AnswerInput({q,value,setValue,choice}:{q:Question;value:unknown;setValue:(v:unknown)=>void;choice:(v:string)=>void}) {
  if(q.type==='single'||q.type==='boolean') return <div className="choice-list">{(q.type==='boolean'?['True','False']:q.options||[]).map((o,i)=><button key={o} className={value===(q.type==='boolean'?(o==='True'):o)?'active':''} onClick={()=>setValue(q.type==='boolean'?(o==='True'):o)}><b>{'ABCD'[i]}</b>{o}</button>)}</div>
  if(q.type==='multi') return <div className="choice-list">{q.options?.map((o,i)=><button key={o} className={(value as string[]).includes(o)?'active':''} onClick={()=>choice(o)}><b>{'ABCD'[i]}</b>{o}</button>)}</div>
  if(q.type==='ordering') {const items=q.items||[];const order=Array.isArray(value)?value as string[]:[];return <div><p className="input-help">Tap each item in order.</p><div className="choice-list">{items.map(o=><button key={o} className={order.includes(o)?'active':''} onClick={()=>choice(o)}><b>{order.includes(o)?order.indexOf(o)+1:'+'}</b>{o}</button>)}</div><button className="clear-link" onClick={()=>setValue([])}>Clear order</button></div>}
  if(q.type==='matching'||q.type==='categorise') return <div className="match-list">{q.items?.map(item=><label key={item}>{item}<select value={(value as Record<string,string>)[item]||''} onChange={e=>setValue({...value as object,[item]:e.target.value})}><option value="">Choose…</option>{(q.type==='matching'?q.options:q.categories)?.map(o=><option key={o}>{o}</option>)}</select></label>)}</div>
  if(q.type==='list') return <div className="list-input">{Array.from({length:Math.max(1,Array.isArray(q.answer)?q.answer.length:3)},(_,i)=><input key={i} placeholder={`Answer ${i+1}`} value={(value as string[])[i]||''} onChange={e=>{const next=[...(value as string[])];next[i]=e.target.value;setValue(next)}}/>)}</div>
  if(q.type==='number'||q.type==='closest') return <input className="answer-text" type="number" placeholder="Your number" value={value as string} onChange={e=>setValue(e.target.value)}/>
  if(q.type==='free') return <textarea className="answer-text" placeholder="Type your answer…" value={value as string} onChange={e=>setValue(e.target.value)}/>
  return <div>{q.type==='anagram'&&<div className="scramble">{[...(q.scramble||String(q.answer||'').toUpperCase())].join(' ')}</div>}<input className="answer-text" placeholder={q.type==='anagram'?'Unscramble it…':'Type your answer…'} value={value as string} onChange={e=>setValue(e.target.value)}/></div>
}
function Admin() { return <Shell active="Admin"><AdminDashboard/></Shell> }
function App() { return <HashRouter><Routes><Route path="/" element={<Home/>}/><Route path="/organiser" element={<HostGate><Organiser/></HostGate>}/><Route path="/editor" element={<HostGate><Editor/></HostGate>}/><Route path="/host" element={<HostGate><Host/></HostGate>}/><Route path="/screen" element={<MainScreen/>}/><Route path="/screen/:code" element={<MainScreen/>}/><Route path="/join" element={<Join/>}/><Route path="/join/:code" element={<Join/>}/><Route path="/admin" element={<HostGate adminOnly><Admin/></HostGate>}/><Route path="*" element={<Home/>}/></Routes></HashRouter> }
export default App
