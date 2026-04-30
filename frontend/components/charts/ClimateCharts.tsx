'use client'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  plugins: { legend: { display: false }, tooltip: { mode: 'index' as const, intersect: false } },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569', maxTicksLimit: 8, font: { size: 10 } } },
    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569', font: { size: 10 } } },
  },
}

interface YearlyChartProps {
  years: number[]
  T2M: number[]
  T2M_MAX: number[]
  T2M_MIN: number[]
}

export function YearlyTempChart({ years, T2M, T2M_MAX, T2M_MIN }: YearlyChartProps) {
  const labels = years.map(String)
  return (
    <Line
      data={{
        labels,
        datasets: [
          { label: 'Mean °C',  data: T2M,     borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)', borderWidth: 1.5, pointRadius: 2, fill: false },
          { label: 'Max °C',   data: T2M_MAX,  borderColor: '#fb923c', backgroundColor: 'transparent',           borderWidth: 1,   pointRadius: 0, borderDash: [3,3] },
          { label: 'Min °C',   data: T2M_MIN,  borderColor: '#60a5fa', backgroundColor: 'transparent',           borderWidth: 1,   pointRadius: 0, borderDash: [3,3] },
        ],
      }}
      options={CHART_OPTS}
    />
  )
}

interface RainfallChartProps { years: number[]; PREC: number[] }
export function YearlyRainChart({ years, PREC }: RainfallChartProps) {
  return (
    <Bar
      data={{
        labels: years.map(String),
        datasets: [{ label: 'Rain mm', data: PREC, backgroundColor: 'rgba(56,189,248,0.6)', borderColor: '#38bdf8', borderWidth: 1 }],
      }}
      options={CHART_OPTS}
    />
  )
}

interface MonthlyChartProps { months: number[]; values: number[]; label: string; color: string; type?: 'bar' | 'line' }
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function MonthlyChart({ months, values, label, color, type = 'line' }: MonthlyChartProps) {
  const labels = months.map(m => MONTH_NAMES[m - 1] ?? m)
  const dataset = { label, data: values, borderColor: color, backgroundColor: type === 'bar' ? color + '99' : color + '22', borderWidth: 1.5, pointRadius: 3, fill: type === 'line' }

  return type === 'bar'
    ? <Bar data={{ labels, datasets: [dataset] }} options={CHART_OPTS} />
    : <Line data={{ labels, datasets: [dataset] }} options={CHART_OPTS} />
}
