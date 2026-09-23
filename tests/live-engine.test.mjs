import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceGame, breakGame, resumeGame } from '../src/gameEngine.ts'
import { publicGame } from '../src/publicGame.ts'
import { answerLabel, resultForAnswer } from '../src/reveal.ts'

const question = (id, round, answer = 'Mars') => ({ id, round, type: 'single', prompt: `Question ${id}`, options: ['Mars', 'Venus'], answer, points: 1000, duration: 30 })
const player = id => ({ id, name: id, avatarId: 'default-blue', score: 0 })
const base = () => ({ code: 'TEST12', title: 'Test', phase: 'lobby', questionIndex: 0, stateVersion: 1,
  allowLateJoins: true, players: [player('a'), player('b')], responses: [], grades: [],
  questions: [question('q1', 'Round 1'), question('q2', 'Round 1'), question('q3', 'Round 2')] })

test('Host phases open controls only after question display and preserve per-round boundaries', () => {
  let game = base()
  game = advanceGame(game)
  assert.equal(game.phase, 'round-intro')
  game = advanceGame(game)
  assert.equal(game.phase, 'question')
  game = advanceGame(game)
  assert.equal(game.phase, 'open')
  assert.ok(game.closesAt > game.openedAt)
  game = advanceGame(game)
  assert.equal(game.phase, 'closed')
  game = advanceGame(game)
  assert.equal(game.phase, 'reveal')
  game = advanceGame(game)
  assert.equal(game.phase, 'scores')
  game = advanceGame(game)
  assert.equal(game.questionIndex, 1)
  assert.equal(game.phase, 'question')
})

test('finalising a question creates one committed grade per Player and a later round score', () => {
  let game = base()
  game.phase = 'reveal'
  game.openedAt = 1000
  game.responses = [{ playerId: 'a', questionId: 'q1', value: 'Mars', submittedAt: 3000 }]
  game = advanceGame(game)
  assert.deepEqual(game.players.map(p => p.score), [1000, 0])
  assert.equal(game.grades.filter(g => g.questionId === 'q1').length, 2)
  const unchanged = advanceGame({ ...game, phase: 'reveal' })
  assert.deepEqual(unchanged.players.map(p => p.score), [1000, 0])
  game.questionIndex = 1
  game.phase = 'reveal'
  game.responses = [{ playerId: 'b', questionId: 'q2', value: 'Mars', submittedAt: 3000 }]
  game = advanceGame(game)
  assert.equal(game.phase, 'round-scores')
  assert.deepEqual(game.players.map(p => p.score), [1000, 1000])
  assert.equal(game.grades.filter(g => g.committed).length, 4)
})

test('break and resume are state driven and versioned', () => {
  const game = { ...base(), phase: 'round-scores' }
  const paused = breakGame(game)
  assert.equal(paused.phase, 'break')
  assert.equal(paused.returnPhase, 'round-scores')
  assert.equal(paused.stateVersion, 2)
  const resumed = resumeGame(paused)
  assert.equal(resumed.phase, 'round-scores')
  assert.equal(resumed.stateVersion, 3)
  assert.equal(resumed.returnPhase, undefined)
})

test('public state withholds future questions, answer keys and private submissions', () => {
  const imageUrl = 'data:image/webp;base64,active-question'
  const game = { ...base(), phase: 'open', responses: [{ playerId: 'a', questionId: 'q1', value: 'Mars', submittedAt: 1000 }],
    grades: [{ playerId: 'a', questionId: 'q1', points: 1000, committed: false }] }
  game.questions[0].imageUrl = imageUrl
  game.questions[1].imageUrl = 'data:image/webp;base64,future-question'
  const before = publicGame(game)
  assert.equal(before.questions[0].prompt, 'Question q1')
  assert.equal(before.questions[0].answer, undefined)
  assert.equal(before.questions[1].prompt, '')
  assert.equal(before.questions[1].answer, undefined)
  assert.equal(before.questions[0].imageUrl, imageUrl)
  assert.equal(before.questions[1].imageUrl, undefined)
  assert.deepEqual(before.responses, [])
  assert.deepEqual(before.grades, [])
  const revealed = publicGame({ ...game, phase: 'reveal' })
  assert.equal(revealed.questions[0].answer, 'Mars')
  assert.equal(revealed.questions[1].answer, undefined)
})

test('own reveal distinguishes right, wrong, partial and unmarked answers', () => {
  const q = question('q1', 'Round 1')
  const response = value => ({ playerId: 'a', questionId: 'q1', value, submittedAt: 3000 })
  assert.deepEqual(resultForAnswer(q, response('Mars'), undefined, [], 1000), { points: 1000, verdict: 'correct' })
  assert.deepEqual(resultForAnswer(q, response('Venus'), undefined, [], 1000), { points: 0, verdict: 'incorrect' })
  assert.deepEqual(resultForAnswer(q, undefined, undefined, [], 1000), { points: 0, verdict: 'incorrect' })
  const manual = { ...q, type: 'free', answer: undefined }
  assert.deepEqual(resultForAnswer(manual, response('A creative reply'), undefined, [], 1000), { points: 0, verdict: 'pending' })
  assert.deepEqual(resultForAnswer(manual, response('A creative reply'), { points: 500 }, [], 1000), { points: 500, verdict: 'partial' })
  const anagram = { ...q, type: 'anagram', answer: 'Platypus' }
  assert.deepEqual(resultForAnswer(anagram, response('platypus'), undefined, [], -28000), { points: 0, verdict: 'correct' })
  assert.equal(answerLabel({ France: 'Paris', Italy: 'Rome' }), 'France → Paris · Italy → Rome')
})

test('closest-answer reveal uses the submitted field, including ties', () => {
  const q = { ...question('q1', 'Round 1', 100), type: 'closest' }
  const replies = [
    { playerId: 'a', questionId: 'q1', value: 99, submittedAt: 3000 },
    { playerId: 'b', questionId: 'q1', value: 101, submittedAt: 3000 },
    { playerId: 'c', questionId: 'q1', value: 90, submittedAt: 3000 },
  ]
  assert.equal(resultForAnswer(q, replies[0], undefined, replies, 1000).verdict, 'correct')
  assert.equal(resultForAnswer(q, replies[1], undefined, replies, 1000).verdict, 'correct')
  assert.equal(resultForAnswer(q, replies[2], undefined, replies, 1000).verdict, 'incorrect')
})
