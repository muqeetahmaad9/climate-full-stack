'use client'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'

// ── Moving crosshair plugin ───────────────────────────────────
// Uses native DOM mousemove on the canvas — more reliable than Chart.js afterEvent.
const crosshairPlugin = {
  id: 'crosshair',

  afterInit(chart: any) {
    chart._chX = null
    let raf: number | null = null

    const move = (e: MouseEvent) => {
      const rect = chart.canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const ca = chart.chartArea
      if (!ca) return
      chart._chX = (mx >= ca.left && mx <= ca.right && my >= ca.top && my <= ca.bottom) ? mx : null
      if (!raf) raf = requestAnimationFrame(() => { raf = null; chart.draw() })
    }

    const leave = () => {
      chart._chX = null
      chart.draw()
    }

    chart.canvas.addEventListener('mousemove', move)
    chart.canvas.addEventListener('mouseleave', leave)
    chart._chFns = { move, leave }
  },

  beforeDestroy(chart: any) {
    const { move, leave } = chart._chFns ?? {}
    if (move)  chart.canvas.removeEventListener('mousemove', move)
    if (leave) chart.canvas.removeEventListener('mouseleave', leave)
  },

  afterDatasetsDraw(chart: any) {
    if (chart._chX == null) return
    const { ctx, chartArea: { top, bottom } } = chart
    const active = chart.tooltip?.getActiveElements?.() ?? []

    ctx.save()

    // Vertical hairline at mouse position
    ctx.beginPath()
    ctx.setLineDash([5, 5])
    ctx.strokeStyle = 'rgba(148,163,184,0.38)'
    ctx.lineWidth = 1
    ctx.moveTo(chart._chX, top)
    ctx.lineTo(chart._chX, bottom)
    ctx.stroke()
    ctx.setLineDash([])

    // Glowing dot at each active data point (line charts only)
    active.forEach((el: any) => {
      const ds = chart.data.datasets[el.datasetIndex]
      if (ds.type === 'bar') return
      const { x: px, y: py } = el.element
      const color = (Array.isArray(ds.borderColor) ? ds.borderColor[0] : ds.borderColor) as string
      if (!color) return

      ctx.beginPath()
      ctx.arc(px, py, 9, 0, Math.PI * 2)
      ctx.fillStyle = color + '20'
      ctx.fill()

      ctx.beginPath()
      ctx.arc(px, py, 5.5, 0, Math.PI * 2)
      ctx.fillStyle = color + '55'
      ctx.fill()

      ctx.beginPath()
      ctx.arc(px, py, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = 'rgba(10,14,20,0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    ctx.restore()
  },
}

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler,
  crosshairPlugin as any,
)

// ── Animation ─────────────────────────────────────────────────
const lineDelay = (ctx: any) => ctx.dataIndex * 20
const barDelay  = (ctx: any) => ctx.dataIndex * 45

const LINE_ANIM = { duration: 750, easing: 'easeInOutCubic' as const, delay: lineDelay as any }
const BAR_ANIM  = { duration: 550, easing: 'easeOutQuart'   as const, delay: barDelay  as any }

// ── Scales ────────────────────────────────────────────────────
const BASE_SCALES = {
  x: {
    grid:   { color: 'rgba(255,255,255,0.04)' },
    ticks:  { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } },
    border: { color: 'rgba(255,255,255,0.08)' },
  },
  y: {
    grid:   { color: 'rgba(255,255,255,0.05)' },
    ticks:  { color: '#64748b', font: { size: 10 } },
    border: { color: 'rgba(255,255,255,0.08)' },
  },
}

// ── Options ───────────────────────────────────────────────────
const LINE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: LINE_ANIM,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend:    { display: false },
    tooltip:   { mode: 'index' as const, intersect: false },
    crosshair: {},
  },
  scales: BASE_SCALES,
}

