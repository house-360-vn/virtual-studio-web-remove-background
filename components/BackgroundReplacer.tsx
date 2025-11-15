// components/BackgroundReplacer.tsx
'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface BackgroundReplacerProps {
  selectedScreenshotUrls: string[];
  onClose: () => void;
}

interface UploadedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

interface GeneratedImageData {
  imageUrls: string[];
  text: string | null;
}

const Spinner: React.FC = () => (
  <svg 
    className="animate-spin h-10 w-10 text-indigo-400" 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24"
  >
    <circle 
      className="opacity-25" 
      cx="12" 
      cy="12" 
      r="10" 
      stroke="currentColor" 
      strokeWidth="4"
    />
    <path 
      className="opacity-75" 
      fill="currentColor" 
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export const BackgroundReplacer: React.FC<BackgroundReplacerProps> = ({
  selectedScreenshotUrls,
  onClose,
}) => {
  const [carImages, setCarImages] = useState<UploadedImage[]>([]);
  const [backgroundImage, setBackgroundImage] = useState<UploadedImage | null>(null);
  const [maskBase64, setMaskBase64] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMasking, setIsMasking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'generate' | 'result'>('upload');
  
  const bgInputRef = useRef<HTMLInputElement>(null);

  // Auto-load screenshots as car images
  useEffect(() => {
    if (selectedScreenshotUrls.length > 0) {
      loadScreenshotsAsCarImages(selectedScreenshotUrls);
    }
  }, [selectedScreenshotUrls]);

  const loadScreenshotsAsCarImages = (urls: string[]) => {
    const loadedImages: UploadedImage[] = [];
    
    for (const url of urls) {
      try {
        // Check if URL is already a data URL (base64)
        if (url.startsWith('data:')) {
          // Extract mime type and base64 data from data URL
          const [header, base64Data] = url.split(',');
          const mimeTypeMatch = header.match(/:(.*?);/);
          const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
          
          loadedImages.push({
            base64: base64Data,
            mimeType: mimeType,
            previewUrl: url
          });
        } else {
          console.warn('Screenshot URL is not a data URL:', url);
        }
      } catch (err) {
        console.error('Failed to process screenshot:', err);
      }
    }
    
    setCarImages(loadedImages);
  };

  const generateMask = async (imageBase64: string, mimeType: string) => {
    setIsMasking(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-mask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate mask');
      }

      const data = await response.json();
      if (data.maskBase64) {
        setMaskBase64(data.maskBase64);
      } else {
        throw new Error("Could not detect a car in the image.");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to detect car');
    } finally {
      setIsMasking(false);
    }
  };

  const handleBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
      
      setBackgroundImage({ base64, mimeType, previewUrl: dataUrl });
      await generateMask(base64, mimeType);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (carImages.length === 0 || !backgroundImage || !maskBase64) {
      setError('Please upload a background image. Car images are already loaded from screenshots.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStep('generate');

    try {
      const response = await fetch('/api/generate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carImages: carImages.map(img => ({ base64: img.base64, mimeType: img.mimeType })),
          backgroundImageBase64: backgroundImage.base64,
          backgroundImageMimeType: backgroundImage.mimeType,
          maskBase64: maskBase64,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate images');
      }

      const result = await response.json();
      setGeneratedImages(result);
      setStep('result');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to generate images');
      setStep('upload');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-7xl mx-auto bg-gray-800 rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <h2 className="text-2xl font-bold text-white">AI Background Replacement</h2>
              <p className="text-sm text-gray-400 mt-1">
                Using {carImages.length} screenshot{carImages.length !== 1 ? 's' : ''} as car images
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6">
            {step === 'upload' && (
              <div className="space-y-6">
                {/* Progress indicator */}
                <div className="flex items-center justify-center space-x-4 mb-8">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">1</div>
                    <span className="ml-2 text-white font-medium">Upload Background</span>
                  </div>
                  <div className="w-16 h-1 bg-gray-700"></div>
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 font-bold">2</div>
                    <span className="ml-2 text-gray-400">Generate</span>
                  </div>
                  <div className="w-16 h-1 bg-gray-700"></div>
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 font-bold">3</div>
                    <span className="ml-2 text-gray-400">Result</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Car Images Preview (from screenshots) */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Car Images (From Screenshots)
                    </h3>
                    <div className="border-2 border-green-600/50 bg-green-900/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-green-400 font-medium text-sm">
                          {carImages.length} car image{carImages.length !== 1 ? 's' : ''} loaded
                        </span>
                      </div>
                      
                      {carImages.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                          {carImages.map((img, idx) => (
                            <div key={idx} className="relative group">
                              <img 
                                src={img.previewUrl} 
                                alt={`Car ${idx + 1}`} 
                                className="w-full h-20 object-cover rounded border-2 border-green-500/30"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                                <span className="text-white text-xs font-bold">Car {idx + 1}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <p className="text-xs text-gray-400 mt-3">
                        These screenshots will be used as different angles of the car
                      </p>
                    </div>
                  </div>

                  {/* Background Image Upload */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Upload New Background
                    </h3>
                    {backgroundImage ? (
                      <div className="relative">
                        <img 
                          src={backgroundImage.previewUrl} 
                          alt="Background" 
                          className="w-full h-64 object-contain rounded-lg bg-gray-900 border-2 border-gray-600"
                        />
                        {isMasking && (
                          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center rounded-lg">
                            <Spinner />
                            <p className="mt-2 text-white">Detecting car in background...</p>
                          </div>
                        )}
                        {maskBase64 && !isMasking && (
                          <div className="mt-2 p-2 bg-green-600/20 border border-green-600 rounded text-green-400 text-sm flex items-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Car detected successfully in background
                          </div>
                        )}
                        <button
                          onClick={() => bgInputRef.current?.click()}
                          className="mt-2 w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                        >
                          Change Background
                        </button>
                        <input
                          ref={bgInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleBackgroundUpload}
                          className="hidden"
                        />
                      </div>
                    ) : (
                      <div 
                        onClick={() => bgInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-600 rounded-lg p-6 h-64 flex items-center justify-center hover:border-indigo-500 transition-colors cursor-pointer"
                      >
                        <input
                          ref={bgInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleBackgroundUpload}
                          className="hidden"
                        />
                        <div className="text-center">
                          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <p className="mt-2 text-sm text-gray-400">Click to upload background image</p>
                          <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                    <strong className="font-bold">Error: </strong>
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex justify-center">
                  <button
                    onClick={handleGenerate}
                    disabled={carImages.length === 0 || !backgroundImage || !maskBase64 || isMasking}
                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-lg"
                  >
                    ✨ Generate Background Replacement
                  </button>
                </div>
              </div>
            )}

            {step === 'generate' && isLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Spinner />
                <p className="mt-4 text-indigo-300 text-lg">AI is generating your images...</p>
                <p className="mt-2 text-gray-400">This may take a moment</p>
              </div>
            )}

            {step === 'result' && generatedImages && (
              <div>
                <div className="flex items-center justify-center space-x-4 mb-8">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">✓</div>
                    <span className="ml-2 text-gray-400">Upload</span>
                  </div>
                  <div className="w-16 h-1 bg-green-600"></div>
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">✓</div>
                    <span className="ml-2 text-gray-400">Generate</span>
                  </div>
                  <div className="w-16 h-1 bg-green-600"></div>
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">3</div>
                    <span className="ml-2 text-white font-medium">Result</span>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-white mb-6 text-center">Generated Images</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {generatedImages.imageUrls.map((url, idx) => (
                    <div key={idx} className="space-y-2">
                      <p className="text-sm text-gray-400 text-center font-medium">
                        {idx === 0 ? 'Original Background' : `Creative Variation ${idx}`}
                      </p>
                      <div className="relative group">
                        <img 
                          src={url} 
                          alt={`Generated ${idx + 1}`}
                          className="w-full rounded-lg shadow-xl border-2 border-gray-700"
                        />
                        <a
                          href={url}
                          download={`generated-${idx + 1}.png`}
                          className="absolute bottom-4 right-4 bg-indigo-600 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-700"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-center space-x-4 mt-8">
                  <button
                    onClick={() => {
                      setStep('upload');
                      setGeneratedImages(null);
                      setBackgroundImage(null);
                      setMaskBase64(null);
                    }}
                    className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Generate Another
                  </button>
                  <button
                    onClick={onClose}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};