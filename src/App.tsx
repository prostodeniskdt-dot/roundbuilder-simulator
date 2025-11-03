import React, { useMemo, useState } from 'react'
import { Category, Drink, FinishedDrink } from './types'
import {
  generateOrders,
  recommendedOrder,
  scoreRound,
  sortByFinishQueue,
  tempAt,
  dilutionAt
} from './gameLogic'

type Phase = 'SETUP' | 'RUNNING' | 'RESULTS'

const CATEGORY_LABEL: Record<Category, string> = {
  STRAIGHT_UP: 'Straight-Up (ниже 0 °C, без льда)',
  ON_THE_ROCKS: 'На льду (0 °C)',
  NON_CHILLED: 'Без льда (выше 0 °C)'
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('SETUP')
  const [orders, setOrders] = useState<Drink[]>(() => generateOrders())
  const [queue, setQueue] = useState<Category[]>([])
  const [clock, setClock] = useState(0) // «текущее время» раунда (сек)
  const [remaining, setRemaining] = useState<Drink[]>([]) // что ещё не финишировано
  const [timeline, setTimeline] = useState<FinishedDrink[]>([]) // уже финишировано
  const [result, setResult] = useState<{
    score: number
    windowSec: number
    totalSec: number
    breakdown: { label: string; value: number }[]
  } | null>(null)

  // Предпросмотр очереди: как бы шло «по правилам»
  const sortedPreview = useMemo(() => sortByFinishQueue(orders, queue), [orders, queue])
  const canStart = queue.length === 3

  function toggleCategory(cat: Category) {
    setQueue(prev => {
      if (prev.includes(cat)) return prev.filter(c => c !== cat)
      if (prev.length >= 3) return prev
      return [...prev, cat]
    })
  }

  function resetAll() {
    setPhase('SETUP')
    setQueue([])
    setClock(0)
    setRemaining([])
    setTimeline([])
    setOrders(generateOrders())
    setResult(null)
  }

  function startRound() {
    setPhase('RUNNING')
    setClock(0)
    setTimeline([])
    // стартуем с подсказанной очереди, но дальше можно кликать любой напиток
    setRemaining(sortedPreview)
  }

  // Оценка одного напитка при текущем «ожидании»
  function evaluateDrink(d: Drink, wait: number): Omit<FinishedDrink, 'finishedAt' | 'waitSec'> {
    let penalties: { label: string; value: number }[] = []
    let temp = d.startTempC
    let dilution: number | undefined = undefined

    if (d.category === 'STRAIGHT_UP') {
      temp = tempAt(wait, d.startTempC, 22, 120)
      if (temp > 0) penalties.push({ label: 'Тёплый straight-up (>0°C)', value: (temp / 10) * 12 })
    } else if (d.category === 'ON_THE_ROCKS') {
      dilution = dilutionAt(wait, d.iceSurface ?? 'standard')
      const ideal = d.idealDilution ?? 0.33
      const delta = Math.abs(dilution - ideal)
      penalties.push({ label: 'Разбавление не по цели', value: delta * 80 })
      // T на льду не штрафуем
    } else {
      temp = tempAt(wait, d.startTempC, 22, 240)
      if (temp > 12) penalties.push({ label: 'Потеря холода напитка без льда', value: (temp - 10) * 2 })
    }

    return { drink: d, tempC: temp, dilution, penalties }
  }

  // Финишировать ЛЮБОЙ напиток по клику
  function finishById(id: string) {
    const idx = remaining.findIndex(d => d.id === id)
    if (idx < 0) return
    const d = remaining[idx]

    const wait = clock
    const evald = evaluateDrink(d, wait)
    const finishedAt = clock + d.baseFinishSec

    const finished: FinishedDrink = {
      ...evald,
      waitSec: wait,
      finishedAt
    }

    // обновляем состояние
    const nextRemaining = [...remaining.slice(0, idx), ...remaining.slice(idx + 1)]
    const nextTimeline = [...timeline, finished]
    setRemaining(nextRemaining)
    setTimeline(nextTimeline)
    setClock(finishedAt)

    // если всё закончено — посчитать результат
    if (nextRemaining.length === 0) {
      const totalSec = finishedAt
      const windowSec = nextTimeline.length > 1 ? nextTimeline[nextTimeline.length - 1].finishedAt - nextTimeline[0].finishedAt : 0
      const { score, breakdown } = scoreRound(nextTimeline, windowSec, queue)
      setResult({ score, breakdown, totalSec, windowSec })
      setPhase('RESULTS')
    }
  }

  // «Авто» — финишировать следующий по подсказанной очереди
  function finishNextAuto() {
    if (remaining.length > 0) finishById(remaining[0].id)
  }

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <span className="dot"></span>
          <span className="title">Roundbuilder • барный раунд-симулятор</span>
        </div>
        <button className="btn" onClick={resetAll}>Начать заново</button>
      </div>

      {phase === 'SETUP' && (
        <div className="grid grid-2">
          <div className="card">
            <div className="kicker">Шаг 1</div>
            <div className="h2">Выбери порядок финиша категорий</div>
            <div className="list">
              {(['NON_CHILLED','ON_THE_ROCKS','STRAIGHT_UP'] as Category[]).map((cat) => {
                const active = queue.includes(cat)
                const index = queue.indexOf(cat)
                return (
                  <div key={cat} className="row">
                    <div>
                      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                        <span className={`tag ${active ? 'active' : ''}`} onClick={() => toggleCategory(cat)}>
                          <span className="dot" />
                          <span>{CATEGORY_LABEL[cat]}</span>
                        </span>
                        {active && <span className="badge ok">#{index + 1}</span>}
                      </div>
                      <div className="meta">
                        {cat === 'NON_CHILLED' && 'Можно делать заранее: деградация медленнее.'}
                        {cat === 'ON_THE_ROCKS' && 'Держат 0 °C за счёт льда, но разбавляются — не тянем.'}
                        {cat === 'STRAIGHT_UP' && 'Холод без льда — собирать ближе к выдаче.'}
                      </div>
                    </div>
                    <div className="meta">Рекомендуется: {recommendedOrder.indexOf(cat)+1}</div>
                  </div>
                )
              })}
            </div>
            <div className="sep" />
            <button className="btn" onClick={startRound} disabled={!canStart}>Старт раунда</button>
          </div>

          <div className="card">
            <div className="kicker">Шаг 2</div>
            <div className="h2">Что получится в очереди (подсказка)</div>
            <div className="list">
              {sortedPreview.map((d, i) => (
                <div key={d.id} className="row">
                  <div>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span className="badge">{labelShort(d.category)}</span>
                      <strong>{d.name}</strong>
                    </div>
                    <div className="meta">Финиш ≈ {d.baseFinishSec}s</div>
                  </div>
                  <div className="meta">#{i+1}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'RUNNING' && (
        <div className="grid grid-2">
          <div className="card">
            <div className="kicker">Раунд</div>
            <div className="h2">Кликни напиток, который хочешь финишировать сейчас</div>
            <div className="list">
              {/* Сначала уже сделанные, потом оставшиеся */}
              {timeline.map((f, i) => (
                <div key={'done-'+f.drink.id} className="row">
                  <div>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span className="badge ok">Готово</span>
                      <strong>{f.drink.name}</strong>
                    </div>
                    <div className="meta">{CATEGORY_LABEL[f.drink.category]} • Финиш ≈ {f.drink.baseFinishSec}s</div>
                  </div>
                  <div className="meta">#{i+1}</div>
                </div>
              ))}

              {remaining.map((d) => (
                <div key={'todo-'+d.id} className="row">
                  <div>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span className="badge">{labelShort(d.category)}</span>
                      <strong>{d.name}</strong>
                    </div>
                    <div className="meta">{CATEGORY_LABEL[d.category]} • Финиш ≈ {d.baseFinishSec}s</div>
                  </div>
                  <button className="btn" onClick={() => finishById(d.id)}>Финиш сейчас</button>
                </div>
              ))}
            </div>
            <div className="sep" />
            <button className="btn" onClick={finishNextAuto} disabled={remaining.length === 0}>Finish Next</button>
          </div>

          <div className="card">
            <div className="kicker">Прогресс</div>
            <div className="h2">Сделано: {timeline.length}/{timeline.length + remaining.length}</div>
            <div className="list">
              {timeline.map((f) => (
                <div key={f.drink.id} className="stat">
                  <div className="label">{f.drink.name} • {labelShort(f.drink.category)}</div>
                  <div className="value">
                    {f.drink.category === 'ON_THE_ROCKS'
                      ? `Разбавление: ${(f.dilution! * 100).toFixed(0)}%`
                      : `T на подаче: ${f.tempC.toFixed(1)}°C`}
                  </div>
                  <div className="meta">Ожидал: {f.waitSec}s • Финиш на {f.finishedAt}s</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'RESULTS' && result && (
        <div className="grid grid-2">
          <div className="card">
            <div className="kicker">Итог</div>
            <div className="h2">Счёт раунда</div>
            <div style={{display:'flex', alignItems:'baseline', gap:16}}>
              <div className="score">{Math.round(result.score)}</div>
              <span className="meta">/ 100</span>
            </div>
            <div className="sep" />
            <div className="list">
              <div className="stat"><div className="label">Общее время</div><div className="value">{result.totalSec}s</div></div>
              <div className="stat"><div className="label">Окно между первым и последним</div><div className="value">{result.windowSec}s</div></div>
            </div>
            <div className="sep" />
            <div className="kicker">Штрафы</div>
            <div className="list">
              {result.breakdown.map((b, i) => (
                <div key={i} className="row">
                  <div>{b.label}</div>
                  <div className="meta">-{b.value.toFixed(1)}</div>
                </div>
              ))}
            </div>
            <div className="sep" />
            <button className="btn" onClick={resetAll}>Ещё раунд</button>
          </div>

          <div className="card">
            <div className="kicker">Разбор напитков</div>
            <div className="list">
              {timeline.map((f, i) => (
                <div key={f.drink.id} className="row">
                  <div>
                    <strong>{f.drink.name}</strong>
                    <div className="meta">Ждал: {f.waitSec}s • Финиш: {f.finishedAt}s</div>
                    {f.penalties.map((p, j) => (
                      <div key={j} className="meta">− {p.label}: {p.value.toFixed(1)}</div>
                    ))}
                  </div>
                  <div className="meta">#{i+1}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function labelShort(cat: Category) {
  if (cat === 'STRAIGHT_UP') return 'Straight-Up'
  if (cat === 'ON_THE_ROCKS') return 'On the Rocks'
  return 'No Ice'
}
