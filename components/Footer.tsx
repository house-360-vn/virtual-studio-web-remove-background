export default function Footer() {
  return (
    <footer className="bg-white">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
        <div>© {new Date().getFullYear()} Virtual Studio</div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-gray-700 hover:underline transition-all duration-200">Privacy Policy</a>
          <a href="#" className="hover:text-gray-700 hover:underline transition-all duration-200">Terms of Service</a>
          <a href="#" className="hover:text-gray-700 hover:underline transition-all duration-200">Contact</a>
        </div>
      </div>
    </footer>
  )
}