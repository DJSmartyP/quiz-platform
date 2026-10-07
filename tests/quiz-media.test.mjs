import test from 'node:test'
import assert from 'node:assert/strict'
import { freshGame } from '../src/model.ts'
import { publicGame } from '../src/publicGame.ts'
import { parseQuizMediaRef, quizMediaRef, withPublishedMedia } from '../src/quizMedia.ts'

test('private quiz media references are valid and do not reveal future or answer images', async () => {
  const game = freshGame()
  const questionImage = quizMediaRef('host123', 'image-1')
  const answerImage = quizMediaRef('host123', 'answer-1')
  game.questions = [
    { ...game.questions[0], imageUrl: questionImage, answerImageUrl: answerImage },
    { ...game.questions[0], id: 'future', imageUrl: quizMediaRef('host123', 'future-image') },
  ]
  assert.deepEqual(parseQuizMediaRef(questionImage), { ownerUid: 'host123', mediaId: 'image-1' })
  assert.equal(parseQuizMediaRef('https://example.com/photo.webp'), null)
  const question = withPublishedMedia(publicGame({ ...game, phase: 'question' }), { questionId: game.questions[0].id, imageUrl: 'data:image/webp;base64,image-1' })
  assert.equal(question.questions[0].imageUrl, 'data:image/webp;base64,image-1')
  assert.equal(question.questions[0].answerImageUrl, undefined)
  assert.equal(question.questions[1].imageUrl, undefined)
  const reveal = withPublishedMedia(publicGame({ ...game, phase: 'reveal' }), { questionId: game.questions[0].id, imageUrl: 'data:image/webp;base64,image-1', answerImageUrl: 'data:image/webp;base64,answer-1' })
  assert.equal(reveal.questions[0].answerImageUrl, 'data:image/webp;base64,answer-1')
  assert.equal(reveal.questions[1].imageUrl, undefined)
  const waiting = withPublishedMedia(publicGame({ ...game, phase: 'question' }), null)
  assert.equal(waiting.questions[0].imageUrl, undefined)
})

test('fifty uploaded image references keep quiz and public state small', () => {
  const game = freshGame()
  game.questions = Array.from({ length: 50 }, (_, index) => ({
    ...game.questions[0],
    id: `question-${index}`,
    imageUrl: quizMediaRef('host123', `image-${index}`),
    answerImageUrl: quizMediaRef('host123', `answer-${index}`),
  }))
  game.phase = 'question'
  assert.ok(JSON.stringify(game).length < 100_000)
  const published = publicGame(game)
  assert.ok(JSON.stringify(published).length < 100_000)
  assert.equal(published.questions[1].imageUrl, undefined)
  assert.equal(published.questions[0].answerImageUrl, undefined)
})
