import test from 'node:test'
import assert from 'node:assert/strict'
import { questionInstruction, roundScore, scoreQuestion, scoringSummary } from '../src/scoring.ts'

const base = (type, answer, extras = {}) => ({ id: `q-${type}`, round: 'Round', type, prompt: 'Question', answer, points: 1000, duration: 30, ...extras })
const reply = (question, playerId, value, submittedAt = 1000, submittedAtServer) => ({ playerId, questionId: question.id, value, submittedAt, submittedAtServer })
const byPlayer = grades => Object.fromEntries(grades.map(grade => [grade.playerId, grade]))

test('scores binary, partial multi-select and unanswered players', () => {
  const single = base('single', 'A', { options: ['A', 'B'] })
  const grades = byPlayer(scoreQuestion(single, [reply(single, 'a', 'A'), reply(single, 'b', 'B')], ['a', 'b', 'c']))
  assert.deepEqual([grades.a.points, grades.b.points, grades.c.points], [1000, 0, 0])
  assert.deepEqual([grades.a.verdict, grades.b.verdict, grades.c.verdict], ['correct', 'incorrect', 'unanswered'])

  const multi = base('multi', ['A', 'B'], { options: ['A', 'B', 'C', 'D'] })
  const multiGrades = byPlayer(scoreQuestion(multi, [reply(multi, 'one', ['A']), reply(multi, 'penalty', ['A', 'B', 'C']), reply(multi, 'all', ['A', 'B', 'C', 'D'])], ['one', 'penalty', 'all']))
  assert.equal(multiGrades.one.points, 500)
  assert.equal(multiGrades.penalty.points, 500)
  assert.equal(multiGrades.all.points, 0)
})

test('number bands choose the highest qualifying band and round to tens', () => {
  const question = base('number', 100, { numberBands: [{ tolerance: 1, fraction: 1 }, { tolerance: 3, fraction: .75 }, { tolerance: 5, fraction: .5 }] })
  const grades = byPlayer(scoreQuestion(question, [reply(question, 'exact', 100), reply(question, 'near', 103), reply(question, 'wide', 95), reply(question, 'miss', 106)], ['exact', 'near', 'wide', 'miss']))
  assert.deepEqual([grades.exact.points, grades.near.points, grades.wide.points, grades.miss.points], [1000, 750, 500, 0])
  assert.equal(roundScore(666.6), 670)
})

test('closest awards every valid answer by competition rank including ties', () => {
  const question = base('closest', 100)
  const grades = byPlayer(scoreQuestion(question, [reply(question, 'a', 99), reply(question, 'b', 101), reply(question, 'c', 90), reply(question, 'bad', 'x')], ['a', 'b', 'c', 'bad', 'none']))
  assert.deepEqual([grades.a.rank, grades.b.rank, grades.c.rank], [1, 1, 3])
  assert.deepEqual([grades.a.points, grades.b.points, grades.c.points], [1000, 1000, 330])
  assert.equal(grades.bad.points, 0)
  assert.equal(grades.none.verdict, 'unanswered')
})

test('ordering, matching, categorise and list award robust proportional credit', () => {
  const ordering = base('ordering', ['A', 'B', 'C', 'D'])
  assert.equal(scoreQuestion(ordering, [reply(ordering, 'p', ['A', 'C', 'B', 'D'])], ['p'])[0].points, 830)
  assert.equal(scoreQuestion(ordering, [reply(ordering, 'p', ['A'])], ['p'])[0].points, 0)

  const matching = base('matching', { A: '1', B: '2', C: '3' })
  assert.equal(scoreQuestion(matching, [reply(matching, 'p', { A: '1', B: 'x', C: '3' })], ['p'])[0].points, 670)
  const categorise = { ...matching, id: 'q-categorise', type: 'categorise' }
  assert.equal(scoreQuestion(categorise, [reply(categorise, 'p', { A: '1' })], ['p'])[0].points, 330)

  const list = base('list', ['Red', 'Green', 'Blue'])
  assert.equal(scoreQuestion(list, [reply(list, 'p', ['red', 'RED', 'blue'])], ['p'])[0].points, 670)
})

