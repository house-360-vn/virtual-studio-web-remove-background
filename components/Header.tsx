'use client'
import Link from 'next/link'

export default function Header() {
  return (
    <header className="bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo + Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity duration-200">
            <img src="/images/logo/logo.png" alt="Logo" className="h-6" />
            <span className="font-bold text-lg">Virtual Studio</span>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-gray-600">
            <Link href="/" className="hover:text-black hover:font-medium transition-all duration-200">Models</Link>
            <Link href="/configurator" className="hover:text-black hover:font-medium transition-all duration-200">Configurator</Link>
          </nav>
        </div>

        {/* User area: chỉ chữ + icon */}
        <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors duration-200">
          <span className="text-lg">☰</span>
          <span className="text-sm font-medium">Menu</span>
        </div>
      </div>
    </header>
  )
}