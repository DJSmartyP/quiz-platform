import { useEffect, useRef, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, CircleHelp, Clock3, Copy, Edit3, ExternalLink, Eye, Gamepad2, LayoutDashboard, MonitorPlay, Play, Plus, RotateCcw, ShieldCheck, Sparkles, Trophy, Users } from 'lucide-react'
import { anagramDisplay, currentQuestion, gradeFor, ranked, rankedRound, responseFor, roundPoints, scrambleWord, typeInstructions, typeNames, type Game, type Player, type Question } from './model'
import { actionLabel, expireAnswers, getLiveRole, hostAction, joinGame, jumpToQuestion, resetGame, resumeBreak, setGrade, submitAnswer, takeBreak, update, useGame, voidQuestion } from './store'
import { followLiveScreen, joinLiveGame, liveHostCommand, reconnectLivePlayer, startLiveHost, submitLiveAnswer, takeLiveControl } from './live'
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
function Logo() { return <Link className="brand" to="/organiser" aria-label="QuizForge home"><img src={asset('brand/quizforge-logo-final.png')} alt="QuizForge"/></Link> }
function PoweredByQuizForge() { return <span className="powered-by">Powered by QuizForge</span> }
function Shell({ children, active }: { children: React.ReactNode; active?: string }) {
  return <div className="shell"><aside className="sidebar"><Logo/><div className="side-label">WORKSPACE</div><NavLink to="/organiser" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><LayoutDashboard size={19}/> Overview</NavLink><NavLink to="/editor" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><Edit3 size={19}/> Quiz editor</NavLink><NavLink to="/host" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><Gamepad2 size={19}/> Host console</NavLink><NavLink to="/screen" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><MonitorPlay size={19}/> Main screen</NavLink><div className="side-label spaced">PLATFORM</div><NavLink to="/admin" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><ShieldCheck size={19}/> Admin preview</NavLink><div className="side-bottom"><span className="demo-dot"/> Local interactive demo <small>Same-browser tabs sync live</small></div></aside><div className="shell-main"><header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> {active || 'Overview'}</div><div className="top-actions"><span className="preview-chip"><span/> PREVIEW MODE</span><Link className="text-link" to="/join">Player view <ExternalLink size={15}/></Link></div></header>{children}</div></div>
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
  const answer = String(question.answer || '')
  const scramble = question.scramble || answer.toUpperCase()
  if (!answer) return <div className="anagram-board"><div className="anagram-label">THE JUMBLED WORD</div><div className="anagram-letters">{[...scramble].map((char,index)=><span key={index}>{char === ' ' ? '\u00a0' : char}</span>)}</div></div>
  const elapsed = game.phase === 'open' || game.phase === 'closed'
    ? Math.max(0, ((game.phase === 'closed' ? game.closedAt || now : now) - (game.openedAt || now)) / 1000)
    : 0
  const display = anagramDisplay(answer, scramble, elapsed, question.duration || 30)
  const locked = new Set(display.positions.slice(0, display.lockedCount))
  return <div className="anagram-board" aria-label={`Jumbled letters: ${display.text}`}><div className="anagram-label">{game.phase === 'open' ? 'LETTERS ARE FALLING INTO PLACE' : game.phase === 'closed' ? 'TIME IS UP' : 'THE JUMBLED WORD'}</div><div className="anagram-letters">{[...display.text].map((char, index) => <span key={index} className={`${char === ' ' ? 'space' : ''} ${locked.has(index) ? 'locked' : ''}`}>{char === ' ' ? '\u00a0' : char}</span>)}</div><div className="anagram-progress">{display.lockedCount} of {display.positions.length} letters locked</div></div>
}

