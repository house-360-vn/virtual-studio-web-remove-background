import React, { useState, useRef, useCallback, DragEvent } from 'react';
import type { UploadedImage } from '../styles';
import { Spinner } from './Spinner';

interface ImageUploaderProps {
  title: string;
  onUpload: (images: UploadedImage[]) => void;
  uploadedImages: UploadedImage[];
  onRemove?: (previewUrl: string) => void;
  isSelectionLoading?: boolean;
  multiple?: boolean;
}

const UploadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3-3m3-3v12" />
    </svg>
);

const CloseIcon: React.FC<{className?: string}> = ({className}) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);


export const ImageUploader: React.FC<ImageUploaderProps> = ({
  title,
  onUpload,
  uploadedImages,
  onRemove,
  isSelectionLoading = false,
  multiple = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const filesToProcess = multiple ? imageFiles : [imageFiles[0]];

    const newImagesData: UploadedImage[] = [];
    let processedCount = 0;

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const [header, base64] = dataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        
        newImagesData.push({ base64, mimeType, previewUrl: dataUrl });
        processedCount++;

        if (processedCount === filesToProcess.length) {
          onUpload(newImagesData);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [onUpload, multiple]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files);
    // Reset file input to allow uploading the same file again
    if(event.target) event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files) handleFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => event.preventDefault();
  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); };
  
  const triggerFileInput = () => fileInputRef.current?.click();
  const hasImages = uploadedImages.length > 0;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-center text-gray-300">{title}</h2>
      <div
        className={`relative w-full border-2 border-dashed rounded-lg flex items-center justify-center transition-colors duration-300 min-h-[250px] ${isDragging ? 'border-indigo-500 bg-gray-800/80' : 'border-gray-600 hover:border-indigo-500 hover:bg-gray-800/50'}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
          multiple={multiple}
        />
        {!hasImages ? (
          <div className="text-center p-4 cursor-pointer" onClick={triggerFileInput} role="button" tabIndex={0}>
            <UploadIcon />
            <p className="font-semibold text-gray-300">
              <span className="text-indigo-400">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500 mt-1">{multiple ? 'Multiple images supported' : 'PNG, JPG, GIF up to 10MB'}</p>
          </div>
        ) : multiple ? (
           <div className="w-full p-4">
             <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
                {uploadedImages.map((image) => (
                    <div key={image.previewUrl} className="relative group aspect-square">
                        <img src={image.previewUrl} alt="Uploaded car" className="w-full h-full object-cover rounded-md"/>
                        {onRemove && (
                            <button
                                onClick={() => onRemove(image.previewUrl)}
                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                aria-label="Remove image"
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}
                <div 
                  className="aspect-square flex items-center justify-center border-2 border-dashed border-gray-600 rounded-md cursor-pointer hover:border-indigo-500"
                  onClick={triggerFileInput}
                  role="button"
                  aria-label="Add more images"
                >
                  <span className="text-3xl text-gray-500">+</span>
                </div>
            </div>
           </div>
        ) : (
          <div className="w-full h-full">
            <img 
                src={uploadedImages[0].previewUrl} 
                alt="Uploaded preview" 
                className="w-full h-full object-contain rounded-lg"
            />
            {uploadedImages[0].maskBase64 && (
                <img 
                    src={`data:image/png;base64,${uploadedImages[0].maskBase64}`}
                    alt="Selection mask"
                    className="absolute top-0 left-0 w-full h-full object-contain opacity-50 pointer-events-none"
                />
            )}
            {isSelectionLoading && (
                <div className="absolute inset-0 bg-gray-900/70 flex flex-col items-center justify-center rounded-lg">
                    <Spinner />
                    <p className="mt-2 text-indigo-300">Detecting car...</p>
                </div>
            )}
          </div>
        )}
      </div>
      {!multiple && hasImages && !isSelectionLoading && uploadedImages[0].maskBase64 && (
        <div className="mt-4 p-3 bg-gray-800/50 rounded-lg text-center">
            <p className="text-sm text-green-400">
                ✓ Car detected and selected for replacement.
            </p>
        </div>
      )}
    </div>
  );
};
