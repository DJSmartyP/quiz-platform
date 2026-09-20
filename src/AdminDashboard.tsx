import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Download, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { currentQuestion, ranked, roundPoints, type Game } from './model'
import { inspectAdminSession } from './live'
import { useGame } from './store'

function csvCell(value: unknown) {
  const raw = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
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
  const refresh = async () => {
    setLoading(true)
    try { setLive(await inspectAdminSession()); setError('') }
    catch (cause) { setLive(null); setError((cause as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let cancelled = false
    void inspectAdminSession().then(game => { if (!cancelled) { setLive(game); setError('') } })
      .catch(cause => { if (!cancelled) setError((cause as Error).message) })
    return () => { cancelled = true }
  }, [])
  const game = live || local
  const rounds = [...new Set(game.questions.map(question => question.round))]
  const question = currentQuestion(game)
  const answers = live?.responses.filter(response => response.questionId === question?.id).length || 0
  return <main className="page admin-page"><div className="page-heading"><div><div className="eyebrow dark">PLATFORM CONTROL</div><h1>Admin dashboard</h1><p>Inspect the active game, monitor participation and export scores.</p></div><span className="admin-access"><ShieldCheck size={17}/>{live ? 'Admin session verified' : 'Admin sign-in required for live data'}</span></div>
    <div className="admin-toolbar"><button className="btn secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16}/>{loading ? 'Checking…' : 'Refresh live session'}</button><button className="btn secondary" onClick={() => exportSession(game)} disabled={!live}><Download size={16}/> Export live scores CSV</button><Link className="btn primary" to="/host">Open GM console <ArrowRight size={16}/></Link></div>
    {error && <div className="admin-callout" role="status"><ShieldCheck size={20}/><span>{error}<small>Only nickpatel.trainer@gmail.com can inspect live data. Sign in from the Host console first.</small></span></div>}
    <div className="admin-metrics"><div><span>SESSION</span><strong>{live ? game.code : '—'}</strong><small>{live ? game.phase.replaceAll('-', ' ') : 'No verified live session'}</small></div><div><span>PLAYERS</span><strong>{live ? game.players.length : '—'}</strong><small>Joined this session</small></div><div><span>CURRENT ANSWERS</span><strong>{live ? `${answers}/${game.players.length}` : '—'}</strong><small>For question {game.questionIndex + 1}</small></div><div><span>QUIZ</span><strong>{game.questions.length}</strong><small>{rounds.length} rounds</small></div></div>
    <div className="admin-panels"><section className="admin-panel"><div className="admin-panel-head"><h2>Round plan</h2><span>{game.questions.length} questions</span></div>{rounds.map((round, index) => <div className="admin-row" key={round}><b>{String(index + 1).padStart(2, '0')}</b><strong>{round}</strong><span>{game.questions.filter(question => question.round === round).length} questions</span></div>)}<p className="admin-panel-note">A round can mix question formats. Its score includes only questions in that round.</p></section>
      <section className="admin-panel"><div className="admin-panel-head"><h2>Live roster</h2><Users size={18}/></div>{!live ? <p className="admin-panel-note">Sign in as the admin Host to see connected Players and scores.</p> : game.players.length ? ranked(game.players).map(player => <div className="admin-row" key={player.id}><b>#{player.rank}</b><strong>{player.name}</strong><span>{player.score.toLocaleString()} pts</span></div>) : <p className="admin-panel-note">Players appear here after joining.</p>}</section></div>
    <div className="admin-callout subtle"><ShieldCheck size={19}/><span>Live Player answers and unreleased keys remain in Host-only Firestore records.<small>Account approval, multi-game browsing and audit history need their own data model and rules before they can be enabled.</small></span></div>
  </main>
}
