import test from 'node:test'
import assert from 'node:assert/strict'
import { groupQuestionsByRound, insertInRound, moveToRound, roundNames } from '../src/rounds.ts'

const question = (id, round) => ({ id, round })

test('new questions enter their round rather than the end of the quiz', () => {
  const original = [question('a', 'Round 1'), question('b', 'Round 1'), question('c', 'Round 2')]
  const inserted = insertInRound(original, question('d', 'Round 1'))
  assert.deepEqual(inserted.questions.map(item => item.id), ['a', 'b', 'd', 'c'])
  assert.equal(inserted.index, 2)
  assert.deepEqual(original.map(item => item.id), ['a', 'b', 'c'])
  assert.deepEqual(roundNames(inserted.questions), ['Round 1', 'Round 2'])
})

test('moving questions between rounds preserves consecutive round blocks', () => {
  const original = [question('a', 'Round 1'), question('b', 'Round 1'), question('c', 'Round 2'), question('d', 'Round 3')]
  const moved = moveToRound(original, 'a', 'Round 3')
  assert.deepEqual(moved.questions.map(item => `${item.round}:${item.id}`), ['Round 1:b', 'Round 2:c', 'Round 3:d', 'Round 3:a'])
  assert.equal(moved.index, 3)
  const newRound = insertInRound(moved.questions, question('e', 'Round 4'))
  assert.deepEqual(roundNames(newRound.questions), ['Round 1', 'Round 2', 'Round 3', 'Round 4'])
})

test('older split rounds are grouped without changing order within each round', () => {
  const legacy = [question('a', 'Round 1'), question('b', 'Round 2'), question('c', 'Round 1'), question('d', 'Round 2')]
  assert.deepEqual(groupQuestionsByRound(legacy).map(item => item.id), ['a', 'c', 'b', 'd'])
})
