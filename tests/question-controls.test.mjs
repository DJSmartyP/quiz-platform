import test from 'node:test'
import assert from 'node:assert/strict'
import { isAnswerComplete, sampleQuestions, scoreAnswer } from '../src/model.ts'

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
  assert.equal(isAnswerComplete(list, ['Red', 'Green', '']), false)
  assert.equal(isAnswerComplete(list, ['Red', 'Green', 'Blue']), true)
  assert.equal(isAnswerComplete(question('boolean'), false), true)
})

test('photo questions use text answers and standard scoring', () => {
  const reveal = { id: 'photo-1', round: 'Picture round', type: 'photo-reveal', prompt: 'What is it?', imageUrl: 'data:image/webp;base64,test', answer: 'Platypus', points: 1000 }
  const zoom = { ...reveal, id: 'photo-2', type: 'photo-zoom' }
  assert.equal(isAnswerComplete(reveal, ''), false)
  assert.equal(isAnswerComplete(reveal, 'Platypus'), true)
  assert.equal(scoreAnswer(reveal, ' platypus '), 1000)
  assert.equal(scoreAnswer(zoom, 'duck'), 0)
})