const BAR_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: BAR_ANIM,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend:    { display: false },
    tooltip:   { mode: 'index' as const, intersect: false },
    crosshair: {},
  },
  scales: BASE_SCALES,
}

const DUAL_LINE_OPTS = {
  ...LINE_OPTS,
  plugins: {
    ...LINE_OPTS.plugins,
    legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } },
  },
}

const DUAL_BAR_OPTS = {
  ...BAR_OPTS,
  plugins: {
    ...BAR_OPTS.plugins,
    legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } },
  },
}

// ── Shared line-dataset defaults ──────────────────────────────
// pointHoverRadius = pointRadius → no built-in growth; plugin handles hover visuals.
const lineDef = (color: string, extra?: object) => ({
  borderWidth: 1.8,
  pointRadius: 2.5,
  pointHoverRadius: 2.5,
  pointBackgroundColor: color,
  pointBorderColor: 'transparent',
  cubicInterpolationMode: 'monotone' as const,
  ...extra,
})

// ── Yearly charts ────────────────────────────────────────────

interface YearlyChartProps {
  years: number[]
  T2M: number[]
  T2M_MAX: number[]
  T2M_MIN: number[]
  showBand?: boolean
}

export function YearlyTempChart({ years, T2M, T2M_MAX, T2M_MIN, showBand }: YearlyChartProps) {
  return (
    <Line
      data={{
        labels: years.map(String),
        datasets: [
          {
            label: 'Mean °C',
            data: T2M,
            borderColor: '#f87171',
            backgroundColor: showBand ? 'rgba(248,113,113,0.14)' : 'rgba(248,113,113,0.07)',
            fill: showBand ? 1 : false,
            ...lineDef('#f87171'),
          },
          {
            label: 'Max °C',
            data: T2M_MAX,
            borderColor: '#fb923c',
            backgroundColor: 'transparent',
            fill: false,
            borderDash: [4, 4],
            ...lineDef('#fb923c', { pointRadius: 0, pointHoverRadius: 0 }),
          },
          {
            label: 'Min °C',
            data: T2M_MIN,
            borderColor: '#60a5fa',
            backgroundColor: 'transparent',
            fill: false,
            borderDash: [4, 4],
            ...lineDef('#60a5fa', { pointRadius: 0, pointHoverRadius: 0 }),
          },
        ],
      }}
      options={LINE_OPTS}
    />
  )
}

export function YearlyRainChart({ years, PREC, showAvg }: { years: number[]; PREC: number[]; showAvg?: boolean }) {
  const avg = PREC.length ? PREC.reduce((a, b) => a + b, 0) / PREC.length : 0
  return (
    <Bar
      data={{
        labels: years.map(String),
        datasets: [
          {
            label: 'Rain mm',
            data: PREC,
            backgroundColor: 'rgba(56,189,248,0.55)',
            borderColor: '#38bdf8',
            borderWidth: 1,
            borderRadius: 3,
            borderSkipped: false,
          },
          ...(showAvg
            ? [{
                type: 'line' as const,
                label: 'Avg',
                data: years.map(() => avg),
                borderColor: '#f59e0b',
                borderWidth: 1.8,
                borderDash: [5, 5],
                backgroundColor: 'transparent',
                ...lineDef('#f59e0b', { pointRadius: 0, pointHoverRadius: 0 }),
              }]
            : []),
        ] as any,
      }}
      options={BAR_OPTS}
    />
  )
}

export function YearlyWindChart({ years, WS2M }: { years: number[]; WS2M: number[] }) {
  return (
    <Line
      data={{
        labels: years.map(String),
        datasets: [{
          label: 'Wind m/s',
          data: WS2M,
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167,139,250,0.13)',
          fill: true,
          ...lineDef('#a78bfa'),
        }],
      }}
      options={LINE_OPTS}
    />
  )
}

// ── Monthly charts ───────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface MonthlyChartProps { months: number[]; values: number[]; label: string; color: string; type?: 'bar' | 'line' }

