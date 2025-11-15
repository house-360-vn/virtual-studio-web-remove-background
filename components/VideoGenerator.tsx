import React, { useState, DragEvent } from 'react';
import { Spinner } from './Spinner';

interface VideoGeneratorProps {
  isLoading: boolean;
  loadingMessage: string;
  videoUrl: string | null;
  error: string | null;
  onGenerate: (imageUrl: string) => void;
  cooldown?: number;
}

const VideoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const DownloadIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);


export const VideoGenerator: React.FC<VideoGeneratorProps> = ({ 
    isLoading, 
    loadingMessage, 
    videoUrl, 
    error,
    onGenerate,
    cooldown = 0,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); };
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); if (cooldown === 0 && !isLoading) setIsDragOver(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragOver(false); };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const imageUrl = e.dataTransfer.getData('text/plain');
    if (imageUrl && !isLoading && cooldown === 0) {
      onGenerate(imageUrl);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center text-center">
            <Spinner />
            <p className="mt-4 text-indigo-300 animate-pulse">{loadingMessage || "Generating video..."}</p>
        </div>
      );
    }
    
    if (cooldown > 0) {
      return (
        <div className="text-center p-4 max-w-md">
            <h3 className="font-semibold text-yellow-400 text-lg">API Usage Limit Reached</h3>
            <p className="text-gray-300 mt-2 text-sm">
                You&apos;ve exceeded the video generation limit for your API key. This is a temporary restriction to ensure fair usage.
            </p>
            <p className="text-gray-300 mt-3">
                You can try again in <span className="font-bold text-white tabular-nums text-lg">{cooldown}</span> seconds.
            </p>
            <a 
                href="https://ai.google.dev/gemini-api/docs/rate-limits" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline mt-4 inline-block"
            >
                Learn more about API rate limits
            </a>
        </div>
      );
    }

    if (error) {
        return (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-center" role="alert">
              <strong className="font-bold">Video Generation Error: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          );
    }

    if (videoUrl) {
      return (
        <div className="w-full h-full group">
            <video
                src={videoUrl}
                controls
                autoPlay
                loop
                muted
                className="w-full h-full object-contain rounded-lg"
            />
            <a
                href={videoUrl}
                download="dx-studio-generated-video.mp4"
                className="absolute top-2 right-2 bg-black/50 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-indigo-600 z-10"
                aria-label="Download Video"
                onClick={(e) => e.stopPropagation()}
            >
                <DownloadIcon className="h-6 w-6" />
            </a>
        </div>
      );
    }

    return (
        <div className="text-center p-4">
            <VideoIcon />
            <p className="font-semibold text-gray-300">
                Drag & drop a generated image here
            </p>
            <p className="text-xs text-gray-500 mt-1">to create an animated video clip</p>
        </div>
    );
  };

  return (
    <div className="mt-12">
        <h2 className="text-2xl font-bold text-center mb-8 text-indigo-300">Generate Video</h2>
        <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative w-full border-2 border-dashed rounded-lg flex items-center justify-center transition-colors duration-300 min-h-[300px] p-4 ${isDragOver ? 'border-indigo-500 bg-gray-800/80' : 'border-gray-600'} ${cooldown > 0 ? 'border-yellow-600/50 bg-gray-800/30 cursor-not-allowed' : ''} ${isLoading ? 'cursor-not-allowed' : ''}`}
        >
           {renderContent()}
        </div>
    </div>
  );
};