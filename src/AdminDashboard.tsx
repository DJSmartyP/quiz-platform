import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Download, ExternalLink, RefreshCw, ShieldCheck, Trash2, Users, XCircle } from 'lucide-react'
import { currentQuestion, ranked, roundPoints, type Game } from './model'
import { closeAdminSession, deleteAdminSession, inspectAdminSession, listAdminQuizzes, listAdminSessions, listHostAccounts, setHostAccountStatus, type AdminQuizRecord, type AdminSessionRecord, type HostAccount } from './live'
import { useGame } from './store'

function csvCell(value: unknown) {
  const raw = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function exportSession(game: Game) {
  const rounds = [...new Set(game.questions.map(question => question.round))]
  const rows = [
    ['Player', 'Avatar', ...rounds, 'Overall points'],
    ...ranked(game.players).map(player => [player.name, player.avatarId, ...rounds.map(round => roundPoints(game, player.id, round)), player.score]),
  ]
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `quizforge-${game.code}-scores.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AdminDashboard() {
  const local = useGame()
  const [live, setLive] = useState<Game | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<HostAccount[]>([])
  const [quizzes, setQuizzes] = useState<AdminQuizRecord[]>([])
  const [sessions, setSessions] = useState<AdminSessionRecord[]>([])
  const [accountBusy, setAccountBusy] = useState('')
  const [sessionBusy, setSessionBusy] = useState('')
  const loadInventory = async (hosts: HostAccount[]) => {
    const [quizResult, sessionResult] = await Promise.allSettled([listAdminQuizzes(hosts), listAdminSessions(hosts)])
    if (quizResult.status === 'fulfilled') setQuizzes(quizResult.value)
    else throw quizResult.reason
    if (sessionResult.status === 'fulfilled') setSessions(sessionResult.value)
    else throw sessionResult.reason
  }
  const refresh = async () => {
    setLoading(true)
    try {
      const [session, hosts] = await Promise.allSettled([inspectAdminSession(), listHostAccounts()])
      if (session.status === 'fulfilled') setLive(session.value)
      else setLive(null)
      if (hosts.status === 'fulfilled') {
        setAccounts(hosts.value)
        await loadInventory(hosts.value)
      }
      else throw hosts.reason
      setError(session.status === 'rejected' ? session.reason.message : '')
    }
    catch (cause) { setError((cause as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let cancelled = false
    void Promise.allSettled([inspectAdminSession(), listHostAccounts()]).then(async ([session, hosts]) => {
      if (cancelled) return
      if (session.status === 'fulfilled') setLive(session.value)
      if (hosts.status === 'fulfilled') {
        setAccounts(hosts.value)
        try { await loadInventory(hosts.value) }
        catch (cause) { if (!cancelled) setError((cause as Error).message) }
      }
      if (hosts.status === 'rejected') setError((hosts.reason as Error).message)
    })
    return () => { cancelled = true }
  }, [])
  const changeStatus = async (account: HostAccount) => {
    const status = account.status === 'active' ? 'suspended' : 'active'
    if (status === 'suspended' && !confirm(`Suspend ${account.displayName}? They will be unable to open Host tools or run games.`)) return
    setAccountBusy(account.uid)
    try {
      await setHostAccountStatus(account.uid, status)
      setAccounts(current => current.map(item => item.uid === account.uid ? { ...item, status } : item))
    } catch (cause) { setError((cause as Error).message) }
    finally { setAccountBusy('') }
  }
  const closeSession = async (session: AdminSessionRecord) => {
    if (!confirm(`Close session ${session.code}? Every connected Player and Main Screen will be moved to the closed state.`)) return
    setSessionBusy(session.code)
    try {
      await closeAdminSession(session.code, session.ownerUid)
      setSessions(current => current.map(item => item.code === session.code ? { ...item, status: 'ended', phase: 'closed-game', deleteAfterMs: Date.now() + 24 * 60 * 60 * 1000 } : item))
    } catch (cause) { setError((cause as Error).message) }
    finally { setSessionBusy('') }
  }
  const deleteSession = async (session: AdminSessionRecord) => {
    if (!confirm(`Permanently delete session ${session.code}, its Players, answers and scores? This cannot be undone.`)) return
    setSessionBusy(session.code)
    try {
      await deleteAdminSession(session.code, session.ownerUid)
      setSessions(current => current.filter(item => item.code !== session.code))
    } catch (cause) { setError((cause as Error).message) }
    finally { setSessionBusy('') }
  }
  const game = live || local
  const rounds = [...new Set(game.questions.map(question => question.round))]
  const question = currentQuestion(game)
  const answers = live?.responses.filter(response => response.questionId === question?.id).length || 0
  const openSessionCount = sessions.filter(session => session.status === 'active').length
  return <main className="page admin-page"><div className="page-heading"><div><div className="eyebrow dark">PLATFORM CONTROL</div><h1>Admin dashboard</h1><p>Manage Host access and inspect your current live game.</p></div><span className="admin-access"><ShieldCheck size={17}/>Admin session verified</span></div>
    <div className="admin-toolbar"><button className="btn secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16}/>{loading ? 'Checking…' : 'Refresh live session'}</button><button className="btn secondary" onClick={() => exportSession(game)} disabled={!live}><Download size={16}/> Export live scores CSV</button><Link className="btn primary" to="/host">Open GM console <ArrowRight size={16}/></Link></div>
    {error && <div className="admin-callout" role="status"><ShieldCheck size={20}/><span>{error}<small>Host account management is still available. Start or reconnect a game to populate the live session panels.</small></span></div>}
    <section className="admin-panel account-panel"><div className="admin-panel-head"><h2>Host accounts</h2><span>{accounts.length} total</span></div>{accounts.length ? accounts.map(account => <div className="host-account-row" key={account.uid}><div className="host-account-avatar">{(account.displayName || account.email).slice(0,1).toUpperCase()}</div><div><strong>{account.displayName || 'Quiz Host'}</strong><small>{account.email}{account.organisationName ? ` · ${account.organisationName}` : ''}</small></div><span className={`account-role ${account.role}`}>{account.role}</span><span className={`account-state ${account.status}`}>{account.status}</span>{account.role === 'admin' ? <span className="account-owner">Site owner</span> : <button className={`btn ${account.status === 'active' ? 'danger' : 'secondary'}`} disabled={accountBusy===account.uid} onClick={()=>void changeStatus(account)}>{accountBusy===account.uid?'Saving…':account.status==='active'?'Suspend':'Reactivate'}</button>}</div>) : <p className="admin-panel-note">Host accounts appear here after their first Google sign-in.</p>}</section>
    <section className="admin-panel account-panel"><div className="admin-panel-head"><h2>Host quiz libraries</h2><span>{countLabel(quizzes.length, 'quiz', 'quizzes')}</span></div>{quizzes.length ? quizzes.map(quiz => <div className="admin-quiz-row" key={`${quiz.ownerUid}-${quiz.id}`}><BookOpen size={18}/><div><strong>{quiz.title}</strong><small>{quiz.ownerName} · {quiz.ownerEmail}</small></div><span>{countLabel(quiz.questionCount, 'question')}</span><span>{countLabel(quiz.roundCount, 'round')}</span><span>{quiz.builtIn ? 'Test pack' : quiz.theme.replaceAll('-', ' ')}</span></div>) : <p className="admin-panel-note">Saved Host quizzes will appear here. This view is read-only; each Host keeps control of their own library.</p>}</section>
    <section className="admin-panel account-panel"><div className="admin-panel-head"><h2>Live sessions</h2><span>{countLabel(openSessionCount, 'open session')}</span></div>{sessions.length ? sessions.map(session => <div className="admin-session-row" key={`${session.ownerUid}-${session.code}`}><div className={`session-live-dot ${session.status}`}/><div><strong>{session.title || 'Untitled quiz'}</strong><small>{session.ownerName} · {session.ownerEmail}</small></div><b>{session.code}</b><span className={`account-state ${session.status === 'active' ? 'active' : 'suspended'}`}>{session.status === 'active' ? session.phase?.replaceAll('-', ' ') || 'open' : 'ended'}</span><span>{countLabel(session.playerCount, 'player')}</span><div className="admin-session-actions">{session.status === 'active'&&<a className="icon-action" href={`#/screen/${session.code}`} target="_blank" rel="noreferrer" title="Open Main Screen"><ExternalLink size={15}/></a>}{session.status === 'active'&&<button className="icon-action close" disabled={sessionBusy===session.code} onClick={()=>void closeSession(session)} title="Close session"><XCircle size={16}/></button>}<button className="icon-action delete" disabled={sessionBusy===session.code} onClick={()=>void deleteSession(session)} title="Delete session"><Trash2 size={16}/></button></div></div>) : <p className="admin-panel-note">No Host has an open or recently ended session.</p>}<p className="admin-panel-note">Closed sessions are scheduled for deletion after 24 hours. Delete removes the session and all Player data immediately.</p></section>
    <div className="admin-metrics"><div><span>SESSION</span><strong>{live ? game.code : '—'}</strong><small>{live ? game.phase.replaceAll('-', ' ') : 'No verified live session'}</small></div><div><span>PLAYERS</span><strong>{live ? game.players.length : '—'}</strong><small>Joined this session</small></div><div><span>CURRENT ANSWERS</span><strong>{live ? `${answers}/${game.players.length}` : '—'}</strong><small>For question {game.questionIndex + 1}</small></div><div><span>QUIZ</span><strong>{game.questions.length}</strong><small>{countLabel(rounds.length, 'round')}</small></div></div>
    <div className="admin-panels"><section className="admin-panel"><div className="admin-panel-head"><h2>Round plan</h2><span>{countLabel(game.questions.length, 'question')}</span></div>{rounds.map((round, index) => { const questionCount = game.questions.filter(question => question.round === round).length; return <div className="admin-row" key={round}><b>{String(index + 1).padStart(2, '0')}</b><strong>{round}</strong><span>{countLabel(questionCount, 'question')}</span></div> })}<p className="admin-panel-note">A round can mix question formats. Its score includes only questions in that round.</p></section>
      <section className="admin-panel"><div className="admin-panel-head"><h2>Live roster</h2><Users size={18}/></div>{!live ? <p className="admin-panel-note">Sign in as the admin Host to see connected Players and scores.</p> : game.players.length ? ranked(game.players).map(player => <div className="admin-row" key={player.id}><b>#{player.rank}</b><strong>{player.name}</strong><span>{player.score.toLocaleString()} pts</span></div>) : <p className="admin-panel-note">Players appear here after joining.</p>}</section></div>
    <div className="admin-callout subtle"><ShieldCheck size={19}/><span>Each Host has a private quiz library and can only control games they created.<small>Players remain anonymous and account free. Firestore rules enforce the separation.</small></span></div>
  </main>
}