export function MonthlyChart({ months, values, label, color, type = 'line' }: MonthlyChartProps) {
  const labels = months.map(m => MONTH_NAMES[m - 1] ?? m)
  if (type === 'bar') {
    return (
      <Bar
        data={{
          labels,
          datasets: [{
            label,
            data: values,
            backgroundColor: color + '88',
            borderColor: color,
            borderWidth: 1.5,
            borderRadius: 4,
            borderSkipped: false,
          }],
        }}
        options={BAR_OPTS}
      />
    )
  }
  return (
    <Line
      data={{
        labels,
        datasets: [{
          label,
          data: values,
          borderColor: color,
          backgroundColor: color + '22',
          fill: true,
          ...lineDef(color, { pointRadius: 3, pointHoverRadius: 3 }),
        }],
      }}
      options={LINE_OPTS}
    />
  )
}

// ── Dual-year compare charts ──────────────────────────────────

interface DualChartProps {
  labels: string[]
  dataA: number[]
  dataB: number[]
  yearA: number
  yearB: number
}

export function CompareDualLine({ labels, dataA, dataB, yearA, yearB, colorA, colorB }: DualChartProps & { colorA: string; colorB: string }) {
  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: String(yearA),
            data: dataA,
            borderColor: colorA,
            backgroundColor: colorA + '1a',
            fill: false,
            ...lineDef(colorA),
          },
          {
            label: String(yearB),
            data: dataB,
            borderColor: colorB,
            backgroundColor: colorB + '1a',
            fill: false,
            ...lineDef(colorB),
          },
        ],
      }}
      options={DUAL_LINE_OPTS}
    />
  )
}

export function CompareDualBar({ labels, dataA, dataB, yearA, yearB }: DualChartProps) {
  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: String(yearA),
            data: dataA,
            backgroundColor: 'rgba(56,189,248,0.6)',
            borderColor: '#38bdf8',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: String(yearB),
            data: dataB,
            backgroundColor: 'rgba(167,139,250,0.6)',
            borderColor: '#a78bfa',
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      }}
      options={DUAL_BAR_OPTS}
    />
  )
}

// ── Daily charts ─────────────────────────────────────────────

export function DailyTempChart({ dates, T2M, T2M_MAX, T2M_MIN }: { dates: string[]; T2M: number[]; T2M_MAX: number[]; T2M_MIN: number[] }) {
  return (
    <Line
      data={{
        labels: dates.map(d => d.slice(6, 8)),
        datasets: [
          {
            label: 'Mean',
            data: T2M,
            borderColor: '#f87171',
            backgroundColor: 'rgba(248,113,113,0.08)',
            fill: true,
            ...lineDef('#f87171', { pointRadius: 1.5, pointHoverRadius: 1.5 }),
          },
          {
            label: 'Max',
            data: T2M_MAX,
            borderColor: '#fb923c',
            backgroundColor: 'transparent',
            fill: false,
            borderDash: [3, 3],
            ...lineDef('#fb923c', { pointRadius: 0, pointHoverRadius: 0 }),
          },
          {
            label: 'Min',
            data: T2M_MIN,
            borderColor: '#60a5fa',
            backgroundColor: 'transparent',
            fill: false,
            borderDash: [3, 3],
            ...lineDef('#60a5fa', { pointRadius: 0, pointHoverRadius: 0 }),
          },
        ],
      }}
      options={LINE_OPTS}
    />
  )
}

export function DailyBarChart({ dates, values, label, color }: { dates: string[]; values: number[]; label: string; color: string }) {
  return (
    <Bar
      data={{
        labels: dates.map(d => d.slice(6, 8)),
        datasets: [{
          label,
          data: values,
          backgroundColor: color + '88',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 3,
          borderSkipped: false,
        }],
      }}
      options={BAR_OPTS}
    />
  )
}
