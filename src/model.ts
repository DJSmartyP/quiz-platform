export type QuestionType = 'single' | 'multi' | 'boolean' | 'text' | 'free' | 'number' | 'closest' | 'ordering' | 'matching' | 'categorise' | 'list' | 'anagram' | 'photo-reveal' | 'photo-zoom'
export type QuizTheme = 'quiz-show' | 'western' | 'neon-sci-fi' | 'arcane-fantasy' | 'monster-mash' | 'celebration'

export type ThemeSceneCopy = {
  kicker: string
  title: string
  screen: string
  playerTitle: string
  player: string
  symbol: string
}

export type QuizThemeDefinition = {
  name: string
  description: string
  break: ThemeSceneCopy
  finale: ThemeSceneCopy
}

export const quizThemes: Record<QuizTheme, QuizThemeDefinition> = {
  'quiz-show': {
    name: 'Quiz Show', description: 'Marquee bulbs, spotlights and prime-time energy.',
    break: { kicker: 'STUDIO INTERMISSION', title: "We'll be right back", screen: 'The studio is taking a quick breather. Grab a drink and stay tuned for the next round.', playerTitle: 'Stay tuned', player: 'Keep this page open. The Host will bring the show back automatically.', symbol: 'Ⅱ' },
    finale: { kicker: "THAT'S A WRAP", title: 'What a show!', screen: 'The final scores are in. Thanks for stepping into the XP Play spotlight.', playerTitle: 'Thanks for playing!', player: "You helped make tonight's show a hit.", symbol: '✦' },
  },
  western: {
    name: 'Western', description: 'Timber, lanterns and a dramatic desert sunset.',
    break: { kicker: 'TRAIL-SIDE BREAK', title: 'Rest your horses', screen: 'Water the horses, grab a refreshment and meet us back at the saloon for the next round.', playerTitle: 'Hold your horses', player: 'Keep this page open. The Host will call everyone back to the trail automatically.', symbol: 'Ⅱ' },
    finale: { kicker: 'HAPPY TRAILS', title: 'The final bell has rung', screen: 'The scores are settled. Thanks for riding into quiz night with us.', playerTitle: 'Fine quizzing, partner!', player: 'The trail ends here, but you made it one to remember.', symbol: '★' },
  },
  'neon-sci-fi': {
    name: 'Neon Sci-Fi', description: 'Holograms, starfields and electric control panels.',
    break: { kicker: 'SYSTEM PAUSE', title: 'Recharging the quiz core', screen: 'Power cells are cycling and the next round is loading. Stand by at your station.', playerTitle: 'Console on standby', player: 'Keep this console connected. Command will resume the mission automatically.', symbol: 'Ⅱ' },
    finale: { kicker: 'MISSION COMPLETE', title: 'Final transmission received', screen: 'The scores are locked in the star log. Thanks for joining the XP Play mission.', playerTitle: 'Mission accomplished!', player: 'Your final transmission has been recorded.', symbol: '◈' },
  },
  'arcane-fantasy': {
    name: 'Arcane Fantasy', description: 'Crystals, spell books and moonlit magic.',
    break: { kicker: 'ARCANE INTERMISSION', title: 'Restore your mana', screen: 'The quiz grimoire is resting. Refresh your potions before the next chapter begins.', playerTitle: 'The spell is paused', player: 'Keep this portal open. The Quizmaster will summon everyone back automatically.', symbol: 'Ⅱ' },
    finale: { kicker: 'QUEST COMPLETE', title: 'The final spell is cast', screen: 'The scores are sealed in the grimoire. Thank you, brave quizzers, for completing the quest.', playerTitle: 'Quest complete!', player: 'Your deeds will be remembered in the XP Play chronicles.', symbol: '✧' },
  },
  'monster-mash': {
    name: 'Monster Mash', description: 'A playful haunted mansion full of glowing potions.',
    break: { kicker: 'MIDNIGHT INTERMISSION', title: 'The monsters need a breather', screen: 'Refill your potion and stretch your claws. The next frightful round will begin shortly.', playerTitle: 'Rest your claws', player: "Keep this crypt open. The Host will wake the game automatically.", symbol: 'Ⅱ' },
    finale: { kicker: 'DAWN HAS BROKEN', title: 'A frightfully good game!', screen: 'The final scores have crawled out of the crypt. Thanks for joining our monster mash.', playerTitle: 'You survived quiz night!', player: 'Thanks for making this a monstrously good game.', symbol: '☾' },
  },
  celebration: {
    name: 'Celebration', description: 'Balloons, confetti and a sparkling party stage.',
    break: { kicker: 'PARTY PAUSE', title: 'Refill and recharge', screen: 'Top up the snacks and save some energy. The next round of the party starts soon.', playerTitle: 'Party paused', player: 'Keep this page open. The Host will restart the celebration automatically.', symbol: 'Ⅱ' },
    finale: { kicker: 'GRAND FINALE', title: 'What a celebration!', screen: 'The confetti has fallen and the final scores are in. Thanks for bringing the party to XP Play.', playerTitle: 'Thanks for celebrating!', player: 'You brought brilliant energy to the game.', symbol: '★' },
  },
}

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
  scramble?: string
  imageUrl?: string
  imageAlt?: string
}

