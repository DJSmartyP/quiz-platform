export type QuestionType = 'single' | 'multi' | 'boolean' | 'text' | 'free' | 'number' | 'closest' | 'ordering' | 'matching' | 'categorise' | 'list' | 'anagram'

export type Question = {
  id: string
  type: QuestionType
  round: string
  prompt: string
  points: number
  duration?: number
  options?: string[]
  items?: string[]
  categories?: string[]
  answer?: string | string[] | Record<string, string> | number | boolean
  tolerance?: number
  explanation?: string
}

export type Player = { id: string; name: string; avatarId: string; score: number }
export type Response = { playerId: string; questionId: string; value: unknown; submittedAt: number }
export type Grade = { playerId: string; questionId: string; points: number; committed: boolean }
export type Phase = 'lobby' | 'round-intro' | 'question' | 'open' | 'closed' | 'reveal' | 'scores' | 'final' | 'thanks' | 'break' | 'closed-game'
export type Game = {
  code: string
  title: string
  phase: Phase
  returnPhase?: Phase
  questionIndex: number
  stateVersion: number
  allowLateJoins: boolean
  openedAt?: number
  players: Player[]
  responses: Response[]
  grades: Grade[]
  questions: Question[]
}

export const typeNames: Record<QuestionType, string> = {
  single: 'Single choice', multi: 'Multi-select', boolean: 'True or false', text: 'Text answer',
  free: 'Free response', number: 'Number', closest: 'Closest wins', ordering: 'Ordering',
  matching: 'Matching', categorise: 'Categorise', list: 'Multi-part list', anagram: 'Anagram',
}

export const sampleQuestions: Question[] = [
  { id: 'q1', round: 'ROUND 1 · WARM UP', type: 'single', prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], answer: 'Mars', points: 1000, duration: 30, explanation: 'Mars gets its reddish colour from iron oxide on its surface.' },
  { id: 'q2', round: 'ROUND 1 · WARM UP', type: 'multi', prompt: 'Which of these are mammals?', options: ['Dolphin', 'Shark', 'Bat', 'Penguin'], answer: ['Dolphin', 'Bat'], points: 1000, duration: 30 },
  { id: 'q3', round: 'ROUND 1 · WARM UP', type: 'boolean', prompt: 'A platypus lays eggs.', answer: true, points: 1000, duration: 20 },
  { id: 'q4', round: 'ROUND 1 · WARM UP', type: 'text', prompt: 'What is the capital city of Scotland?', answer: ['Edinburgh'], points: 1000, duration: 30 },
  { id: 'q5', round: 'ROUND 1 · WARM UP', type: 'free', prompt: 'Invent a name for a new theme park ride.', points: 1000, duration: 45 },
  { id: 'q6', round: 'ROUND 2 · THINK FAST', type: 'number', prompt: 'How many sides does a dodecagon have?', answer: 12, tolerance: 0, points: 1000, duration: 25 },
  { id: 'q7', round: 'ROUND 2 · THINK FAST', type: 'closest', prompt: 'In what year did the first modern Olympic Games take place?', answer: 1896, points: 1000, duration: 30 },
  { id: 'q8', round: 'ROUND 2 · THINK FAST', type: 'ordering', prompt: 'Put these events in chronological order, earliest first.', items: ['Moon landing', 'First iPhone', 'World Wide Web invented'], answer: ['Moon landing', 'World Wide Web invented', 'First iPhone'], points: 1000, duration: 45 },
  { id: 'q9', round: 'ROUND 2 · THINK FAST', type: 'matching', prompt: 'Match each country to its capital.', items: ['France', 'Italy', 'Spain'], options: ['Paris', 'Rome', 'Madrid'], answer: { France: 'Paris', Italy: 'Rome', Spain: 'Madrid' }, points: 1200, duration: 45 },
  { id: 'q10', round: 'ROUND 2 · THINK FAST', type: 'categorise', prompt: 'Sort these into the right category.', items: ['Apple', 'Carrot', 'Banana', 'Pea'], categories: ['Fruit', 'Vegetable'], answer: { Apple: 'Fruit', Carrot: 'Vegetable', Banana: 'Fruit', Pea: 'Vegetable' }, points: 1200, duration: 45 },
  { id: 'q11', round: 'ROUND 2 · THINK FAST', type: 'list', prompt: 'Name the three primary colours of light.', answer: ['Red', 'Green', 'Blue'], points: 1200, duration: 45 },
  { id: 'q12', round: 'ROUND 2 · THINK FAST', type: 'anagram', prompt: 'Unscramble the word.', answer: 'Platypus', points: 1000, duration: 30 },
]

export const freshGame = (): Game => ({
  code: 'PEAK7', title: 'The Great Quiz Night', phase: 'lobby', questionIndex: 0,
  stateVersion: 1, allowLateJoins: true, players: [], responses: [], grades: [], questions: sampleQuestions,
})

export const normalise = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
export const currentQuestion = (game: Game) => game.questions[game.questionIndex]
export const responseFor = (game: Game, playerId: string, questionId: string) => game.responses.find(r => r.playerId === playerId && r.questionId === questionId)
export const gradeFor = (game: Game, playerId: string, questionId: string) => game.grades.find(g => g.playerId === playerId && g.questionId === questionId)

export function scoreAnswer(q: Question, value: unknown, elapsedSeconds = 0): number {
  if (value === undefined || value === null || value === '') return 0
  const full = q.points
  switch (q.type) {
    case 'single': return value === q.answer ? full : 0
    case 'boolean': return value === q.answer ? full : 0
    case 'multi': {
      const correct = (q.answer as string[] || []).map(normalise).sort().join('|')
      const given = (Array.isArray(value) ? value : []).map(String).map(normalise).sort().join('|')
      return given === correct ? full : 0
    }
    case 'text': {
      const accepted = Array.isArray(q.answer) ? q.answer : [q.answer]
      return accepted.some(a => normalise(String(a)) === normalise(String(value))) ? full : 0
    }
    case 'number': return Math.abs(Number(value) - Number(q.answer)) <= (q.tolerance ?? 0) ? full : 0
    case 'ordering': return JSON.stringify(value) === JSON.stringify(q.answer) ? full : 0
    case 'matching':
    case 'categorise': {
      const answer = q.answer as Record<string, string>
      const given = value as Record<string, string>
      const keys = Object.keys(answer)
      return Math.round(full * keys.filter(k => given?.[k] === answer[k]).length / keys.length)
    }
    case 'list': {
      const expected = (q.answer as string[]).map(normalise)
      const supplied = new Set((Array.isArray(value) ? value : []).map(String).map(normalise))
      return Math.round(full * expected.filter(a => supplied.has(a)).length / expected.length)
    }
    case 'anagram': {
      if (normalise(String(value)) !== normalise(String(q.answer))) return 0
      const duration = q.duration ?? 30
      if (elapsedSeconds <= 5) return full
      return Math.max(0, Math.round(full * (duration - elapsedSeconds) / (duration - 5)))
    }
    case 'closest':
    case 'free': return 0
  }
}

export function ranked(players: Player[]) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return sorted.map((player, index) => ({ ...player, rank: sorted.findIndex(p => p.score === player.score) + 1 || index + 1 }))
}
