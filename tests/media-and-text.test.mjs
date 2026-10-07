import test from 'node:test'
import assert from 'node:assert/strict'
import { freshGame, scrambleWord, anagramDisplay } from '../src/model.ts'
import { publicGame } from '../src/publicGame.ts'
import { presentationImage, questionMediaSize } from '../src/questionMedia.ts'
import { normaliseQuestion, scoreQuestion } from '../src/scoring.ts'

test('answer images stay private until reveal, preserve question images and fall back for older packs', () => {
  const game = freshGame()
  const question = { ...game.questions[0], type: 'photo-reveal', imageUrl: 'silhouette.webp', imageAlt: 'Silhouette', answerImageUrl: 'solution.webp', answerImageAlt: 'Full photograph', answer: 'Platypus' }
  game.questions = [question, { ...question, id: 'future' }]
  for (const phase of ['lobby', 'question', 'open', 'closed', 'break']) {
    const shared = publicGame({ ...game, phase })
    assert.equal(shared.questions[0].answerImageUrl, undefined)
    assert.equal(shared.questions[0].answerImageAlt, undefined)
    assert.equal(presentationImage(question, phase).url, 'silhouette.webp')
  }
  const released = publicGame({ ...game, phase: 'reveal' })
  assert.deepEqual(presentationImage(released.questions[0], 'reveal'), { url: 'solution.webp', alt: 'Full photograph' })
  assert.equal(released.questions[0].answer, 'Platypus')
  assert.equal(released.questions[1].answerImageUrl, undefined)
  const legacy = { ...question, answerImageUrl: undefined }
  assert.equal(presentationImage(legacy, 'reveal').url, 'silhouette.webp')
  const imported = normaliseQuestion(JSON.parse(JSON.stringify(question)))
  assert.equal(imported.answerImageUrl, question.answerImageUrl)
  assert.equal(questionMediaSize(imported), question.imageUrl.length + question.answerImageUrl.length)
})

test('photo choice options are public only for the current question and the answer stays hidden', () => {
  const game = freshGame()
  const question = { ...game.questions[0], type: 'photo-zoom', photoAnswerMode: 'choice', options: ['Mars', 'Venus', 'Jupiter'], answer: 'Mars' }
  game.questions = [question, { ...question, id: 'future' }]
  const shared = publicGame({ ...game, phase: 'open' })
  assert.equal(shared.questions[0].photoAnswerMode, 'choice')
  assert.deepEqual(shared.questions[0].options, question.options)
  assert.equal(shared.questions[0].answer, undefined)
  assert.equal(shared.questions[1].options, undefined)
  assert.equal(shared.questions[1].photoAnswerMode, undefined)
  assert.equal(publicGame({ ...game, phase: 'reveal' }).questions[0].answer, 'Mars')
})

test('written answers score private variants while revealing only the primary wording', () => {
  const game = freshGame()
  const question = normaliseQuestion({ ...game.questions[0], type: 'text', answer: [' New York ', ' New York City ', 'NYC', ''] })
  game.questions = [question]
  assert.deepEqual(question.answer, ['New York', 'New York City', 'NYC'])
  for (const value of question.answer) {
    const result = scoreQuestion(question, [{ playerId: 'a', questionId: question.id, value, submittedAt: 1000 }], ['a'], { openedAt: 0 })
    assert.equal(result[0].verdict, 'correct')
  }
  assert.equal(publicGame({ ...game, phase: 'open' }).questions[0].answer, undefined)
  assert.equal(publicGame({ ...game, phase: 'reveal' }).questions[0].answer, 'New York')
  assert.deepEqual(question.answer, ['New York', 'New York City', 'NYC'])
})

test('anagrams shuffle across word boundaries while preserving punctuation and the letter inventory', t => {
  t.mock.method(Math, 'random', () => 0)
  assert.equal(scrambleWord('A B'), 'B A')
  const answer = 'AB CD!'
  const scramble = scrambleWord(answer)
  assert.equal(scramble, 'BC DA!')
  for (const elapsed of [0, 5, 12, 30]) {
    const display = anagramDisplay(answer, scramble, elapsed, 30)
    assert.deepEqual([...display.text].sort(), [...answer].sort())
  }
  assert.equal(anagramDisplay(answer, scramble, 30, 30).text, answer)
  assert.equal(scrambleWord('AAA AA'), 'AAA AA')
})
