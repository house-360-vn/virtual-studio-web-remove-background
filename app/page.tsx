'use client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { cars } from '@/data/cars'

export default function Home() {
  const router = useRouter()
  return (
    <main className="bg-[#f6f6f6] min-h-screen">
      {/* Breadcrumb + Title */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-xs text-gray-500">Models / 911</div>
        <h1 className="text-4xl font-bold mt-2">911 Models</h1>
      </div>

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-12 gap-8">
        {/* Sidebar filters */}
        <aside className="hidden md:block col-span-3 bg-white rounded-2xl p-5">
          <div className="space-y-6 text-sm">
            <div>
              <h3 className="font-semibold mb-2">Model Range</h3>
              {['All','Carrera','Targa','Turbo','GT3'].map(m=>(
                <label key={m} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-2 transition-colors">
                  <input type="radio" name="range" defaultChecked={m==='Carrera'} className="cursor-pointer" />
                  <span>{m}</span>
                </label>
              ))}
            </div>
            <button className="w-full border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 transition-all duration-200 transform active:scale-98">
              Reset Filter
            </button>
          </div>
        </aside>

        {/* Grid xe */}
        <section className="col-span-12 md:col-span-9 space-y-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cars.map(car=>(
              <div key={car.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
                <div className="p-4">
                  <Image 
                    src={car.img} 
                    alt={car.name} 
                    width={600} 
                    height={300} 
                    className="w-full h-40 object-contain group-hover:scale-105 transition-transform duration-300" 
                  />
                </div>
                <div className="px-4 pb-4 space-y-1">
                  <h3 className="font-semibold">{car.name}</h3>
                  <p className="text-xs text-gray-500">{car.price}</p>
                </div>
                <div className="p-4 flex gap-2">
                  <button
                    onClick={()=>router.push(`/configurator?carId=${car.id}`)}
                    className="flex-1 bg-black text-white rounded-lg px-3 py-2 text-sm hover:bg-gray-800 active:bg-gray-900 transform hover:scale-105 active:scale-95 transition-all duration-200 hover:shadow-lg">
                    Build your own
                  </button>
                  <button className="flex-1 border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 transform hover:scale-105 active:scale-95 transition-all duration-200 hover:shadow-md">
                    Compare
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}