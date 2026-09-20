import test from 'node:test'
import assert from 'node:assert/strict'
import { isAnswerComplete, sampleQuestions } from '../src/model.ts'

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