test('progressive questions score visible help and never fall below twenty percent', () => {
  const anagram = base('anagram', 'PLATYPUS', { scramble: 'YPLUTAPS' })
  assert.equal(scoreQuestion(anagram, [reply(anagram, 'early', 'platypus', 4000)], ['early'], { openedAt: 0 })[0].points, 1000)
  assert.equal(scoreQuestion(anagram, [reply(anagram, 'late', 'platypus', 30000)], ['late'], { openedAt: 0 })[0].points, 200)

  const reveal = base('photo-reveal', 'Duck')
  const zoom = base('photo-zoom', 'Duck')
  assert.equal(scoreQuestion(reveal, [reply(reveal, 'p', 'duck', 15000)], ['p'], { openedAt: 0 })[0].points, 600)
  assert.equal(scoreQuestion(zoom, [reply(zoom, 'p', 'duck', 15000)], ['p'], { openedAt: 0 })[0].points, 600)
})

test('fastest correct uses authoritative server order, correct-only denominator and shared ties', () => {
  const question = base('text', ['Mars'], { placementMode: 'fastest-correct' })
  const server = (seconds, nanoseconds) => ({ seconds, nanoseconds })
  const responses = [
    reply(question, 'first', 'Mars', 999999, server(10, 1)),
    reply(question, 'tie', 'mars', 1, server(10, 1)),
    reply(question, 'last', 'Mars', 0, server(20, 0)),
    reply(question, 'wrong', 'Venus', 0, server(5, 0)),
  ]
  const grades = byPlayer(scoreQuestion(question, responses, ['first', 'tie', 'last', 'wrong']))
  assert.deepEqual([grades.first.rank, grades.tie.rank, grades.last.rank], [1, 1, 3])
  assert.deepEqual([grades.first.points, grades.tie.points, grades.last.points, grades.wrong.points], [1000, 1000, 700, 0])
})

test('written answers without accepted answers remain pending until a manual grade is preserved', () => {
  const question = base('text', [])
  const response = reply(question, 'p', 'Creative answer')
  assert.equal(scoreQuestion(question, [response], ['p'])[0].verdict, 'pending')
  const manual = { playerId: 'p', questionId: question.id, points: 500, committed: false, verdict: 'partial', detail: 'Host awarded partial credit', source: 'manual' }
  assert.deepEqual(scoreQuestion(question, [response], ['p'], { existingGrades: [manual] })[0], manual)
})

test('text answers auto-mark accepted wording and queue other wording for Host verification', () => {
  const question = base('text', ['Edinburgh', 'Edinburgh City'])
  const exact = scoreQuestion(question, [reply(question, 'exact', ' edinburgh ')], ['exact'])[0]
  const review = scoreQuestion(question, [reply(question, 'review', 'Auld Reekie')], ['review'])[0]
  assert.equal(exact.verdict, 'correct')
  assert.equal(exact.points, 1000)
  assert.equal(review.verdict, 'pending')
  assert.match(review.detail, /Host verification/)
  const manual = { playerId: 'review', questionId: question.id, points: 1000, committed: false, verdict: 'correct', detail: 'Host awarded full credit', source: 'override' }
  assert.deepEqual(scoreQuestion(question, [reply(question, 'review', 'Auld Reekie')], ['review'], { existingGrades: [manual] })[0], manual)
})

test('legacy free responses migrate to the combined written-answer type', async () => {
  const { normaliseQuestion } = await import('../src/scoring.ts')
  const withReference = normaliseQuestion(base('free', 'Expected wording'))
  const withoutReference = normaliseQuestion(base('free', undefined))
  assert.equal(withReference.type, 'text')
  assert.deepEqual(withReference.answer, ['Expected wording'])
  assert.equal(scoreQuestion(withReference, [reply(withReference, 'match', 'expected wording')], ['match'])[0].verdict, 'correct')
  assert.equal(withoutReference.type, 'text')
  assert.deepEqual(withoutReference.answer, [])
  assert.equal(scoreQuestion(withoutReference, [reply(withoutReference, 'review', 'Creative reply')], ['review'])[0].verdict, 'pending')
})

test('player instructions state both the mechanic and the scoring rule', () => {
  const closest = base('closest', 100)
  assert.match(questionInstruction(closest), /Closest position|closest position/i)
  assert.match(scoringSummary(closest), /Closest position/)
  const fastest = base('single', 'A', { placementMode: 'fastest-correct' })
  assert.match(questionInstruction(fastest), /Earlier correct answers score more/)
  assert.match(scoringSummary(fastest), /Fastest correct/)
})