function Home() {
  const nav = useNavigate()
  return <div className="home"><div className="home-nav"><Logo/><div><Link to="/organiser">Explore workspace</Link><Link to="/join" className="nav-join">Join a game <ArrowRight size={15}/></Link></div></div><main className="home-main"><div className="home-copy"><div className="eyebrow"><span/> A NEW WAY TO PLAY TOGETHER</div><h1>Quiz night,<br/><em>made brilliant.</em></h1><p>Create a quiz, bring everyone in with a code, and run the whole room from one calm host console.</p><div className="home-buttons"><Button onClick={() => nav('/organiser')}>Explore the demo <ArrowRight size={18}/></Button><Button variant="secondary" onClick={() => nav('/join')}>Try the player view</Button></div><div className="home-proof"><div><strong>12</strong><span>question formats</span></div><div><strong>12</strong><span>avatar packs</span></div><div><strong>50</strong><span>players planned</span></div></div></div><div className="home-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-glow"/><img className="art-platypus" src={asset('avatars/platypus/wizard.png')} alt="Wizard platypus pixel art"/><img className="art-orb" src={asset('avatars/default/purple.png')} alt="Purple avatar"/><div className="floating-card"><Trophy size={18}/> <span>Round 1 is live<strong>Players are answering</strong></span></div></div></main><div className="home-foot">Build. Host. Play. <span>✦</span> QuizForge</div></div>
}
function Organiser() {
  const game = useGame(), packs = usePacks(), nav = useNavigate()
  return <Shell active="Overview"><main className="page"><div className="page-heading"><div><div className="eyebrow dark">ORGANISER WORKSPACE</div><h1>Good evening, quizmaster.</h1><p>Your next great quiz night starts here.</p></div><Button onClick={() => nav('/editor')}><Plus size={18}/> Open quiz editor</Button></div><div className="stats-grid"><div className="stat"><span>QUIZZES</span><strong>1</strong><small>Ready to host</small></div><div className="stat"><span>LIVE GAME</span><strong>{game.phase === 'lobby' ? 'Ready' : 'Live'}</strong><small>Code {game.code}</small></div><div className="stat"><span>PLAYERS</span><strong>{game.players.length}</strong><small>In this demo</small></div></div><div className="section-title"><h2>Your quizzes</h2><span>1 quiz</span></div><div className="quiz-card"><div className="quiz-cover"><div className="cover-orbit"/><Sparkles size={38}/></div><div className="quiz-details"><Badge tone="green">READY TO HOST</Badge><h3>{game.title}</h3><p>2 rounds · {game.questions.length} questions · 12 question formats</p><div className="quiz-card-actions"><Button onClick={() => nav('/host')}><Play size={17}/> Host this quiz</Button><Button variant="secondary" onClick={() => nav('/editor')}><Edit3 size={16}/> Edit</Button></div></div></div><div className="section-title lower"><h2>Make it yours</h2></div><div className="feature-grid"><Link to="/join" className="feature-card"><div className="feature-icon lilac"><Users size={21}/></div><h3>Try joining</h3><p>Pick a name and avatar, then answer from the player view.</p><span>Open player view <ArrowRight size={16}/></span></Link><Link to="/screen" className="feature-card"><div className="feature-icon coral"><MonitorPlay size={21}/></div><h3>Presentation screen</h3><p>Put the big screen on a second tab and drive it from Host.</p><span>Open main screen <ArrowRight size={16}/></span></Link><div className="feature-card"><div className="feature-icon mint"><Sparkles size={21}/></div><h3>Avatar collection</h3><p>{packs.reduce((n,p) => n+p.avatars.length,0)} characters across {packs.length} avatar packs.</p><span>Included in the demo <Check size={16}/></span></div></div></main></Shell>
}
function Editor() {
  const game = useGame(), [selected, setSelected] = useState(0), [draft, setDraft] = useState(game.questions[0]), [saved, setSaved] = useState(false), [validation, setValidation] = useState('')
  useEffect(() => { setDraft(game.questions[selected] || game.questions[0]); setSaved(false) }, [selected, game.questions])
  if (!draft) return null
  const save = () => {
    const word = String(draft.answer || '').trim()
    if (!draft.round.trim()) { setValidation('Enter a round name.'); return }
    if (draft.type === 'anagram' && !word) { setValidation('Enter the word or phrase to scramble.'); return }
    const prepared = draft.type === 'anagram' ? {...draft, round: draft.round.trim(), answer: word, duration: Math.max(10, draft.duration || 30), scramble: scrambleWord(word)} : {...draft, round: draft.round.trim()}
    update(g => { g.questions[selected] = prepared })
    setValidation('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }
  const duplicate = () => {
    const nextIndex = selected + 1
    update(g => { g.questions.splice(nextIndex, 0, { ...structuredClone(draft), id: crypto.randomUUID(), prompt: 'New question' }) })
    setSelected(nextIndex)
  }
  const move = (direction: -1 | 1) => {
    const nextIndex = selected + direction
    if (nextIndex < 0 || nextIndex >= game.questions.length) return
    update(g => { [g.questions[selected], g.questions[nextIndex]] = [g.questions[nextIndex], g.questions[selected]] })
    setSelected(nextIndex)
  }
  return <Shell active="Quiz editor"><main className="page editor-page"><div className="page-heading"><div><div className="eyebrow dark">QUIZ EDITOR</div><h1>{game.title}</h1><p>Edit sample prompts and explore the question formats.</p></div><Badge tone="amber">DEMO QUIZ</Badge></div><div className="editor-grid"><div className="editor-list"><div className="editor-list-head"><strong>Questions</strong><span>{game.questions.length}</span></div>{game.questions.map((q,i) => <button key={q.id} className={`question-row ${selected===i?'chosen':''}`} onClick={() => setSelected(i)}><span className="question-number">{String(i+1).padStart(2,'0')}</span><span><strong>{q.prompt}</strong><small>{q.round} · {q.type}</small></span></button>)}</div><div className="editor-form"><div className="form-top"><div><Badge>{draft.round}</Badge><h2>Question {selected+1}</h2></div><Badge tone="gray">{draft.points} points</Badge></div><div className="editor-round-row"><label>Round name<input value={draft.round} onChange={e=>setDraft({...draft,round:e.target.value})} placeholder="ROUND 1 · WARM UP"/></label><label>Question type<div className="fake-select">{typeNames[draft.type]} <ChevronDown size={16}/></div></label></div><label>Question prompt<textarea value={draft.prompt} onChange={e=>setDraft({...draft,prompt:e.target.value})}/></label>{draft.options && <label>Answer options<div className="option-edit">{draft.options.map((opt,i)=><input key={i} value={opt} onChange={e=>setDraft({...draft,options:draft.options?.map((v,j)=>j===i?e.target.value:v)})}/>)}</div></label>}{draft.type==='anagram'&&<label>Word or phrase to scramble<input value={String(draft.answer||'')} onChange={e=>setDraft({...draft,answer:e.target.value})} placeholder="e.g. Platypus"/><small className="field-help">The same jumble is shown to every player. Minimum timer: 10 seconds.</small></label>}{validation&&<div className="error">{validation}</div>}<div className="form-two"><label>Points<input type="number" value={draft.points} onChange={e=>setDraft({...draft,points:Number(e.target.value)})}/></label><label>Timer (seconds)<input type="number" value={draft.duration || 30} onChange={e=>setDraft({...draft,duration:Number(e.target.value)})}/></label></div><div className="editor-note"><CircleHelp size={18}/> Questions with the same round name play in one round, in list order. A round can contain any number and mix of question types. Full answer editing and validation are next milestones.</div><div className="editor-order-actions"><Button variant="secondary" onClick={duplicate}><Plus size={16}/> Duplicate this question</Button><Button variant="secondary" disabled={selected===0} onClick={()=>move(-1)}>Move up</Button><Button variant="secondary" disabled={selected===game.questions.length-1} onClick={()=>move(1)}>Move down</Button></div><div className="form-actions"><Button onClick={save}>{saved?<><Check size={17}/> Saved</>:<>Save question <ArrowRight size={17}/></>}</Button><Link className="text-link" to="/host">Go to Host <ArrowRight size={16}/></Link></div></div></div></main></Shell>
}
const phaseNames: Record<string,string> = {lobby:'Lobby', 'round-intro':'Round introduction', question:'Question display', open:'Answers open', closed:'Answers closed', reveal:'Answer reveal', scores:'Question scores', 'round-scores':'Round scores', leaderboard:'Overall leaderboard', final:'Final leaderboard', thanks:'Thank you', break:'Break', 'closed-game':'Session closed'}
function Host() {
  const game = useGame(), packs = usePacks(), q = currentQuestion(game), [copied,setCopied]=useState(false)
  const [liveStatus, setLiveStatus] = useState(''), [canControl, setCanControl] = useState(false), [liveBusy, setLiveBusy] = useState(false)
  const stopLive = useRef<(() => void) | null>(null)
  useEffect(() => () => { stopLive.current?.() }, [])
  const answered = q ? game.responses.filter(r=>r.questionId===q.id) : []
  const next = actionLabel(game.phase)
  const copy = async () => { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/join/${game.code}`);setCopied(true);setTimeout(()=>setCopied(false),1800) }
  const startLive = async () => {
    setLiveBusy(true)
    try { stopLive.current?.(); stopLive.current = await startLiveHost((message, control) => { setLiveStatus(message); setCanControl(control) }) }
    catch (error) { setLiveStatus(`Live setup failed: ${(error as Error).message}`) }
    finally { setLiveBusy(false) }
  }
  const liveAction = async (type: 'advance' | 'break' | 'resume' | 'void' | 'jump' | 'grade', extras: { index?: number; playerId?: string; points?: number } = {}) => {
    if (liveBusy || !canControl) return
    setLiveBusy(true)
    try { await liveHostCommand(game.stateVersion, { type, ...extras }); setLiveStatus('Live across devices') }
    catch (error) { setLiveStatus((error as Error).message) }
    finally { setLiveBusy(false) }
  }
  useEffect(() => {
    if (getLiveRole() !== 'host' || !canControl || game.phase !== 'open' || !game.closesAt) return
    const timer = window.setTimeout(() => {
      liveHostCommand(game.stateVersion, { type: 'advance' }).catch(error => setLiveStatus((error as Error).message))
    }, Math.max(0, game.closesAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [canControl, game.phase, game.closesAt, game.stateVersion])
  return <Shell active="Host console"><main className="page host-page"><div className="page-heading"><div><div className="eyebrow dark">LIVE HOST CONSOLE</div><h1>{game.title}</h1><p>Drive the room from here. Open Main screen and Player view in separate tabs.</p></div><div className="host-head-actions"><Link className="btn secondary" to={getLiveRole()==="host"?`/screen/${game.code}`:"/screen"} target="_blank"><MonitorPlay size={17}/> Open main screen</Link><Button variant="secondary" onClick={startLive} disabled={liveBusy || getLiveRole()==="host"}>{getLiveRole()==="host"?"Live connected":"Enable device sync"}</Button><Button variant="secondary" onClick={copy}><Copy size={16}/>{copied?'Copied':'Copy join link'}</Button></div></div>{liveStatus&&<div className="hint" role="status">{liveStatus}{getLiveRole()==="host"&&!canControl&&<button onClick={async()=>{try{await takeLiveControl()}catch(error){setLiveStatus((error as Error).message)}}}>Take Control</button>}</div>}<div className="host-status"><div><span className="status-orb"><Play size={18}/></span><div><small>CURRENT SCREEN</small><strong>{phaseNames[game.phase]}</strong></div></div><span className="host-code">GAME CODE <b>{game.code}</b></span><Countdown game={game} className="host-timer"/><span className="host-count"><Users size={18}/>{game.players.length} players</span></div><div className="host-grid"><div className="host-main"><div className="host-question"><div className="host-q-top"><Badge>{q?.round || 'ROUND 1'}</Badge><span>QUESTION {game.questionIndex+1} / {game.questions.length}</span></div><h2>{q?.prompt}</h2><div className="host-q-meta"><span><Clock3 size={16}/>{q?.duration || 30}s timer</span><span><Trophy size={16}/>{q?.points} pts</span><span>{q ? typeNames[q.type] : ''}</span></div>{q?.options && <div className="host-options">{q.options.map((o,i)=><div key={o}><span>{'ABCD'[i]}</span>{o}</div>)}</div>}</div><div className="control-card"><div><h3>Game controls</h3><p>Each action changes the presentation and player screens.</p></div><div className="control-buttons"><Button onClick={()=>getLiveRole()==='host'?liveAction(game.phase==='break'?'resume':'advance'):game.phase==='break'?resumeBreak(game.stateVersion):hostAction(game.stateVersion)} disabled={game.phase==='closed-game'||liveBusy||(getLiveRole()==='host'&&!canControl)}>{next}<ArrowRight size={18}/></Button>{['scores','round-scores','leaderboard','round-intro'].includes(game.phase)&&<Button variant="secondary" onClick={()=>getLiveRole()==="host"?liveAction("break"):takeBreak(game.stateVersion)}>Take a break</Button>}{['question','open','closed','reveal'].includes(game.phase)&&<Button variant="danger" onClick={()=>{if (confirm('Void this question? Its points will be removed.')) { if (getLiveRole()==='host') void liveAction('void'); else voidQuestion() }}}>Void question</Button>}</div></div><div className="response-card"><div className="card-title"><h3>Incoming answers</h3><Badge tone={game.phase==='open'?'green':'gray'}>{answered.length} / {game.players.length} submitted</Badge></div>{answered.length===0?<div className="empty-state">Player answers will appear here while the question is open.</div>:<div className="answer-list">{answered.map(r=>{const p=game.players.find(p=>p.id===r.playerId);if(!p)return null;const g=gradeFor(game,p.id,q.id);return <div key={p.id} className="answer-row"><div className="answer-player"><PlayerAvatar player={p} packs={packs}/><span><strong>{p.name}</strong><small>{new Date(r.submittedAt).toLocaleTimeString()}</small></span></div><span className="response-value">{typeof r.value==='object'?JSON.stringify(r.value):String(r.value)}</span>{['free','text'].includes(q.type)&&<div className="mark-buttons"><button onClick={()=>getLiveRole()==="host"?liveAction("grade",{playerId:p.id,points:q.points}):setGrade(p.id,q.points)}>✓</button><button onClick={()=>getLiveRole()==="host"?liveAction("grade",{playerId:p.id,points:0}):setGrade(p.id,0)}>✕</button></div>}{g&&<Badge tone={g.points?'green':'gray'}>{g.points} pts</Badge>}</div>})}</div>}</div></div><div className="host-side"><div className="side-card"><div className="card-title"><h3>Overall leaderboard</h3><Trophy size={19}/></div>{game.players.length===0?<p className="muted">Waiting for the first player to join.</p>:ranked(game.players).map((p,i)=><div className="rank-row" key={p.id}><span className="rank-num">{i+1}</span><PlayerAvatar player={p} packs={packs} size={34}/><strong>{p.name}</strong><b>{p.score}</b></div>)}</div><div className="side-card helper"><h3>Try the full flow</h3><ol><li>Open the main screen.</li><li>Join as a player in another tab.</li><li>Start the quiz and open answers.</li><li>Submit, reveal and score.</li></ol><Link to="/join" target="_blank">Open player tab <ExternalLink size={15}/></Link></div><div className="side-card demo-jump"><h3>Jump to a question</h3><p className="muted">Demo shortcut to try any question type.</p><select aria-label="Jump to question" value={game.questionIndex} onChange={e=>getLiveRole()==="host"?liveAction("jump",{index:Number(e.target.value)}):jumpToQuestion(Number(e.target.value))}>{game.questions.map((item,index)=><option key={item.id} value={index}>{index+1}. {typeNames[item.type]}</option>)}</select></div><Button variant="ghost" disabled={getLiveRole()==="host"} onClick={()=>{if(confirm('Reset this demo game and remove demo players?'))resetGame()}}><RotateCcw size={16}/> Reset demo</Button></div></div></main></Shell>
}
function MainScreen() {
  const { code } = useParams()
  const [connectionError, setConnectionError] = useState('')
  useEffect(() => code ? followLiveScreen(code, setConnectionError) : undefined, [code])
  const game=useGame(), packs=usePacks(), q=currentQuestion(game)
  const showQ=['question','open','closed','reveal'].includes(game.phase)
  const ranking=ranked(game.players)
  const answerText= q ? (typeof q.answer==='object'?Array.isArray(q.answer)?q.answer.join(' · '):Object.entries(q.answer).map(([a,b])=>`${a} → ${b}`).join(' · '):String(q.answer ?? 'Host marked')) : ''
  return <div className="screen">{connectionError&&<div className="error" role="alert">{connectionError}</div>}<div className="screen-top"><div className="screen-event"><strong>{game.title}</strong><small>{q?.round || "GET READY TO PLAY"}</small></div><div className="screen-code"><small>JOIN CODE</small><b>{game.code}</b><span className="screen-live">● LIVE</span></div></div><div className="screen-content">{game.phase==='lobby'?<div className="screen-lobby"><span className="big-star">✦</span><div className="eyebrow">GET READY TO PLAY</div><h1>{game.title}</h1><p>Join on your phone at this site with code</p><div className="giant-code">{game.code}</div><div className="joined-avatars">{game.players.slice(0,8).map(p=><PlayerAvatar key={p.id} player={p} packs={packs} size={64}/>)}</div><small>{game.players.length} {game.players.length===1?'player':'players'} joined</small></div>:game.phase==='round-intro'?<div className="screen-centre"><span className="round-kicker">UP NEXT</span><h1>{q.round.replace(' · ','\n')}</h1><p>Get ready. The next question is coming.</p></div>:showQ?<div className="screen-question"><div className="screen-q-head"><span>{q.round}</span><span>QUESTION {game.questionIndex+1} / {game.questions.length}</span></div><div className="screen-type"><span>{typeNames[q.type]}</span><p>{typeInstructions[q.type]}</p></div><h1>{q.prompt}</h1>{q.type==='anagram'&&game.phase!=='reveal'&&<AnagramBoard game={game} question={q}/>}{q.options&&<div className="screen-options">{q.options.map((o,i)=><div key={o} className={"option-"+i+(game.phase==="reveal" && (Array.isArray(q.answer)?q.answer.includes(o):q.answer===o)?" correct":"")}><b>{'ABCD'[i]}</b>{o}</div>)}</div>}{['ordering','matching','categorise'].includes(q.type)&&q.items&&<div className="screen-items">{q.items.map(item=><span key={item}>{item}</span>)}</div>}<Countdown game={game} className="screen-timer"/>{game.phase==='reveal'?<div className="screen-answer"><small>THE ANSWER</small><strong>{answerText}</strong></div>:<div className="screen-footline"><span>{game.phase==='open'?'Answers open':game.phase==='closed'?'Answers closed':'Get ready to answer'}</span><span>{game.responses.filter(r=>r.questionId===q.id).length} answers received</span></div>}</div>:['scores','round-scores','leaderboard','final'].includes(game.phase)?<div className="screen-scores"><span className="round-kicker">{game.phase==="round-scores"?q.round:game.phase==="scores"?"AFTER THIS QUESTION":game.phase==="final"?"THE FINAL RESULTS":"ALL ROUNDS"}</span><h1>{game.phase==="round-scores"?"Round scores":game.phase==="final"?"Our champions":game.phase==="scores"?"Question complete":"Leaderboard"}</h1><div className="screen-ranks">{(game.phase==="round-scores"?rankedRound(game,q.round):ranking).slice(0,10).map(p=><div key={p.id}><span>#{p.rank}</span><PlayerAvatar player={p} packs={packs} size={52}/><strong>{p.name}</strong><b>{(game.phase==="round-scores"?roundPoints(game,p.id,q.round):p.score).toLocaleString()}</b></div>)}</div></div>:<div className="screen-centre"><span className="big-star">✦</span><h1>{game.phase==='break'?'Time for a breather':game.phase==='thanks'?'Thanks for playing!':'Game over'}</h1><p>{game.phase==='break'?'We’ll be right back.':'What a brilliant game.'}</p></div>}</div><div className="screen-bottom"><PoweredByQuizForge/><span>{phaseNames[game.phase].toUpperCase()}</span></div></div>
}
function Join() {
  const { code: routeCode } = useParams()
  const game=useGame(), packs=usePacks(), [name,setName]=useState(''), [selected,setSelected]=useState('default-blue'), [packId,setPackId]=useState('default'), [error,setError]=useState(''), [code,setCode]=useState(routeCode || localStorage.getItem('quiz-live-host-code') || localStorage.getItem('quiz-live-player-code') || game.code), [answer,setAnswer]=useState<unknown>(''), [sent,setSent]=useState(false)
  const [submitting, setSubmitting] = useState(false), [readyQuestionId, setReadyQuestionId] = useState(''), [joining, setJoining] = useState(false)
  const [ownResultPoints, setOwnResultPoints] = useState<number | null>(null)
  const [playerId,setPlayerId]=useState(sessionStorage.getItem('quiz-demo-player-id')||'')
  const player=game.players.find(p=>p.id===playerId), q=currentQuestion(game), pack=packs.find(p=>p.id===packId)
  const existing=player&&q?responseFor(game,player.id,q.id):undefined
  useEffect(()=>{setAnswer(q?.type==='multi'||q?.type==='ordering'||q?.type==='list'?[]:q?.type==='matching'||q?.type==='categorise'?{}:'');setSent(false)},[q?.id,q?.type])
  useEffect(() => {
    const reconnectCode = routeCode || localStorage.getItem('quiz-live-player-code')
    if (!reconnectCode) return
    reconnectLivePlayer(reconnectCode, setReadyQuestionId, setOwnResultPoints, setError).then(id => { if (id) setPlayerId(id) }).catch(e => setError((e as Error).message))
  }, [routeCode])
  const join=async()=>{
    if (joining) return
    setJoining(true)
    try {
      const tryLive = code.toUpperCase() !== game.code || localStorage.getItem('quiz-live-host-code') === code.toUpperCase()
      const liveId = tryLive ? await joinLiveGame(code,name,selected,setReadyQuestionId,setOwnResultPoints,setError) : null
      if (liveId) setPlayerId(liveId)
      else { if(code.toUpperCase()!==game.code)throw new Error('That game code is not active.'); setPlayerId(joinGame(name,selected)) }
      setError('')
    } catch(e) { setError((e as Error).message) }
    finally { setJoining(false) }
  }
  const submit=async()=>{
    if (submitting) return
    setSubmitting(true)
    try {
      if (getLiveRole()==='player') { await submitLiveAnswer(answer); setSent(false) }
      else { const solved=submitAnswer(playerId,answer); setSent(solved===false) }
      setError('')
    } catch(e) { setError((e as Error).message) }
    finally { setSubmitting(false) }
  }
  const choice=(option:string)=>{const arr=Array.isArray(answer)?answer as string[]:[];setAnswer(arr.includes(option)?arr.filter(x=>x!==option):[...arr,option])}
  const isLocked=!!existing&&(q.type!=='anagram'||getLiveRole()==='player')
  const buttonDisabled=submitting||isLocked||game.phase!=='open'||answer===''||(Array.isArray(answer)&&answer.length===0)
  return <div className="player-app"><div className="player-head"><div className="player-event">{game.title}<small>{player ? "PLAYER CONTROLLER" : "JOIN THE GAME"}</small></div><span className="player-demo" aria-hidden="true">⌜</span></div>{!player?<div className="join-card"><div className="join-intro"><div className="eyebrow dark">JOIN THE GAME</div><p>Enter the game code, choose your look, and you’re in.</p></div><label>GAME CODE<input className="code-input" maxLength={6} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label><label>YOUR NAME<input maxLength={24} placeholder="What should we call you?" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&join()}/></label><div className="avatar-section"><div className="avatar-heading"><strong>Choose an avatar</strong><span>{packs.reduce((n,p)=>n+p.avatars.length,0)} to pick from</span></div><div className="pack-tabs">{packs.map(p=><button key={p.id} className={packId===p.id?'selected':''} onClick={()=>setPackId(p.id)}>{p.name}</button>)}</div><div className="avatar-grid">{pack?.avatars.map(a=><button key={a.id} className={selected===a.id?'picked':''} title={a.name} onClick={()=>setSelected(a.id)}><img src={avatarSrc(a.id,packs)} alt={a.name}/>{selected===a.id&&<span><Check size={12}/></span>}</button>)}</div></div>{error&&<div className="error">{error}</div>}<Button onClick={join} disabled={joining}>{joining?"Joining…":"Join game"} <ArrowRight size={18}/></Button></div>:<div className="player-session"><div className="player-identity"><PlayerAvatar player={player} packs={packs} size={52}/><div><strong>{player.name}</strong><span>{player.score.toLocaleString()} points</span></div><Badge tone="green">● LIVE</Badge></div>{game.phase==='lobby'?<div className="player-wait"><span>✦</span><h1>You're in!</h1><p>Waiting for the host to begin. Keep this tab open.</p><div className="wait-code">GAME CODE <b>{game.code}</b></div></div>:game.phase==='round-intro'?<div className="player-wait"><span>✦</span><div className="eyebrow dark">COMING UP</div><h1>{q.round}</h1><p>Get ready for your next question.</p></div>:['question','open','closed','reveal'].includes(game.phase)?<div className="player-question"><div className="player-question-top"><span>QUESTION {game.questionIndex+1} OF {game.questions.length}</span><span>{q.points} PTS</span></div><Countdown game={game} className="player-timer"/><div className="player-question-card"><span className="player-type">{typeNames[q.type]}</span><h1>{game.phase==='question'?'Look at the main screen':q.prompt}</h1><p>{game.phase==='question'?'Answer controls will appear here when the Host opens answers.':typeInstructions[q.type]}</p></div>{getLiveRole()==='player'&&readyQuestionId!==q.id?<div className="player-wait small"><span>⌛</span><h2>Reconnecting</h2><p>Checking your answer status…</p></div>:submitting?<div className="player-wait small"><span>⌛</span><h2>Submitting</h2><p>Waiting for the game to confirm your answer.</p></div>:game.phase==='question'?<div className="player-wait small"><span>⌛</span><h2>Question on screen</h2><p>Answers will open in a moment.</p></div>:game.phase==='closed'?<div className="player-wait small"><span>⌛</span><h2>Answers are closed</h2><p>Waiting for the host to reveal the answer.</p></div>:game.phase==='reveal'?<div className="player-wait small"><span>✦</span><h2>Answer revealed</h2><p>Look up at the main screen for the answer.</p></div>:existing&&(q.type!=='anagram'||(player&&!!gradeFor(game,player.id,q.id)?.points))?<div className="player-wait small"><span>✓</span><h2>Answer locked in</h2><p>Waiting for everyone else.</p></div>:<><div className="answers-open" role="status"><span/><div>Answers are open<small>Choose your answer and submit it now.</small></div></div><AnswerInput q={q} value={answer} setValue={setAnswer} choice={choice}/>{error&&<div className="error">{error}</div>}{sent&&q.type==='anagram'&&<div className="hint">Not quite. Try again!</div>}<Button onClick={submit} disabled={buttonDisabled}>{submitting?"Submitting…":"Submit answer"} <ArrowRight size={18}/></Button></>}</div>:['scores','round-scores','leaderboard','final'].includes(game.phase)?<div className="player-wait"><Trophy size={50}/><h1>{game.phase==="round-scores"?"Round scores":game.phase==="final"?"Final results":game.phase==="leaderboard"?"Overall leaderboard":"Question complete"}</h1><p>{game.phase==="round-scores"?"You scored "+roundPoints(game,player.id,q.round).toLocaleString()+" points in "+q.round+".":"You have "+player.score.toLocaleString()+" points overall."}</p>{ownResultPoints!==null&&<p>This question: {ownResultPoints.toLocaleString()} points</p>}<div className="player-rank">Rank #{ranked(game.players).find(p=>p.id===player.id)?.rank || '—'}</div></div>:<div className="player-wait"><span>✦</span><h1>{game.phase==='break'?'Quick break':'Thanks for playing!'}</h1><p>{game.phase==='break'?'Stay right here.':'You made quiz night great.'}</p></div>}</div>}<div className="player-footer"><PoweredByQuizForge/><span>PIXELPLAY</span></div></div>
}
function AnswerInput({q,value,setValue,choice}:{q:Question;value:unknown;setValue:(v:unknown)=>void;choice:(v:string)=>void}) {
  if(q.type==='single'||q.type==='boolean') return <div className="choice-list">{(q.type==='boolean'?['True','False']:q.options||[]).map((o,i)=><button key={o} className={value===(q.type==='boolean'?(o==='True'):o)?'active':''} onClick={()=>setValue(q.type==='boolean'?(o==='True'):o)}><b>{'ABCD'[i]}</b>{o}</button>)}</div>
  if(q.type==='multi') return <div className="choice-list">{q.options?.map((o,i)=><button key={o} className={(value as string[]).includes(o)?'active':''} onClick={()=>choice(o)}><b>{'ABCD'[i]}</b>{o}</button>)}</div>
  if(q.type==='ordering') {const items=q.items||[];const order=Array.isArray(value)?value as string[]:[];return <div><p className="input-help">Tap each item in order.</p><div className="choice-list">{items.map(o=><button key={o} className={order.includes(o)?'active':''} onClick={()=>choice(o)}><b>{order.includes(o)?order.indexOf(o)+1:'+'}</b>{o}</button>)}</div><button className="clear-link" onClick={()=>setValue([])}>Clear order</button></div>}
  if(q.type==='matching'||q.type==='categorise') return <div className="match-list">{q.items?.map(item=><label key={item}>{item}<select value={(value as Record<string,string>)[item]||''} onChange={e=>setValue({...value as object,[item]:e.target.value})}><option value="">Choose…</option>{(q.type==='matching'?q.options:q.categories)?.map(o=><option key={o}>{o}</option>)}</select></label>)}</div>
  if(q.type==='list') return <div className="list-input">{[0,1,2].map(i=><input key={i} placeholder={`Answer ${i+1}`} value={(value as string[])[i]||''} onChange={e=>{const next=[...(value as string[])];next[i]=e.target.value;setValue(next)}}/>)}</div>
  if(q.type==='number'||q.type==='closest') return <input className="answer-text" type="number" placeholder="Your number" value={value as string} onChange={e=>setValue(e.target.value)}/>
  if(q.type==='free') return <textarea className="answer-text" placeholder="Type your answer…" value={value as string} onChange={e=>setValue(e.target.value)}/>
  return <div>{q.type==='anagram'&&<div className="scramble">{[...(q.scramble||String(q.answer||'').toUpperCase())].join(' ')}</div>}<input className="answer-text" placeholder={q.type==='anagram'?'Unscramble it…':'Type your answer…'} value={value as string} onChange={e=>setValue(e.target.value)}/></div>
}
function Admin() { return <Shell active="Admin preview"><main className="page"><div className="page-heading"><div><div className="eyebrow dark">PLATFORM CONTROL</div><h1>Admin dashboard</h1><p>A preview of the controls planned for platform operators.</p></div><Badge tone="amber">PLANNED</Badge></div><div className="feature-grid admin-grid">{[{icon:Users,title:'Organisers',desc:'Approve accounts and manage access.'},{icon:Edit3,title:'Quizzes',desc:'Browse and review platform quizzes.'},{icon:Gamepad2,title:'Games',desc:'View sessions and retained results.'},{icon:Sparkles,title:'Avatar packs',desc:'Manage built-in character collections.'},{icon:Eye,title:'Themes',desc:'Set visual presets and branding.'},{icon:ShieldCheck,title:'Audit',desc:'Review important platform changes.'}].map(x=><div className="feature-card" key={x.title}><div className="feature-icon lilac"><x.icon size={22}/></div><h3>{x.title}</h3><p>{x.desc}</p><span>Future build milestone <ArrowRight size={16}/></span></div>)}</div><div className="editor-note admin-note"><CircleHelp size={18}/> The live Firebase admin role, approval workflow and audit log are not wired into this preview.</div></main></Shell> }
function App() { return <HashRouter><Routes><Route path="/" element={<Home/>}/><Route path="/organiser" element={<Organiser/>}/><Route path="/editor" element={<Editor/>}/><Route path="/host" element={<Host/>}/><Route path="/screen" element={<MainScreen/>}/><Route path="/screen/:code" element={<MainScreen/>}/><Route path="/join" element={<Join/>}/><Route path="/join/:code" element={<Join/>}/><Route path="/admin" element={<Admin/>}/></Routes></HashRouter> }
export default App
