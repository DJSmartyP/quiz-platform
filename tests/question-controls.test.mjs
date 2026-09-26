import test from 'node:test'
import assert from 'node:assert/strict'
import { anagramDisplay, currentTheme, isAnswerComplete, sampleQuestions } from '../src/model.ts'
import { normaliseQuestion, scoreQuestion } from '../src/scoring.ts'

const question = type => sampleQuestions.find(item => item.type === type)

test('structured answers require every requested control before submission', () => {
  const matching = question('matching')
  assert.equal(isAnswerComplete(matching, {}), false)
  assert.equal(isAnswerComplete(matching, { France: 'Paris', Italy: 'Rome' }), false)
  assert.equal(isAnswerComplete(matching, { France: 'Paris', Italy: 'Rome', Spain: 'Madrid' }), true)

  const categorise = question('categorise')
  assert.equal(isAnswerComplete(categorise, { Apple: 'Fruit' }), false)
  assert.equal(isAnswerComplete(categorise, { Apple: 'Fruit', Carrot: 'Vegetable', Banana: 'Fruit', Pea: 'Vegetable' }), true)

  const ordering = question('ordering')
  assert.equal(isAnswerComplete(ordering, ['Moon landing']), false)
  assert.equal(isAnswerComplete(ordering, ordering.items), true)

  const list = question('list')
  assert.equal(isAnswerComplete(list, ['Red', 'Green', '']), true)
  assert.equal(isAnswerComplete(list, ['Red', 'Green', 'Blue']), true)
  assert.equal(isAnswerComplete(question('boolean'), false), true)
})

test('photo questions use text answers and progressive reveal scoring', () => {
  const reveal = { id: 'photo-1', round: 'Picture round', type: 'photo-reveal', prompt: 'What is it?', imageUrl: 'data:image/webp;base64,test', answer: 'Platypus', points: 1000 }
  const zoom = { ...reveal, id: 'photo-2', type: 'photo-zoom' }
  assert.equal(isAnswerComplete(reveal, ''), false)
  assert.equal(isAnswerComplete(reveal, 'Platypus'), true)
  const response = (questionId, value, submittedAt) => ({ playerId: 'p1', questionId, value, submittedAt })
  assert.equal(scoreQuestion(reveal, [response(reveal.id, ' platypus ', 1000)], ['p1'], { openedAt: 1000 })[0].points, 1000)
  assert.equal(scoreQuestion(zoom, [response(zoom.id, 'duck', 1000)], ['p1'], { openedAt: 1000 })[0].points, 0)
})

test('legacy scoreMode imports are accepted but removed during normalisation', () => {
  const legacy = { id: 'legacy', round: 'Round', type: 'single', prompt: 'Pick', options: ['A', 'B'], answer: 'A', points: 1000, duration: 30, scoreMode: 'time' }
  const migrated = normaliseQuestion(legacy)
  assert.equal(migrated.scoreMode, undefined)
  assert.equal(migrated.placementMode, 'none')
})

test('anagram waits five seconds then solves deterministic random positions', () => {
  const answer = 'PLATYPUS'
  const scramble = 'YPLUTAPS'
  const atStart = anagramDisplay(answer, scramble, 0, 30)
  const atFive = anagramDisplay(answer, scramble, 5, 30)
  const midway = anagramDisplay(answer, scramble, 18, 30)
  const repeated = anagramDisplay(answer, scramble, 18, 30)
  const complete = anagramDisplay(answer, scramble, 30, 30)
  assert.equal(atStart.lockedCount, 0)
  assert.equal(atFive.lockedCount, 0)
  assert.ok(midway.lockedCount > 0 && midway.lockedCount < answer.length)
  assert.deepEqual(midway.lockedPositions, repeated.lockedPositions)
  assert.notDeepEqual(midway.lockedPositions, [...midway.lockedPositions].sort((a, b) => a - b))
  assert.equal(complete.text, answer)
  assert.equal(complete.lockedCount, answer.length)
})

test('photo reveal overlay becomes transparent as tiles disappear', async () => {
  const css = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/brand.css', import.meta.url), 'utf8'))
  assert.match(css, /\.photo-cover\{[^}]*background:transparent/)
})

test('main screen stays inside one viewport and auto-fits oversized question slides', async () => {
  const css = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/brand.css', import.meta.url), 'utf8'))
  const app = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'))
  assert.match(css, /\.screen\{[^}]*height:100dvh[^}]*overflow:hidden/)
  assert.match(css, /\.screen-content\{[^}]*min-height:0[^}]*overflow:hidden/)
  assert.match(css, /\.theme-surface\.screen>\.screen-top\{position:sticky/)
  assert.match(css, /\.theme-surface\.screen>\.screen-content\{padding-top:12px/)
  assert.match(css, /\.question-media\{[^}]*height:clamp\(230px,31vh,370px\)[^}]*margin:0 auto 24px/)
  assert.ok(app.includes('new ResizeObserver(fitSlide)'))
  assert.ok(app.includes('slide.style.setProperty(\'--slide-scale\', String(scale))'))
  assert.ok(app.includes('ref={slideRef} className={`screen-question ${q.imageUrl?"has-media":""}`}'))
  assert.ok(app.includes('className="screen-centre round-intro-screen"'))
  assert.match(css, /\.round-intro-screen\{[^}]*justify-content:center/)
})

test('intro, round and exit themes are selected independently', () => {
  const game = {
    theme: 'quiz-show',
    introTheme: 'world-tour',
    exitTheme: 'pixel-cinema',
    roundThemes: { 'Picture round': 'neon-sci-fi' },
    phase: 'question',
    questionIndex: 0,
    questions: [{ id: 'q1', round: 'Picture round', type: 'single', prompt: 'Question', options: ['A', 'B'], answer: 'A', points: 1000 }],
  }
  assert.equal(currentTheme(game), 'neon-sci-fi')
  assert.equal(currentTheme({ ...game, phase: 'break' }), 'neon-sci-fi')
  assert.equal(currentTheme({ ...game, phase: 'final' }), 'pixel-cinema')
  assert.equal(currentTheme({ ...game, phase: 'thanks' }), 'pixel-cinema')
  assert.equal(currentTheme({ ...game, phase: 'lobby' }), 'world-tour')
})
