import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'

export const metadata: Metadata = {
  title: 'NDMA WeatherLens — Pakistan Climate Portal',
  description: 'Real-time and historical climate data for Pakistan by district, powered by NASA POWER and Open-Meteo.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