export type Player = { id: string; name: string; avatarId: string; score: number }
export type Response = { playerId: string; questionId: string; value: unknown; submittedAt: number }
export type Grade = { playerId: string; questionId: string; points: number; committed: boolean }
export type Phase = 'lobby' | 'round-intro' | 'question' | 'open' | 'closed' | 'reveal' | 'scores' | 'round-scores' | 'leaderboard' | 'final' | 'thanks' | 'break' | 'closed-game'
export type Game = {
  code: string
  title: string
  theme: QuizTheme
  roundThemes?: Record<string, QuizTheme>
  phase: Phase
  returnPhase?: Phase
  questionIndex: number
  stateVersion: number
  allowLateJoins: boolean
  openedAt?: number
  closesAt?: number
  closedAt?: number
  players: Player[]
  responses: Response[]
  grades: Grade[]
  questions: Question[]
}

export const typeNames: Record<QuestionType, string> = {
  single: 'Single choice', multi: 'Multi-select', boolean: 'True or false', text: 'Text answer',
  free: 'Free response', number: 'Number', closest: 'Closest wins', ordering: 'Ordering',
  matching: 'Matching', categorise: 'Categorise', list: 'Multi-part list', anagram: 'Anagram',
  'photo-reveal': 'Photo reveal', 'photo-zoom': 'Zoomed photo',
}

export const typeInstructions: Record<QuestionType, string> = {
  single: 'Tap one answer on your phone, then submit.',
  multi: 'Tap every correct answer on your phone, then submit.',
  boolean: 'Tap True or False on your phone, then submit.',
  text: 'Type your answer on your phone, then submit.',
  free: 'Write a response on your phone for the Host to mark.',
  number: 'Enter the exact number on your phone, then submit.',
  closest: 'Enter your best number guess on your phone. Closest wins.',
  ordering: 'Tap the items on your phone in the correct order.',
  matching: 'Choose a partner for each item on your phone.',
  categorise: 'Choose a category for each item on your phone.',
  list: 'Fill in each answer box on your phone, then submit.',
  anagram: 'Type the unjumbled word on your phone before time runs out.',
  'photo-reveal': 'Watch the picture appear, then type what you think it is.',
  'photo-zoom': 'Watch the picture zoom out, then type what you think it is.',
}

export function scrambleWord(answer: string): string {
  return answer.replace(/[A-Za-z]{2,}/g, word => {
    const letters = word.toUpperCase().split('')
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const shuffled = [...letters]
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      if (shuffled.join('') !== letters.join('')) return shuffled.join('')
    }
    const other = letters.findIndex(letter => letter !== letters[0])
    if (other < 0) return word.toUpperCase()
    ;[letters[0], letters[other]] = [letters[other], letters[0]]
    return letters.join('')
  })
}

