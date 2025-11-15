import React, { useEffect, useCallback } from 'react';

interface ImagePreviewModalProps {
  imageUrl: string;
  onClose: () => void;
}

const DownloadIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

const CloseIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ imageUrl, onClose }) => {
  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Starting download for:', imageUrl.substring(0, 100));
    
    // Helper function to extract filename from URL
    const getFilenameFromUrl = (url: string, defaultExtension: string = 'png'): string => {
      try {
        // Try to get filename from URL path
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();
        
        if (filename && filename.includes('.')) {
          return filename;
        }
        
        // If no filename with extension found, use timestamp
        return `screenshot-${Date.now()}.${defaultExtension}`;
      } catch {
        // If URL parsing fails, use timestamp
        return `screenshot-${Date.now()}.${defaultExtension}`;
      }
    };
    
    try {
      // Check if it's a data URL (base64) - direct download without fetch
      if (imageUrl.startsWith('data:image/')) {
        console.log('Processing as data URL');
        
        // Extract mime type and base64 data
        const match = imageUrl.match(/data:image\/([a-zA-Z]+);base64,(.+)/);
        if (!match) {
          throw new Error('Invalid data URL format');
        }
        
        const mimeType = match[1];
        const base64Data = match[2];
        const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
        
        console.log(`Detected image type: ${mimeType}, extension: ${extension}`);
        
        // Convert base64 to blob directly
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: `image/${mimeType}` });
        
        console.log(`Created blob, size: ${blob.size} bytes`);
        
        // Create download link
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `screenshot-${Date.now()}.${extension}`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Cleanup after a short delay
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        
        console.log(`✅ Download completed successfully as .${extension}`);
        return;
      }
      
      // For external URLs (Cloudflare, etc) - use API proxy to bypass CORS
      console.log('Processing as external URL via API proxy');
      
      const proxyResponse = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
      });
      
      if (!proxyResponse.ok) {
        const errorData = await proxyResponse.json();
        throw new Error(errorData.error || `HTTP error! status: ${proxyResponse.status}`);
      }
      
      const { base64, mimeType } = await proxyResponse.json();
      console.log(`Fetched via proxy, mimeType: ${mimeType}`);
      
      // Convert base64 to blob
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      
      console.log(`Created blob, size: ${blob.size} bytes`);
      
      // Detect the correct file extension
      let extension = 'png';
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        extension = 'jpg';
      } else if (mimeType.includes('png')) {
        extension = 'png';
      } else if (mimeType.includes('webp')) {
        extension = 'webp';
      } else if (mimeType.includes('gif')) {
        extension = 'gif';
      }
      
      // Get filename from URL or use default
      const filename = getFilenameFromUrl(imageUrl, extension);
      
      // Create download link
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      
      console.log(`✅ Download completed successfully as ${filename}`);
    } catch (error) {
      console.error('❌ Download failed:', error);
      console.error('Image URL type:', imageUrl.substring(0, 50));
      alert('Failed to download image. Please try right-clicking the image and selecting "Save image as..."');
    }
  }, [imageUrl]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [handleKeyDown]);
  
  // Stop propagation to prevent closing modal when clicking on the image or buttons
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-preview-title"
    >
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
      `}</style>
      <div className="relative max-w-5xl max-h-[90vh] w-full" onClick={stopPropagation}>
         <h2 id="image-preview-title" className="sr-only">Image Preview</h2>
        <img
          src={imageUrl}
          alt="Generated image preview"
          className="w-full h-auto object-contain max-h-[90vh] rounded-lg shadow-2xl"
        />
        <div className="absolute top-0 right-0 m-4 flex space-x-2">
           <button
            onClick={handleDownload}
            className="bg-indigo-600 text-white p-3 rounded-full transition-transform hover:scale-110 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-white"
            aria-label="Download Image"
          >
            <DownloadIcon className="h-6 w-6" />
          </button>
          <button
            onClick={onClose}
            className="bg-black/60 text-white p-3 rounded-full transition-transform hover:scale-110 hover:bg-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-white"
            aria-label="Close preview"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
};