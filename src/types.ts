export type Category = 'STRAIGHT_UP' | 'ON_THE_ROCKS' | 'NON_CHILLED'

export interface Drink {
  id: string
  name: string
  category: Category
  baseFinishSec: number
  startTempC: number
  idealDilution?: number
  iceSurface?: 'large' | 'standard' | 'crushed' | null
}

export interface FinishedDrink {
  drink: Drink
  finishedAt: number
  waitSec: number
  tempC: number
  dilution?: number
  penalties: { label: string; value: number }[]
}