export function anagramDisplay(answer: string, scramble: string, elapsedSeconds: number, duration: number) {
  const source = answer.toUpperCase()
  const positions = [...source].map((char, index) => /[A-Z]/.test(char) ? index : -1).filter(index => index >= 0)
  const progress = Math.min(1, Math.max(0, elapsedSeconds / Math.max(duration, 1)))
  const lockedCount = Math.min(Math.max(0, positions.length - 2), Math.floor(progress * positions.length))
  const remaining = [...scramble.toUpperCase()].filter(char => /[A-Z]/.test(char))
  const display = [...source]
  for (const index of positions.slice(0, lockedCount)) {
    const removeAt = remaining.indexOf(source[index])
    if (removeAt >= 0) remaining.splice(removeAt, 1)
  }
  const expectedRemaining = positions.slice(lockedCount).map(index => source[index]).join('')
  if (remaining.join('') === expectedRemaining) {
    const swapAt = remaining.findIndex(letter => letter !== remaining[0])
    if (swapAt > 0) {
      const first = remaining[0]
      remaining[0] = remaining[swapAt]
      remaining[swapAt] = first
    }
  }
  let cursor = 0
  for (const index of positions.slice(lockedCount)) display[index] = remaining[cursor++] || source[index]
  return { text: display.join(''), lockedCount, positions }
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
  code: 'PEAK7', title: 'The Great Quiz Night', theme: 'quiz-show', phase: 'lobby', questionIndex: 0,
  stateVersion: 1, allowLateJoins: true, players: [], responses: [], grades: [],
  questions: sampleQuestions.map(q => q.type === 'anagram' ? { ...q, scramble: scrambleWord(String(q.answer)) } : { ...q }),
})

export const normalise = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
export const currentQuestion = (game: Game) => game.questions[game.questionIndex]
export const currentTheme = (game: Game): QuizTheme => {
  const roundPhase = ['round-intro', 'question', 'open', 'closed', 'reveal', 'scores', 'round-scores', 'leaderboard', 'break'].includes(game.phase)
  return roundPhase ? game.roundThemes?.[currentQuestion(game)?.round] || game.theme || 'quiz-show' : game.theme || 'quiz-show'
}
export const isLastQuestionInRound = (game: Game) => game.questionIndex === game.questions.length - 1 || game.questions[game.questionIndex + 1]?.round !== currentQuestion(game)?.round
export const roundPoints = (game: Game, playerId: string, round: string) => game.grades
  .filter(g => g.playerId === playerId && g.committed && game.questions.find(q => q.id === g.questionId)?.round === round)
  .reduce((total, g) => total + g.points, 0)
export const rankedRound = (game: Game, round: string) => [...game.players]
  .map(player => ({ ...player, roundScore: roundPoints(game, player.id, round) }))
  .sort((a, b) => b.roundScore - a.roundScore || a.name.localeCompare(b.name))
  .map((player, index, players) => ({ ...player, rank: players.findIndex(p => p.roundScore === player.roundScore) + 1 || index + 1 }))
export const responseFor = (game: Game, playerId: string, questionId: string) => game.responses.find(r => r.playerId === playerId && r.questionId === questionId)
export const gradeFor = (game: Game, playerId: string, questionId: string) => game.grades.find(g => g.playerId === playerId && g.questionId === questionId)

export function isAnswerComplete(q: Question, answer: unknown): boolean {
  if (q.type === 'matching' || q.type === 'categorise') {
    const choices = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer as Record<string, unknown> : {}
    return Boolean(q.items?.length) && q.items!.every(item => typeof choices[item] === 'string' && Boolean((choices[item] as string).trim()))
  }
  if (q.type === 'ordering') return Boolean(q.items?.length) && Array.isArray(answer) && q.items!.every(item => answer.includes(item))
  if (q.type === 'list') {
    const expected = Array.isArray(q.answer) ? q.answer.length : 3
    return expected > 0 && Array.isArray(answer) && Array.from({ length: expected }, (_, index) => index).every(index => typeof answer[index] === 'string' && Boolean(answer[index].trim()))
  }
  if (q.type === 'multi') return Array.isArray(answer) && answer.length > 0
  return typeof answer === 'string' ? Boolean(answer.trim()) : answer !== undefined && answer !== null
}

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
    case 'photo-reveal':
    case 'photo-zoom': {
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
