import type { Category, Drink, FinishedDrink } from './types'

// Простая термомодель: экспоненциальное приближение к комнатной температуре
export function tempAt(waitSec: number, T0: number, ambient = 22, tauSec = 120) {
  const t = Math.max(0, waitSec)
  return ambient + (T0 - ambient) * Math.exp(-t / tauSec)
}

// Простая модель разбавления на льду: линейно по времени, скорость зависит от льда
export function dilutionAt(waitSec: number, surface: 'large' | 'standard' | 'crushed' | null = 'standard') {
  const rate =
    surface === 'large' ? 0.004 :
    surface === 'crushed' ? 0.008 :
    0.0055 // standard
  return Math.min(0.6, Math.max(0, waitSec * rate))
}

// Рекомендованный порядок категорий (быстро деградируют — позже финишим)
export const recommendedOrder: Category[] = ['NON_CHILLED', 'ON_THE_ROCKS', 'STRAIGHT_UP']

export function generateOrders(): Drink[] {
  return [
    { id: '1', name: 'Martini',        category: 'STRAIGHT_UP',  baseFinishSec: 12, startTempC: -4 },
    { id: '2', name: 'Manhattan',      category: 'STRAIGHT_UP',  baseFinishSec: 12, startTempC: -3 },
    { id: '3', name: 'Old Fashioned',  category: 'ON_THE_ROCKS', baseFinishSec: 10, startTempC: 0, idealDilution: 0.33, iceSurface: 'large' },
    { id: '4', name: 'Whiskey Highball', category: 'ON_THE_ROCKS', baseFinishSec: 8, startTempC: 0, idealDilution: 0.33, iceSurface: 'standard' },
    { id: '5', name: 'Gin & Tonic',    category: 'ON_THE_ROCKS', baseFinishSec: 8, startTempC: 0, idealDilution: 0.33, iceSurface: 'crushed' },
    { id: '6', name: 'Beer',           category: 'NON_CHILLED',  baseFinishSec: 5, startTempC: 6 },
    { id: '7', name: 'White Wine',     category: 'NON_CHILLED',  baseFinishSec: 5, startTempC: 7 },
  ]
}

export function sortByFinishQueue(drinks: Drink[], queue: Category[]) {
  const orderIndex = new Map(queue.map((c, i) => [c, i]))
  return [...drinks].sort((a, b) => {
    const ia = orderIndex.get(a.category) ?? 99
    const ib = orderIndex.get(b.category) ?? 99
    if (ia !== ib) return ia - ib
    return a.baseFinishSec - b.baseFinishSec
  })
}

export function simulateFinish(
  drinksInOrder: Drink[]
): { finished: FinishedDrink[]; totalSec: number; windowSec: number } {
  let clock = 0
  const finishTimes: number[] = []
  const finished: FinishedDrink[] = []

  for (const d of drinksInOrder) {
    const wait = clock
    clock += d.baseFinishSec

    let penalties: { label: string; value: number }[] = []
    let temp = d.startTempC

    if (d.category === 'STRAIGHT_UP') {
      temp = tempAt(wait, d.startTempC, 22, 120)
      if (temp > 0) penalties.push({ label: 'Тёплый straight-up (>0°C)', value: (temp / 10) * 12 })
    } else if (d.category === 'ON_THE_ROCKS') {
      const dil = dilutionAt(wait, d.iceSurface ?? 'standard')
      const ideal = d.idealDilution ?? 0.33
      const delta = Math.abs(dil - ideal)
      penalties.push({ label: 'Разбавление не по цели', value: delta * 80 })
      // temp на льду условно ок — штраф по T не считаем
    } else {
      temp = tempAt(wait, d.startTempC, 22, 240)
      if (temp > 12) penalties.push({ label: 'Потеря холода напитка без льда', value: (temp - 10) * 2 })
    }

    let dilution: number | undefined = undefined
    if (d.category === 'ON_THE_ROCKS') {
      dilution = dilutionAt(wait, d.iceSurface ?? 'standard')
    }

    finished.push({
      drink: d,
      finishedAt: clock,
      waitSec: wait,
      tempC: temp,
      dilution,
      penalties
    })
    finishTimes.push(clock)
  }

  const totalSec = clock
  const windowSec = finishTimes.length ? Math.max(...finishTimes) - Math.min(...finishTimes) : 0
  return { finished, totalSec, windowSec }
}

export function scoreRound(finished: FinishedDrink[], windowSec: number, chosenOrder: Category[]) {
  let score = 100
  const breakdown: { label: string; value: number }[] = []

  if (windowSec > 60) {
    const p = (windowSec - 60) * 0.2
    breakdown.push({ label: 'Длинное окно между первым/последним', value: p })
    score -= p
  }

  const badOrder = orderPenalty(recommendedOrder, chosenOrder)
  if (badOrder > 0) {
    breakdown.push({ label: 'Порядок категорий не оптимален', value: badOrder })
    score -= badOrder
  }

  for (const f of finished) {
    for (const p of f.penalties) {
      score -= p.value
    }
  }

  score = Math.max(0, Math.min(100, score))
  return { score, breakdown }
}

function orderPenalty(reco: Category[], chosen: Category[]) {
  const pos = new Map<Category, number>()
  reco.forEach((c, i) => pos.set(c, i))
  let inversions = 0
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      const a = pos.get(chosen[i]) ?? 0
      const b = pos.get(chosen[j]) ?? 0
      if (a > b) inversions++
    }
  }
  return inversions * 6
}
