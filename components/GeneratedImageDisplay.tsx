
import React from 'react';
import type { GeneratedImageData } from '../styles';

interface GeneratedImageDisplayProps {
  data: GeneratedImageData;
  onImageClick: (url: string) => void;
}

const DownloadIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

export const GeneratedImageDisplay: React.FC<GeneratedImageDisplayProps> = ({ data, onImageClick }) => {
  if (!data.imageUrls || data.imageUrls.length === 0) {
    return null;
  }

  const titles = ["Original Background", "Creative Variation 1", "Creative Variation 2"];

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, imageUrl: string) => {
    e.dataTransfer.setData('text/plain', imageUrl);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="mt-12 bg-gray-800/50 p-4 sm:p-8 rounded-xl border border-gray-700">
      <h2 className="text-2xl font-bold text-center mb-8 text-indigo-300">Generation Result</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {data.imageUrls.map((imageUrl, index) => (
          <div 
            key={index}
            draggable="true"
            onDragStart={(e) => handleDragStart(e, imageUrl)}
            className="cursor-grab active:cursor-grabbing"
          >
             <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">{titles[index] || `Variation ${index + 1}`}</h3>
            <div 
              className="relative group w-full cursor-pointer" 
              onClick={() => onImageClick(imageUrl)}
              onKeyUp={(e) => e.key === 'Enter' && onImageClick(imageUrl)}
              role="button"
              tabIndex={0}
              aria-label={`View larger image for ${titles[index] || `Variation ${index + 1}`}`}
            >
              <img 
                src={imageUrl} 
                alt={titles[index] || `Generated car scene ${index + 1}`}
                className="rounded-lg shadow-2xl shadow-black/50 w-full object-contain" 
              />
               <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center rounded-lg pointer-events-none">
                <span className="text-white text-lg font-bold">View Larger</span>
              </div>
              <a
                href={imageUrl}
                download={`generated-car-scene-${(titles[index] || `variation-${index + 1}`).toLowerCase().replace(/\s+/g, '-')}.png`}
                className="absolute bottom-4 right-4 bg-black/50 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-indigo-600 z-10"
                aria-label="Download Image"
                onClick={(e) => e.stopPropagation()}
              >
                <DownloadIcon className="h-6 w-6" />
              </a>
            </div>
          </div>
        ))}
      </div>
       {data.text && (
          <p className="text-gray-300 italic max-w-3xl mx-auto text-center bg-gray-900/50 p-4 rounded-md mt-8">
            &quot;{data.text}&quot;
          </p>
        )}
    </div>
  );
};