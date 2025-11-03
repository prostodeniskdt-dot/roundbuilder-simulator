import React, { useMemo, useState } from 'react'
import { Category, Drink, FinishedDrink } from './types'
import { generateOrders, recommendedOrder, scoreRound, sortByFinishQueue, simulateFinish } from './gameLogic'

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
  const [cursor, setCursor] = useState(0)
  const [timeline, setTimeline] = useState<FinishedDrink[]>([])
  const [result, setResult] = useState<{ score: number; windowSec: number; totalSec: number; breakdown: {label: string; value: number}[] } | null>(null)

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
    setCursor(0)
    setTimeline([])
    setOrders(generateOrders())
    setResult(null)
  }

  function startRound() {
    setPhase('RUNNING')
    setCursor(0)
    setTimeline([])
  }

  function finishNext() {
    const ordered = sortedPreview
    if (cursor >= ordered.length) return

    const sim = simulateFinish(ordered)
    const finished = sim.finished[cursor]
    const partial = [...timeline, finished]
    setTimeline(partial)
    setCursor(cursor + 1)

    if (cursor + 1 === ordered.length) {
      const { score, breakdown } = scoreRound(sim.finished, sim.windowSec, queue)
      setResult({ score, breakdown, totalSec: sim.totalSec, windowSec: sim.windowSec })
      setPhase('RESULTS')
    }
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
            <div className="h2">Что получится в очереди</div>
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
            <div className="h2">Финишируй напитки в своей очереди</div>
            <div className="list">
              {sortedPreview.map((d, i) => {
                const done = i < cursor
                const current = i === cursor
                return (
                  <div key={d.id} className="row">
                    <div>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <span className={`badge ${done ? 'ok' : current ? 'warn' : ''}`}>
                          {done ? 'Готово' : current ? 'Сейчас' : 'В очереди'}
                        </span>
                        <strong>{d.name}</strong>
                      </div>
                      <div className="meta">{CATEGORY_LABEL[d.category]} • Финиш ≈ {d.baseFinishSec}s</div>
                    </div>
                    <div className="meta">#{i+1}</div>
                  </div>
                )
              })}
            </div>
            <div className="sep" />
            <button className="btn" onClick={finishNext} disabled={cursor >= sortedPreview.length}>Finish Next</button>
          </div>

          <div className="card">
            <div className="kicker">Прогресс</div>
            <div className="h2">Сделано: {cursor}/{sortedPreview.length}</div>
            <div className="list">
              {timeline.map((f) => (
                <div key={f.drink.id} className="stat">
                  <div className="label">{f.drink.name} • {labelShort(f.drink.category)}</div>
                  <div className="value">
                    {f.drink.category === 'ON_THE_ROCKS' ? `Разбавление: ${(f.dilution! * 100).toFixed(0)}%` : `T на подаче: ${f.tempC.toFixed(1)}°C`}
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
              {timeline.map((f) => (
                <div key={f.drink.id} className="row">
                  <div>
                    <strong>{f.drink.name}</strong>
                    <div className="meta">Ждал: {f.waitSec}s • Финиш: {f.finishedAt}s</div>
                    {f.penalties.map((p, i) => (
                      <div key={i} className="meta">− {p.label}: {p.value.toFixed(1)}</div>
                    ))}
                  </div>
                  <div className="meta">{labelShort(f.drink.category)}</div>
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
