// app/configurator/page.tsx
'use client'

import { useSearchParams } from 'next/navigation'
import { useMemo, useEffect, useState, useCallback, Suspense } from 'react'
import Image from 'next/image'
import { PixelStreamingWrapper } from '@/components/PixelStreamingWrapper'
import { getPS, isPSReady } from '@/lib/psBus'
import { carMap } from '@/data/cars'

// Import components từ virtualstudioai
import { ImageUploader } from '@/components/ImageUploader'
import { GeneratedImageDisplay } from '@/components/GeneratedImageDisplay'
import { VideoGenerator } from '@/components/VideoGenerator'
import { Spinner } from '@/components/Spinner'
import { ImagePreviewModal } from '@/components/ImagePreviewModal'

export const dynamic = "force-dynamic";

// ============================================================================
// TYPES
// ============================================================================

type ModeType = 'photo' | 'video';

interface UploadedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
  maskBase64?: string;
}

interface GeneratedImageData {
  imageUrls: string[];
  text: string | null;
}

type WheelInfo = { id: string; img: string }
type ColorInfo = { id: string; name: string; img: string; value: string }

interface Screenshot {
  id: string
  url: string
  timestamp: number
}

interface BackgroundOption {
  id: string;
  name: string;
  dayImage: string;
  nightImage: string;
}

// NEW: Sequence types
interface SequenceInfo {
  id: string;
  name: string;
  category: 'Interior' | 'Exterior';
  duration: number;
  thumbnail?: string;
}

interface RenderJob {
  id: string;
  sequenceId: string;
  status: 'queued' | 'rendering' | 'complete' | 'failed';
  progress: number;
  downloadUrl?: string;
  errorMessage?: string;
}

// ============================================================================
// UE RESPONSE EVENT TYPES
// ============================================================================

interface UEResponseEvent {
  ns?: string;
  type?: string;
  action?: string;
  status?: string;
  data?: {
    sequenceId?: string;
    sequences?: Array<{
      sequenceId?: string;
      id?: string;
      SequenceId?: string;
      displayName?: string;
      name?: string;
      DisplayName?: string;
      category?: string;
      Category?: string;
      duration?: number;
      Duration?: number;
      thumbnailPath?: string;
      ThumbnailPath?: string;
      thumbnail?: string;
    }>;
    jobId?: string;
    progress?: number;
    downloadUrl?: string | { url: string };
    errorMessage?: string;
    index?: number;
    remaining?: number;
    totalCount?: number;
    [key: string]: unknown;
  };
  sequences?: Array<{
    sequenceId?: string;
    id?: string;
    displayName?: string;
    name?: string;
    category?: string;
    duration?: number;
    thumbnailPath?: string;
    thumbnail?: string;
  }>;
  isDay?: boolean;
  carId?: string;
  hex?: string;
  value?: string;
  backgroundId?: string;
  backgroundImage?: string;
}

interface SequenceData {
  sequenceId?: string;
  id?: string;
  SequenceId?: string;
  displayName?: string;
  name?: string;
  DisplayName?: string;
  category?: string;
  Category?: string;
  duration?: number;
  Duration?: number;
  thumbnailPath?: string;
  ThumbnailPath?: string;
  thumbnail?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const isValidBase64 = (str: string): boolean => {
  try {
    const cleaned = str.replace(/\s/g, '');
    return /^[A-Za-z0-9+/]+(=|==)?$/.test(cleaned);
  } catch {
    return false;
  }
};

const cleanBase64 = (str: string): string => {
  return str.replace(/\s/g, '');
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const backgroundOptions: BackgroundOption[] = [
  {
    id: 'Studio_White',
    name: 'Studio',
    dayImage: '/images/backgrounds/white_studio.jpg',
    nightImage: '/images/backgrounds/white_studio.jpg'
  },
  {
    id: 'City_Beach',
    name: 'Beach City',
    dayImage: '/images/backgrounds/beach_city.jpg',
    nightImage: '/images/backgrounds/beach_city.jpg'
  },
  {
    id: 'Mountain_Overlook',
    name: 'Mountain Overlook',
    dayImage: '/images/backgrounds/mountain_overlook.jpg',
    nightImage: '/images/backgrounds/mountain_overlook.jpg'
  }
  ,
  {
    id: 'Nature_Forest',
    name: 'Nature Forest',
    dayImage: '/images/backgrounds/forest_nature_day.jpg',
    nightImage: '/images/backgrounds/forest_nature_night.jpg'
  }
];

// ============================================================================
// COMPONENTS
// ============================================================================

// Mode Toggle Component
const ModeToggle: React.FC<{
  mode: ModeType;
  onModeChange: (mode: ModeType) => void;
  disabled: boolean;
}> = ({ mode, onModeChange, disabled }) => {
  return (
    <div className="flex gap-1 bg-black/20 backdrop-blur-sm rounded-lg p-1">
      <button
        onClick={() => onModeChange('photo')}
        disabled={disabled}
        className={`
          px-6 py-2 rounded-md font-semibold text-sm transition-all duration-200
          ${mode === 'photo'
            ? 'bg-white text-black shadow-lg'
            : 'text-white/70 hover:text-white hover:bg-white/10'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        📷 Photo
      </button>
      <button
        onClick={() => onModeChange('video')}
        disabled={disabled}
        className={`
          px-6 py-2 rounded-md font-semibold text-sm transition-all duration-200
          ${mode === 'video'
            ? 'bg-white text-black shadow-lg'
            : 'text-white/70 hover:text-white hover:bg-white/10'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        🎬 Video
      </button>
    </div>
  );
};

// Video Mode Controls Component - FIXED WITH STOP BUTTON
const VideoModeControls: React.FC<{
  onPlay: () => void;
  onStop: () => void; // NEW
  onRender: () => void;
  onDownload: () => void;
  isPlaying: boolean;
  isRendering: boolean;
  hasRenderOutput: boolean;
  disabled: boolean;
}> = ({ onPlay, onStop, onRender, onDownload, isPlaying, isRendering, hasRenderOutput, disabled }) => {
  return (
    <div className="flex gap-3">
      {/* Play/Stop Button - DYNAMIC */}
      <button
        onClick={isPlaying ? onStop : onPlay}
        disabled={disabled}
        className={`
          w-12 h-12 rounded-lg border-2 border-white/30 bg-white overflow-hidden
          transition-all duration-200 relative
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-black/30 cursor-pointer'}
        `}
        title={isPlaying ? "Stop" : "Play Preview"}
      >
        <div 
          className="w-full h-full bg-cover bg-center"
          style={{ 
            backgroundImage: isPlaying 
              ? `url(/images/buttons/stop.svg)` 
              : `url(/images/buttons/play.svg)` 
          }}
        />
      </button>

      {/* Render Button */}
      <button
        onClick={onRender}
        disabled={disabled || isRendering}
        className={`
          w-12 h-12 rounded-lg border-2 border-white/30 bg-white overflow-hidden
          transition-all duration-200 relative
          ${disabled || isRendering ? 'opacity-50 cursor-not-allowed' : 'hover:border-black/30 cursor-pointer'}
        `}
        title="Render Video"
      >
        <div 
          className="w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url(/images/buttons/render.svg)` }}
        />
        {isRendering && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </button>

      {/* Download Button */}
      <button
        onClick={onDownload}
        disabled={!hasRenderOutput}
        className={`
          w-12 h-12 rounded-lg border-2 border-white/30 bg-white overflow-hidden
          transition-all duration-200 relative
          ${!hasRenderOutput ? 'opacity-30 cursor-not-allowed' : 'hover:border-black/30 cursor-pointer'}
        `}
        title="Download Rendered Video"
      >
        <div 
          className="w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url(/images/buttons/download.svg)` }}
        />
      </button>
    </div>
  );
};

// Sequences List Component - Styled like Photo Mode
const SequencesList: React.FC<{
  sequences: SequenceInfo[];
  selectedSequences: string[];
  onToggleSequence: (id: string) => void;
  isLoading: boolean;
}> = ({ sequences, selectedSequences, onToggleSequence, isLoading }) => {
  const interiorSequences = useMemo(
    () => sequences.filter(s => s.category === 'Interior'),
    [sequences]
  );
  
  const exteriorSequences = useMemo(
    () => sequences.filter(s => s.category === 'Exterior'),
    [sequences]
  );

  const SequenceCard: React.FC<{ sequence: SequenceInfo }> = ({ sequence }) => {
    const isSelected = selectedSequences.includes(sequence.id);
    const selectionIndex = isSelected ? selectedSequences.indexOf(sequence.id) + 1 : null;
    const thumbnailUrl = sequence.thumbnail || '/images/thumbnails/default-sequence.jpg';
    
    return (
      <div
        onClick={() => onToggleSequence(sequence.id)}
        className={`
          group cursor-pointer rounded-lg overflow-hidden transition-all duration-200 relative
          border-2
          ${isSelected
            ? 'border-black shadow-lg scale-102'
            : 'border-gray-300 hover:border-black/50 hover:shadow-md'
          }
        `}
      >
        {/* Thumbnail Image */}
        <div className="aspect-video bg-gray-200 relative overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={sequence.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = '/images/thumbnails/default-sequence.jpg';
            }}
          />
          
          {/* Selection Badge */}
          {isSelected && (
            <div className="absolute top-2 right-2 bg-black text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold shadow-lg z-10">
              {selectionIndex}
            </div>
          )}
          
          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-200"></div>
          
          {/* Selected Checkmark */}
          {isSelected && (
            <div className="absolute top-2 left-2 bg-black text-white rounded-full p-1 shadow-lg">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
        
        {/* Bottom Info Bar */}
        <div className="bg-white p-2 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-900 truncate">{sequence.name}</p>
          <p className="text-xs text-gray-500">{formatDuration(sequence.duration)}</p>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="mt-4 bg-white rounded-lg p-8 shadow-sm border border-gray-200">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <span className="ml-3 text-gray-600">Loading sequences...</span>
        </div>
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="mt-4 bg-white rounded-lg p-8 shadow-sm border border-gray-200">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">📹</div>
          <p>No sequences available for this level</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
      {/* Selection Summary */}
      {selectedSequences.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            {selectedSequences.length} camera motion{selectedSequences.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="text-xs text-gray-600 hover:text-gray-900 transition-colors"
          >
            Click to select/deselect
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Interior Sequences */}
        {interiorSequences.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-700">Interior</span>
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-semibold">
                {interiorSequences.length}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {interiorSequences.map(seq => (
                <SequenceCard key={seq.id} sequence={seq} />
              ))}
            </div>
          </div>
        )}

        {/* Exterior Sequences */}
        {exteriorSequences.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-700">Exterior</span>
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-semibold">
                {exteriorSequences.length}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {exteriorSequences.map(seq => (
                <SequenceCard key={seq.id} sequence={seq} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Simple Play Control with Queue Management - Styled like Photo Mode
const SimplePlayControl: React.FC<{
  selectedSequences: string[];
  sequences: SequenceInfo[];
  onPlay: () => void;
  onClear: () => void;
  onRemove: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  isPlaying: boolean;
  disabled: boolean;
}> = ({ selectedSequences, sequences, onPlay, onClear, onRemove, onReorder, isPlaying, disabled }) => {
  if (selectedSequences.length === 0) return null;

  const getSequenceName = (id: string) => {
    return sequences.find(s => s.id === id)?.name || id;
  };

  // Only show list if 2+ sequences selected
  const showList = selectedSequences.length >= 2;

  return (
    <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {selectedSequences.length === 1 ? 'Ready to Play' : 'Queue Ready'}
          </span>
          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-semibold">
            {selectedSequences.length} camera motion{selectedSequences.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPlay}
            disabled={disabled || isPlaying}
            className={`
              px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${isPlaying
                ? 'bg-gray-200 text-gray-500 cursor-wait'
                : 'bg-black text-white hover:bg-gray-800'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isPlaying ? 'Playing...' : 'Play'}
          </button>
          <button
            onClick={onClear}
            disabled={disabled || isPlaying}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Show list ONLY if 2+ sequences */}
      {showList && (
        <>
          <div className="text-xs text-gray-500 mb-3 text-center pb-2 border-b border-gray-200">
            Click ⬆️⬇️ to reorder • Click ❌ to remove
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {selectedSequences.map((seqId, index) => (
              <div
                key={`${seqId}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all border border-gray-200"
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-gray-900 font-semibold text-sm w-6 text-center">
                    {index + 1}
                  </span>
                  <span className="text-gray-700 text-sm">{getSequenceName(seqId)}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  {/* Move Up */}
                  <button
                    onClick={() => index > 0 && onReorder(index, index - 1)}
                    disabled={disabled || isPlaying || index === 0}
                    className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Move up"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {/* Move Down */}
                  <button
                    onClick={() => index < selectedSequences.length - 1 && onReorder(index, index + 1)}
                    disabled={disabled || isPlaying || index === selectedSequences.length - 1}
                    className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Move down"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {/* Remove */}
                  <button
                    onClick={() => onRemove(index)}
                    disabled={disabled || isPlaying}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Remove from list"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Single sequence - just show name */}
      {!showList && (
        <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-700 text-sm">
            <span className="font-semibold">{getSequenceName(selectedSequences[0])}</span>
          </p>
        </div>
      )}
    </div>
  );
};

// Render Status Panel Component - UPDATED WITH CANCEL BUTTON
const RenderStatusPanel: React.FC<{
  renderJob: RenderJob | null;
  onCancelRender: () => void;
}> = ({ renderJob, onCancelRender }) => {
  if (!renderJob) return null;

  return (
    <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            Render Status
          </span>
          <span className={`
            text-xs px-3 py-1 rounded-full font-semibold
            ${renderJob.status === 'complete' ? 'bg-green-100 text-green-700' :
              renderJob.status === 'rendering' ? 'bg-blue-100 text-blue-700' :
              renderJob.status === 'failed' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }
          `}>
            {renderJob.status === 'complete' ? '✓ Complete' :
             renderJob.status === 'rendering' ? '⏳ Rendering' :
             renderJob.status === 'failed' ? '✗ Failed' :
             'Queued'}
          </span>
        </div>
        
        {/* Cancel Button - Only show when rendering */}
        {renderJob.status === 'rendering' && (
          <button
            onClick={onCancelRender}
            className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors hover:underline"
          >
            Cancel
          </button>
        )}
      </div>
      
      {renderJob.status === 'rendering' && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2 text-sm text-gray-700">
            <span>Progress</span>
            <span className="font-bold text-gray-900">{renderJob.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${renderJob.progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Rendering {renderJob.sequenceId}...
          </p>
        </div>
      )}

      {renderJob.status === 'complete' && renderJob.downloadUrl && (
        <div className="mt-3 space-y-2">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <p className="text-green-700 text-sm font-medium">Render completed successfully!</p>
          </div>
          <a
            href={renderJob.downloadUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-black hover:bg-gray-800 text-white text-center py-3 rounded-lg font-semibold transition-colors"
          >
            ⬇️ Download Video
          </a>
        </div>
      )}

      {renderJob.status === 'failed' && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-700 text-sm font-medium">
            Render failed: {renderJob.errorMessage || 'Unknown error'}
          </p>
          <p className="text-red-600 text-xs mt-1">Please try again or contact support.</p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN CONTENT COMPONENT
// ============================================================================

function ConfiguratorContent() {
  const q = useSearchParams()
  const carId = q.get('carId') || 'DA_CarModel_Genesis_GV70_2025'
  const currentCar = carMap[carId]

  // ============================================================================
  // STATE - COMMON
  // ============================================================================
  
  const [mode, setMode] = useState<ModeType>('photo');
  const [isReady, setIsReady] = useState(false);
  const [isCarLoaded, setIsCarLoaded] = useState(false);
  const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null);

  // Configurator states
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [selectedWheelId, setSelectedWheelId] = useState<string | null>(null);
  const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState(backgroundOptions[0]);
  const [isDayMode, setIsDayMode] = useState(true);

  // ============================================================================
  // STATE - PHOTO MODE
  // ============================================================================
  
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [carImages, setCarImages] = useState<UploadedImage[]>([]);
  const [backgroundImage, setBackgroundImage] = useState<UploadedImage | null>(null);
  const [generatedImageData, setGeneratedImageData] = useState<GeneratedImageData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMasking, setIsMasking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Video generation
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(false);
  const [videoLoadingMessage, setVideoLoadingMessage] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoCooldown, setVideoCooldown] = useState<number>(0);

  // ============================================================================
  // STATE - VIDEO MODE (SIMPLIFIED)
  // ============================================================================
  
  const [sequences, setSequences] = useState<SequenceInfo[]>([]);
  const [isLoadingSequences, setIsLoadingSequences] = useState(false);
  const [selectedSequences, setSelectedSequences] = useState<string[]>([]); // Multi-select array
  const [isPlaying, setIsPlaying] = useState(false);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);

  // ============================================================================
  // STATIC DATA
  // ============================================================================

  const wheels: WheelInfo[] = useMemo(() => [
    { id:'wh1', img:'/images/wheels/wheel_01.jpg' },
    { id:'wh2', img:'/images/wheels/wheel_02.jpg' },
    { id:'wh3', img:'/images/wheels/wheel_03.jpg' },
    { id:'wh4', img:'/images/wheels/wheel_04.jpg' },
    { id:'wh5', img:'/images/wheels/wheel_05.jpg' },
  ], []);

  const exteriorColours: ColorInfo[] = useMemo(() => ([
    { id:'col_black',    name:'Black',     img:'/images/colors/black_thumb.jpg',    value:'#0a0a0a' },
    { id:'col_red',      name:'Red',   img:'/images/colors/red_thumb.jpg',      value:'#7a3535' },
    { id:'col_blue',     name:'Blue',  img:'/images/colors/blue_thumb.jpg',     value:'#445064' },
    { id:'col_yellow', name:'Yellow',      img:'/images/colors/yellow_thumb.jpg', value:'#4b5563' },
    { id:'col_silver',     name:'Silver',    img:'/images/colors/silver_thumb.jpg',     value:'#202020' },
    { id:'col_green',   name:'Green',        img:'/images/colors/green_thumb.jpg',   value:'#b45309' },
  ]), []);

  // ============================================================================
  // EFFECTS - INITIALIZATION
  // ============================================================================

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_PIXEL_STREAMING_WS;
    if (wsUrl) {
      setWebSocketUrl(wsUrl);
      console.log('WebSocket URL from env:', wsUrl);
    }
  }, []);

  useEffect(() => {
    const checkConnection = () => {
      const ready = isPSReady();
      setIsReady(ready);
      
      if (ready && !isCarLoaded) {
        const ps = getPS();
        if (ps) {
          ps.emitUIInteraction({
            ns: 'Configurator',
            type: 'Car',
            action: 'LoadById',
            value: carId
          });
        }
      }
    };
    
    checkConnection();
    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, [carId, isCarLoaded]);

  useEffect(() => {
    const ps = getPS();
    if (ps) {
      ps.addResponseEventListener('Info', (response) => {
        try {
          const event = JSON.parse(response);
          console.log('UE Response:', event);
          
          if (event.ns === 'Configurator') {
            handleUEResponse(event);
          }
        } catch (error) {
          console.error('Error parsing UE response:', error);
        }
      });
    }

    return () => {
      if (ps) {
        ps.removeResponseEventListener('Info');
      }
    };
  }, [carId, webSocketUrl, renderJob, mode]);

  useEffect(() => {
    setIsCarLoaded(false);
  }, [carId]);

  useEffect(() => {
    if (videoCooldown > 0) {
      const timer = setTimeout(() => setVideoCooldown(videoCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [videoCooldown]);

  // ============================================================================
  // EFFECTS - MODE CHANGE
  // ============================================================================

  useEffect(() => {
    if (mode === 'video' && isReady && sequences.length === 0) {
      loadSequencesForCurrentLevel();
    }
  }, [mode, isReady]);

  // ============================================================================
  // HANDLERS - UE RESPONSE
  // ============================================================================

  const handleUEResponse = useCallback((event: UEResponseEvent) => {
    if (event.type === 'Car' && event.action === 'LoadById') {
      if (event.status === 'OK') {
        setIsCarLoaded(true);
        console.log('Car loaded successfully');
        
        if (webSocketUrl) {
          const ps = getPS();
          if (ps) {
            setTimeout(() => {
              ps.emitUIInteraction({
                ns: 'Configurator',
                type: 'System',
                action: 'SetCloudflareURL',
                value: webSocketUrl,
                carId: carId
              });
              console.log('Sent WebSocket URL to UE:', webSocketUrl);
            }, 100);
          }
        }
      }
    }
    else if (event.type === 'Car' && event.action === 'SetColor') {
      if (event.status === 'OK') {
        console.log('Color changed successfully');
      }
    }
    else if (event.type === 'Car' && event.action === 'SetWheel') {
      if (event.status === 'OK') {
        console.log('Wheel changed successfully');
      }
    }
    else if (event.type === 'Environment' && event.action === 'ChangeBackground') {
      if (event.status === 'OK') {
        console.log('Background changed successfully');
        if (mode === 'video') {
          console.log('🎬 Video mode active - Reloading sequences for new level...');
          
          setSequences([]);
          setSelectedSequences([]);
          setIsPlaying(false);

          setTimeout(() => {
            loadSequencesForCurrentLevel();
          }, 500);
        }
      }
    }
    else if (event.type === 'Environment' && event.action === 'ChangeDayNight') {
      if (event.status === 'OK') {
        console.log('Day/Night changed successfully');
        if (event.isDay !== undefined) {
          setIsDayMode(event.isDay);
        }
      }
    }
    // PHOTO MODE RESPONSES
    else if (event.type === 'System' && event.action === 'TakeScreenshot') {
      if (event.status === 'OK' && event.data) {
        const screenshotUrl = typeof event.data === 'string' 
          ? event.data 
          : (event.data as { url?: string }).url || '';
        
        if (screenshotUrl) {
          const newScreenshot: Screenshot = {
            id: `screenshot-${Date.now()}`,
            url: screenshotUrl,
            timestamp: Date.now()
          };
          console.log('Screenshot taken:', newScreenshot.id);
          setScreenshots(prev => [newScreenshot, ...prev]);
        } else {
          console.error('Screenshot URL not found in response');
        }
      }
    }
    // Handle screenshot without background
    else if (event.type === 'System' && event.action === 'TakeScreenshotNoBackground') {
      if (event.status === 'OK' && event.data) {
        const screenshotUrl = typeof event.data === 'string' 
          ? event.data 
          : (event.data as { url?: string }).url || '';
        
        if (screenshotUrl) {
          const newScreenshot: Screenshot = {
            id: `screenshot-nobg-${Date.now()}`,
            url: screenshotUrl,
            timestamp: Date.now()
          };
          console.log('Screenshot without background taken:', newScreenshot.id);
          setScreenshots(prev => [newScreenshot, ...prev]);
        } else {
          console.error('Screenshot URL not found in response');
        }
      }
    }
    // VIDEO MODE RESPONSES
    else if (event.type === 'Sequence' && event.action === 'GetSequences') {
      console.log('GetSequences response:', event);
      setIsLoadingSequences(false);
      
      if (event.status === 'OK') {
        let sequencesData: SequenceData[] = [];
        
        try {
          let parsedData = event.data;
          
          if (typeof event.data === 'string') {
            console.log('🔧 Parsing stringified JSON data...');
            try {
              parsedData = JSON.parse(event.data);
              console.log('✅ Parsed data:', parsedData);
            } catch (parseError) {
              console.error('❌ Failed to parse data string:', parseError);
              console.error('Raw data:', event.data);
              setSequences([]);
              return;
            }
          }
          
          if (parsedData?.sequences && Array.isArray(parsedData.sequences)) {
            console.log('✅ Found format: parsedData.sequences');
            sequencesData = parsedData.sequences;
          }
          else if (event.sequences && Array.isArray(event.sequences)) {
            console.log('✅ Found format: event.sequences');
            sequencesData = event.sequences;
          }
          else if (parsedData && Array.isArray(parsedData)) {
            console.log('✅ Found format: parsedData as array');
            sequencesData = parsedData;
          }
          else if (event.data?.sequences && Array.isArray(event.data.sequences)) {
            console.log('✅ Found format: event.data.sequences');
            sequencesData = event.data.sequences;
          }
          else if (parsedData && typeof parsedData === 'object' && parsedData.sequenceId) {
            console.log('✅ Found format: single sequence object');
            sequencesData = [parsedData];
          }
          
          if (sequencesData.length > 0) {
            const loadedSequences: SequenceInfo[] = sequencesData.map((seq) => ({
              id: seq.sequenceId || seq.id || seq.SequenceId || 'unknown',
              name: seq.displayName || seq.name || seq.DisplayName || seq.sequenceId || 'Unnamed Sequence',
              category: (seq.category || seq.Category || 'Exterior') as 'Interior' | 'Exterior',
              duration: seq.duration || seq.Duration || 10,
              thumbnail: seq.thumbnailPath || seq.ThumbnailPath || seq.thumbnail
            }));
            
            setSequences(loadedSequences);
            console.log('✅ Loaded sequences:', loadedSequences.length, loadedSequences);
          } else {
            console.warn('⚠️ No sequences found in response');
            setSequences([]);
          }
        } catch (error) {
          console.error('❌ Error processing sequences:', error);
          console.error('Event data:', event.data);
          setSequences([]);
        }
      } else {
        console.error('❌ GetSequences failed:', event.status, event);
        setSequences([]);
      }
    }
    else if (event.type === 'Sequence' && event.action === 'PlaySequence') {
      if (event.status === 'OK') {
        setIsPlaying(true);
        console.log('✅ Sequence(s) started playing');
      } else {
        console.error('❌ Failed to play sequence:', event);
        setIsPlaying(false);
      }
    }
    else if (event.type === 'Sequence' && event.action === 'StopSequence') {
      if (event.status === 'OK') {
        setIsPlaying(false);
        console.log('✅ Sequence stopped');
      }
    }
    else if (event.type === 'Sequence' && event.action === 'SequenceFinished') {
      setIsPlaying(false);
      console.log('✅ All sequences finished');
    }
    // Render responses
    else if (event.type === 'Render' && event.action === 'RenderStarted') {
      console.log('Render started:', event.data);
      
      // Parse data if it's a string
      let parsedData = event.data;
      if (typeof event.data === 'string') {
        try {
          parsedData = JSON.parse(event.data);
          console.log('✅ Parsed render data:', parsedData);
        } catch (parseError) {
          console.error('❌ Failed to parse render data:', parseError);
          parsedData = event.data;
        }
      }
      
      const jobId = parsedData?.jobId || `render-${Date.now()}`;
      const sequenceId = parsedData?.sequenceId || 'unknown';
      
      setRenderJob({
        id: jobId,
        sequenceId: sequenceId,
        status: 'rendering',
        progress: 0
      });
      
      console.log('📦 Created render job:', { jobId, sequenceId });
    }
    else if (event.type === 'Render' && event.action === 'RenderProgress') {
      // Parse data if it's a string
      let parsedData = event.data;
      if (typeof event.data === 'string') {
        try {
          parsedData = JSON.parse(event.data);
        } catch (parseError) {
          console.error('❌ Failed to parse render progress data:', parseError);
          parsedData = event.data;
        }
      }
      
      if (parsedData) {
        const jobId = parsedData?.jobId || renderJob?.id || `render-${Date.now()}`;
        const sequenceId = parsedData?.sequenceId || renderJob?.sequenceId || 'unknown';
        const progress = parsedData?.progress || 0;
        
        setRenderJob({
          id: jobId,
          sequenceId: sequenceId,
          status: 'rendering',
          progress: progress
        });
        
        console.log('📊 Render progress:', progress, '%');
      }
    }
    else if (event.type === 'Render' && event.action === 'RenderComplete') {
      // Parse data if it's a string
      let parsedData = event.data;
      if (typeof event.data === 'string') {
        try {
          parsedData = JSON.parse(event.data);
        } catch (parseError) {
          console.error('❌ Failed to parse render complete data:', parseError);
          parsedData = event.data;
        }
      }
      
      if (parsedData) {
        let finalDownloadUrl: string | undefined;
        
        if (typeof parsedData.downloadUrl === 'string') {
          finalDownloadUrl = parsedData.downloadUrl;
        } else if (typeof parsedData.downloadUrl === 'object' && parsedData.downloadUrl !== null) {
          const urlObj = parsedData.downloadUrl as { url?: string };
          finalDownloadUrl = urlObj.url;
        }
        
        const jobId = parsedData?.jobId || renderJob?.id || `render-${Date.now()}`;
        const sequenceId = parsedData?.sequenceId || renderJob?.sequenceId || 'unknown';
        
        setRenderJob({
          id: jobId,
          sequenceId: sequenceId,
          status: 'complete',
          progress: 100,
          downloadUrl: finalDownloadUrl
        });
        console.log('✅ Render complete:', finalDownloadUrl);
      }
    }
    else if (event.type === 'Render' && event.action === 'RenderFailed') {
      // Parse data if it's a string
      let parsedData = event.data;
      if (typeof event.data === 'string') {
        try {
          parsedData = JSON.parse(event.data);
        } catch (parseError) {
          console.error('❌ Failed to parse render failed data:', parseError);
          parsedData = event.data;
        }
      }
      
      const jobId = parsedData?.jobId || renderJob?.id;
      const errorMessage = parsedData?.errorMessage || 'Unknown error';
      
      if (renderJob || jobId) {
        setRenderJob({
          id: jobId || renderJob?.id || `render-${Date.now()}`,
          sequenceId: renderJob?.sequenceId || 'unknown',
          status: 'failed',
          progress: renderJob?.progress || 0,
          errorMessage: errorMessage
        });
        console.error('❌ Render failed:', errorMessage);
      }
    }
    else if (event.type === 'Render' && event.action === 'RenderCancelled') {
      console.log('🛑 Render cancelled:', event.data);
      
      // Parse data if it's a string
      let parsedData = event.data;
      if (typeof event.data === 'string') {
        try {
          parsedData = JSON.parse(event.data);
        } catch (parseError) {
          console.error('❌ Failed to parse render cancelled data:', parseError);
          parsedData = event.data;
        }
      }
      
      const jobId = parsedData?.jobId || renderJob?.id;
      
      if (renderJob || jobId) {
        setRenderJob({
          id: jobId || renderJob?.id || `render-${Date.now()}`,
          sequenceId: renderJob?.sequenceId || 'unknown',
          status: 'failed',
          progress: renderJob?.progress || 0,
          errorMessage: 'Render cancelled by user'
        });
      }
    }
  }, [carId, webSocketUrl, renderJob, mode]);

  // ============================================================================
  // HANDLERS - COMMON
  // ============================================================================

  const onPickColor = useCallback((col: ColorInfo) => {
    if (!isReady) return;
    const ps = getPS();
    if (!ps) return;
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'Car',
      action: 'SetColor',
      value: col.name,
      hex: col.value,
      carId: carId
    });
    setSelectedColorId(col.id);
  }, [isReady, carId]);

  const onPickWheel = useCallback((w: WheelInfo) => {
    if (!isReady) return;
    const ps = getPS();
    if (!ps) return;
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'Car',
      action: 'SetWheel',
      value: w.id,
      carId: carId
    });
    setSelectedWheelId(w.id);
  }, [isReady, carId]);

  const handleBackgroundChange = useCallback((background: BackgroundOption) => {
    if (!isReady) return;
    const ps = getPS();
    if (!ps) return;
    setSelectedBackground(background);
    setShowBackgroundSelector(false);
    const backgroundImage = isDayMode ? background.dayImage : background.nightImage;
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'Environment',
      action: 'ChangeBackground',
      backgroundId: background.id,
      backgroundImage: backgroundImage,
      isDay: isDayMode,
      carId: carId
    });
  }, [isReady, isDayMode, carId]);

  const handleDayNightToggle = useCallback(() => {
    if (!isReady) return;
    const ps = getPS();
    if (!ps) return;
    const newDayMode = !isDayMode;
    setIsDayMode(newDayMode);
    const backgroundImage = newDayMode ? selectedBackground.dayImage : selectedBackground.nightImage;
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'Environment',
      action: 'ChangeDayNight',
      backgroundId: selectedBackground.id,
      backgroundImage: backgroundImage,
      isDay: newDayMode,
      carId: carId
    });
  }, [isReady, isDayMode, selectedBackground, carId]);

  // ============================================================================
  // HANDLERS - PHOTO MODE
  // ============================================================================

  const handleScreenshot = useCallback(() => {
    if (!isReady) return;
    const ps = getPS();
    if (!ps) return;
    console.log('Taking screenshot...');
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'System',
      action: 'TakeScreenshot',
      carId: carId
    });
  }, [isReady, carId]);

  const handleScreenshotNoBackground = useCallback(() => {
    if (!isReady) return;
    const ps = getPS();
    if (!ps) return;
    console.log('Taking screenshot without background...');
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'System',
      action: 'TakeScreenshotNoBackground',
      carId: carId
    });
  }, [isReady, carId]);

  const handleClearAllScreenshots = useCallback(() => {
    if (confirm('Are you sure you want to delete all screenshots?')) {
      setScreenshots([]);
      setCarImages([]);
      setGeneratedImageData(null);
      setBackgroundImage(null);
      setVideoUrl(null);
    }
  }, []);

  const handleScreenshotRemove = (screenshotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setScreenshots(prev => prev.filter(s => s.id !== screenshotId));
  };

  const handleScreenshotPreview = (screenshotUrl: string) => {
    setPreviewImageUrl(screenshotUrl);
  };

  useEffect(() => {
    const convertScreenshots = async () => {
      try {
        console.log('Converting screenshots:', screenshots.length);
        const convertedCarImages: UploadedImage[] = [];
        
        for (const screenshot of screenshots) {
          try {
            let base64Data: string;
            let mimeType: string;
            let previewUrl: string;
            
            if (screenshot.url.startsWith('data:')) {
              const commaIndex = screenshot.url.indexOf(',');
              if (commaIndex === -1) continue;
              
              const header = screenshot.url.substring(0, commaIndex);
              base64Data = screenshot.url.substring(commaIndex + 1);
              const mimeTypeMatch = header.match(/:(.*?);/);
              mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
              previewUrl = screenshot.url;
            } 
            else if (screenshot.url.startsWith('http://') || screenshot.url.startsWith('https://')) {
              const proxyResponse = await fetch('/api/fetch-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: screenshot.url })
              });
              
              if (!proxyResponse.ok) continue;
              
              const proxyData = await proxyResponse.json();
              base64Data = proxyData.base64;
              mimeType = proxyData.mimeType;
              previewUrl = screenshot.url;
            } 
            else {
              continue;
            }
            
            const cleanBase64Data = cleanBase64(base64Data);
            if (!isValidBase64(cleanBase64Data)) continue;
            
            convertedCarImages.push({
              base64: cleanBase64Data,
              mimeType: mimeType,
              previewUrl: previewUrl
            });
          } catch (err) {
            console.error('Error processing screenshot:', screenshot.id, err);
            continue;
          }
        }
        
        setCarImages(convertedCarImages);
      } catch (error) {
        console.error('Critical error converting screenshots:', error);
        setError('Failed to process screenshots. Please try again.');
      }
    };
    
    if (mode === 'photo') {
      convertScreenshots();
    }
  }, [screenshots, mode]);

  const handleBackgroundImageUpload = async (uploadedImages: UploadedImage[]) => {
    const uploadedImage = uploadedImages[0];
    if (!uploadedImage) return;

    setBackgroundImage({ ...uploadedImage, maskBase64: undefined });
    setGeneratedImageData(null);
    setVideoUrl(null);
    setVideoError(null);
    setError(null);
    setIsMasking(true);

    try {
      const response = await fetch('/api/generate-mask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: uploadedImage.base64,
          mimeType: uploadedImage.mimeType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate mask');
      }

      const data = await response.json();
      if (data.maskBase64) {
        setBackgroundImage((prev) => prev ? { ...prev, maskBase64: data.maskBase64 } : null);
      } else {
        throw new Error("Could not detect a car in the background image.");
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to automatically detect a car.';
      setError(errorMessage);
      setBackgroundImage((prev) => prev ? { ...prev, maskBase64: undefined } : null);
    } finally {
      setIsMasking(false);
    }
  };

  const handleRetryMask = async () => {
    if (!backgroundImage) return;

    setError(null);
    setIsMasking(true);

    try {
      const response = await fetch('/api/generate-mask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: backgroundImage.base64,
          mimeType: backgroundImage.mimeType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate mask');
      }

      const data = await response.json();
      if (data.maskBase64) {
        setBackgroundImage((prev) => prev ? { ...prev, maskBase64: data.maskBase64 } : null);
      } else {
        throw new Error("Could not detect a car in the background image.");
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to automatically detect a car.';
      setError(errorMessage);
    } finally {
      setIsMasking(false);
    }
  };

  const handleGenerate = useCallback(async () => {
    if (carImages.length === 0 || !backgroundImage) {
      setError('Please take screenshots and upload a background image.');
      return;
    }
    if (!backgroundImage.maskBase64) {
      setError('A car in the background must be detected before generating. Please try a different background.');
      return;
    }

    for (let i = 0; i < carImages.length; i++) {
      if (!isValidBase64(carImages[i].base64)) {
        setError(`Car image ${i + 1} has invalid base64 format. Please retake the screenshot.`);
        return;
      }
    }

    if (!isValidBase64(backgroundImage.base64)) {
      setError('Background image has invalid base64 format. Please upload again.');
      return;
    }

    if (!isValidBase64(backgroundImage.maskBase64)) {
      setError('Mask has invalid base64 format. Please upload background again.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImageData(null);
    setVideoUrl(null);
    setVideoError(null);

    try {
      const cleanedCarImages = carImages.map(img => ({
        base64: cleanBase64(img.base64),
        mimeType: img.mimeType
      }));

      const response = await fetch('/api/generate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carImages: cleanedCarImages,
          backgroundImageBase64: cleanBase64(backgroundImage.base64),
          backgroundImageMimeType: backgroundImage.mimeType,
          maskBase64: cleanBase64(backgroundImage.maskBase64),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate images');
      }

      const result = await response.json();
      setGeneratedImageData(result);
    } catch (err) {
      console.error('Generate error:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'An unknown error occurred during image generation.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [carImages, backgroundImage]);

  const handleGenerateVideo = useCallback(async (imageUrl: string) => {
    if (!imageUrl || videoCooldown > 0) return;

    setIsVideoLoading(true);
    setVideoUrl(null);
    setVideoError(null);

    const messages = [
      "Analyzing scene...",
      "Rendering video motion...",
      "Applying final touches...",
      "This can take a few minutes...",
      "Almost there...",
    ];
    let messageIndex = 0;
    setVideoLoadingMessage(messages[messageIndex]);
    const interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
      setVideoLoadingMessage(messages[messageIndex]);
    }, 5000);

    try {
      const [header, base64] = imageUrl.split(',');
      if (!header || !base64) throw new Error("Invalid image data URL format.");
      const mimeType = header.match(/:(.*?);/)?.[1];
      if (!mimeType) throw new Error("Could not determine image MIME type from data URL.");

      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          throw new Error(`QUOTA_EXCEEDED: ${errorData.message}`);
        }
        throw new Error(errorData.error || 'Failed to generate video');
      }

      const data = await response.json();
      const videoBlob = new Blob(
        [Uint8Array.from(atob(data.videoBase64), c => c.charCodeAt(0))],
        { type: data.mimeType }
      );
      const videoObjectUrl = URL.createObjectURL(videoBlob);
      setVideoUrl(videoObjectUrl);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during video generation.';
      if (errorMessage.startsWith('QUOTA_EXCEEDED:')) {
        setVideoError(errorMessage.replace('QUOTA_EXCEEDED: ', ''));
        setVideoCooldown(60);
      } else {
        setVideoError(errorMessage);
      }
    } finally {
      clearInterval(interval);
      setIsVideoLoading(false);
      setVideoLoadingMessage('');
    }
  }, [videoCooldown]);

  const handleOpenPreview = (url: string) => {
    setPreviewImageUrl(url);
  };

  const handleClosePreview = () => {
    setPreviewImageUrl(null);
  };

  const isGenerateDisabled = carImages.length === 0 || !backgroundImage || !backgroundImage.maskBase64 || isLoading || isMasking;

  // ============================================================================
  // HANDLERS - VIDEO MODE (SIMPLIFIED) - WITH STOP FUNCTION
  // ============================================================================

  const loadSequencesForCurrentLevel = useCallback(() => {
    if (!isReady) {
      console.log('⚠️ Cannot load sequences - PixelStreaming not ready');
      return;
    }
    
    setIsLoadingSequences(true);
    setSequences([]);
    
    const ps = getPS();
    if (ps) {
      console.log('📡 Requesting sequences from UE...');
      ps.emitUIInteraction({
        ns: 'Configurator',
        type: 'Sequence',
        action: 'GetSequences',
        carId: carId
      });
    } else {
      console.error('❌ PixelStreaming instance not available');
      setIsLoadingSequences(false);
    }
  }, [isReady, carId]);

  // Toggle sequence selection (add/remove from list)
  const handleToggleSequence = useCallback((sequenceId: string) => {
    setSelectedSequences(prev => {
      if (prev.includes(sequenceId)) {
        // Remove if already selected
        return prev.filter(id => id !== sequenceId);
      } else {
        // Add to selection
        return [...prev, sequenceId];
      }
    });
  }, []);

  // Play selected sequences (single or multiple)
  const handlePlaySequences = useCallback(() => {
    if (!isReady || selectedSequences.length === 0) return;
    
    const ps = getPS();
    if (!ps) return;

    console.log('🎬 Sending sequences to UE:', selectedSequences);
    
    // Send list to UE - UE will decide to play single or queue
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'Sequence',
      action: 'PlaySequence',
      data: {
        sequenceIds: selectedSequences
      }
    });
    
    setIsPlaying(true);
  }, [isReady, selectedSequences]);

  // NEW: Stop sequence playback
  const handleStopSequence = useCallback(() => {
    if (!isReady) return;
    
    const ps = getPS();
    if (!ps) return;

    console.log('⏹️ Stopping sequence playback...');
    
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'Sequence',
      action: 'StopSequence'
    });
    
    setIsPlaying(false);
  }, [isReady]);

  // Clear all selections
  const handleClearSequences = useCallback(() => {
    setSelectedSequences([]);
  }, []);

  // Remove sequence at specific index
  const handleRemoveSequence = useCallback((index: number) => {
    setSelectedSequences(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Reorder sequences (move up/down)
  const handleReorderSequence = useCallback((fromIndex: number, toIndex: number) => {
    setSelectedSequences(prev => {
      const newList = [...prev];
      const [moved] = newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, moved);
      return newList;
    });
  }, []);

  const handlePlaySequence = useCallback(() => {
    handlePlaySequences();
  }, [handlePlaySequences]);

  const handleRenderSequence = useCallback(() => {
    if (!isReady || selectedSequences.length === 0 || renderJob?.status === 'rendering') {
      console.log('⚠️ Cannot render - Invalid state');
      return;
    }
  
    const ps = getPS();
    if (!ps) {
      console.error('❌ PixelStreaming instance not available');
      return;
    }

    if (isPlaying) {
      console.log('⏸️ Stopping playback before render...');
      ps.emitUIInteraction({
        ns: 'Configurator',
        type: 'Sequence',
        action: 'StopSequence'
      });
      setIsPlaying(false);
    }

    setTimeout(() => {
      console.log('🎥 Starting render for sequences:', selectedSequences);
      
      const newRenderJob: RenderJob = {
        id: `render-${Date.now()}`,
        sequenceId: selectedSequences.join(','),
        status: 'rendering',
        progress: 0
      };
      setRenderJob(newRenderJob);

      ps.emitUIInteraction({
        ns: 'Configurator',
        type: 'Render',
        action: 'RenderSequenceList',
        data: {
          sequenceIds: selectedSequences,
          combineToSingleFile: selectedSequences.length > 1,
          settings: {
            quality: 'High',
            format: 'MP4',
            resolution: { x: 1920, y: 1080 },
            frameRate: 30
          }
        }
      });
    }, isPlaying ? 200 : 0);
    
  }, [isReady, selectedSequences, renderJob, isPlaying]);

  const handleDownloadRender = useCallback(() => {
    if (!renderJob?.downloadUrl) return;
    
    console.log('Downloading rendered video:', renderJob.downloadUrl);
    window.open(renderJob.downloadUrl, '_blank');
  }, [renderJob]);

  // NEW: Cancel render handler
  const handleCancelRender = useCallback(() => {
    if (!isReady || !renderJob || renderJob.status !== 'rendering') return;
    
    const ps = getPS();
    if (!ps) return;

    console.log('🛑 Cancelling render job:', renderJob.id);
    
    // IMPORTANT: Stringify the data object for UE
    const dataPayload = JSON.stringify({
      jobId: renderJob.id
    });
    
    console.log('📤 Sending cancel request with data:', dataPayload);
    
    ps.emitUIInteraction({
      ns: 'Configurator',
      type: 'Render',
      action: 'CancelRender',
      data: dataPayload  // ✅ Send as stringified JSON
    });
    
    // Optimistically update UI
    setRenderJob({
      ...renderJob,
      status: 'failed',
      errorMessage: 'Render cancelled by user'
    });
  }, [isReady, renderJob]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <main className="min-h-screen bg-white">
      <div className="grid grid-cols-12 gap-4 max-w-[1600px] mx-auto px-4 py-4">
        {/* LEFT: Viewer */}
        <section className="col-span-12 xl:col-span-9">
          <div className="rounded-2xl overflow-hidden transition-shadow duration-300 relative">
            <div className="aspect-[16/9] rounded-2xl overflow-hidden bg-black/5">
              <PixelStreamingWrapper
                initialSettings={{
                  AutoPlayVideo: true,
                  AutoConnect: true,
                  ss: process.env.NEXT_PUBLIC_PIXEL_STREAMING_WS,
                  StartVideoMuted: true,
                  HoveringMouse: true,
                  WaitForStreamer: true
                }}
              />
            </div>
            
            {/* Mode Toggle - Bottom Right */}
            <div className="absolute bottom-5 right-5 z-20">
              <ModeToggle 
                mode={mode}
                onModeChange={setMode}
                disabled={!isReady}
              />
            </div>

            {/* Control Buttons - Bottom Left */}
            <div className="absolute bottom-5 left-5 flex flex-row gap-3 z-20">
              {/* Background Selector */}
              <div className="relative">
                <button
                  disabled={!isReady}
                  className={`
                    w-12 h-12 rounded-lg border-2 border-white/30 bg-white overflow-hidden
                    transition-all duration-200 relative
                    ${isReady ? 'hover:border-black/30 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
                  `}
                  onClick={() => setShowBackgroundSelector(!showBackgroundSelector)}
                >
                  <div 
                    className="w-full h-full bg-cover bg-center"
                    style={{ backgroundImage: `url(/images/buttons/background.svg)` }}
                  />
                </button>
                
                {showBackgroundSelector && (
                  <div className="absolute bottom-16 left-0 bg-white/90 border border-white/30 rounded-lg p-3 flex gap-3 z-30">
                    {backgroundOptions.map((bg) => (
                      <div
                        key={bg.id}
                        className={`
                          cursor-pointer rounded transition-all duration-200
                          ${selectedBackground.id === bg.id ? 'ring-2 ring-black' : 'hover:ring-1 hover:ring-white/50'}
                        `}
                        onClick={() => handleBackgroundChange(bg)}
                      >
                        <div 
                          className="w-16 h-10 bg-gray-600 rounded-sm bg-cover bg-center"
                          style={{ backgroundImage: `url(${isDayMode ? bg.dayImage : bg.nightImage})` }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Day/Night Toggle */}
              <button
                disabled={!isReady}
                className={`
                  w-12 h-12 rounded-lg border-2 border-white/30 bg-white overflow-hidden
                  transition-all duration-200 relative
                  ${isReady ? 'hover:border-black/30 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
                `}
                onClick={handleDayNightToggle}
                title={isDayMode ? 'Switch to Night' : 'Switch to Day'}
              >
                <div 
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${isDayMode ? '/images/buttons/night.svg' : '/images/buttons/day.svg'})` }}
                />
              </button>

              {/* Mode-Specific Controls */}
              {mode === 'photo' ? (
                <>
                  {/* Regular Screenshot Button */}
                  <button
                    disabled={!isReady}
                    className={`
                      w-12 h-12 rounded-lg border-2 border-white/30 bg-white overflow-hidden
                      transition-all duration-200 relative
                      ${isReady ? 'hover:border-black/30 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
                    `}
                    onClick={handleScreenshot}
                    title="Take Screenshot"
                  >
                    <div 
                      className="w-full h-full bg-cover bg-center"
                      style={{ backgroundImage: `url(/images/buttons/capture.svg)` }}
                    />
                    {/* {screenshots.length > 0 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                        {screenshots.length}
                      </div>
                    )} */}
                  </button>
                  
                  {/* Screenshot Without Background Button */}
                  <button
                    disabled={!isReady}
                    className={`
                      w-12 h-12 rounded-lg border-2 border-white/30 bg-white overflow-hidden
                      transition-all duration-200 relative
                      ${isReady ? 'hover:border-black/30 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
                    `}
                    onClick={handleScreenshotNoBackground}
                    title="Take Screenshot (No Background)"
                  >
                    <div 
                      className="w-full h-full bg-cover bg-center"
                      style={{ backgroundImage: `url(/images/buttons/capture-nobg.svg)` }}
                    />
                    {/* Icon overlay to indicate "no background" */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </button>
                </>
              ) : (
                <VideoModeControls
                  onPlay={handlePlaySequence}
                  onStop={handleStopSequence}
                  onRender={handleRenderSequence}
                  onDownload={handleDownloadRender}
                  isPlaying={isPlaying}
                  isRendering={renderJob?.status === 'rendering'}
                  hasRenderOutput={!!renderJob?.downloadUrl}
                  disabled={!isReady || selectedSequences.length === 0}
                />
              )}
            </div>
          </div>

          {/* Mode-Specific Content Below Viewer */}
          {mode === 'photo' ? (
            <>
              {/* Screenshots Gallery */}
              {screenshots.length > 0 && (
                <div className="mt-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">
                      Screenshots ({screenshots.length})
                    </span>
                    <button
                      onClick={handleClearAllScreenshots}
                      className="text-xs text-red-600 hover:text-red-800 transition-colors font-medium"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {screenshots.map((screenshot) => (
                      <div
                        key={screenshot.id}
                        className="cursor-pointer rounded transition-all duration-200 flex-shrink-0 relative group hover:ring-2 hover:ring-blue-400"
                        onClick={() => handleScreenshotPreview(screenshot.url)}
                      >
                        <div 
                          className="w-24 h-16 bg-gray-600 rounded-sm bg-cover bg-center border-2 border-gray-300"
                          style={{ backgroundImage: `url(${screenshot.url})` }}
                        />
                        <button
                          onClick={(e) => handleScreenshotRemove(screenshot.id, e)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 md:group-hover:opacity-100 md:opacity-0 opacity-100 transition-opacity z-10"
                          title="Delete"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Background Replacement Section */}
              {screenshots.length > 0 && (
                <div className="mt-8 bg-gray-900 rounded-xl p-6">
                  <h2 className="text-2xl font-bold text-white mb-6 text-center">AI Background Replacement</h2>
                  
                  <div className="max-w-5xl mx-auto">
                    <p className="text-center text-lg text-gray-400 mb-8">
                      Screenshots above will be used as car images. Upload a background scene below.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                      {/* Car Images Display */}
                      <div>
                        <h3 className="text-white font-semibold mb-3">1. Car Images (From Screenshots)</h3>
                        <div className="border-2 border-green-600/50 bg-green-900/20 rounded-lg p-4">
                          {carImages.length > 0 ? (
                            <>
                              <div className="flex items-center gap-2 mb-3">
                                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-green-400 font-medium text-sm">
                                  {carImages.length} car image{carImages.length !== 1 ? 's' : ''} ready
                                </span>
                              </div>
                              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                                {carImages.map((img, idx) => (
                                  <img
                                    key={idx}
                                    src={img.previewUrl}
                                    alt={`Car ${idx + 1}`}
                                    className="w-full h-20 object-cover rounded border-2 border-green-500/30"
                                  />
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-8">
                              <svg className="w-12 h-12 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <p className="text-gray-400 text-sm">No screenshots yet</p>
                              <p className="text-gray-500 text-xs mt-1">Take screenshots above</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Background Upload */}
                      <ImageUploader
                        title="2. Upload Background Scene"
                        onUpload={handleBackgroundImageUpload}
                        uploadedImages={backgroundImage ? [backgroundImage] : []}
                        isSelectionLoading={isMasking}
                      />
                    </div>

                    {/* Retry mask button */}
                    {backgroundImage && !backgroundImage.maskBase64 && !isMasking && error && (
                      <div className="mb-10">
                        <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-200 px-4 py-3 rounded-lg text-center">
                          <p className="font-semibold mb-2">Car detection failed</p>
                          <p className="text-sm mb-3">{error}</p>
                          <div className="flex gap-3 justify-center">
                            <button
                              onClick={handleRetryMask}
                              className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                            >
                              Retry Detection
                            </button>
                            <button
                              onClick={() => {
                                setBackgroundImage(null);
                                setError(null);
                              }}
                              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                            >
                              Upload Different Image
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-center mb-10">
                      <button
                        onClick={handleGenerate}
                        disabled={isGenerateDisabled}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-4 px-10 rounded-lg text-xl shadow-lg shadow-indigo-500/20 transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
                      >
                        {isLoading ? 'Generating...' : isMasking ? 'Detecting...' : '✨ Generate Images'}
                      </button>
                    </div>

                    {isLoading && (
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <Spinner />
                        <p className="text-indigo-300">AI is working its magic... this may take a moment.</p>
                      </div>
                    )}

                    {error && (
                      <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-center mt-6">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                      </div>
                    )}
                    
                    {generatedImageData && (
                      <>
                        <GeneratedImageDisplay data={generatedImageData} onImageClick={handleOpenPreview} />
                        <VideoGenerator 
                          isLoading={isVideoLoading}
                          loadingMessage={videoLoadingMessage}
                          videoUrl={videoUrl}
                          error={videoError}
                          onGenerate={handleGenerateVideo}
                          cooldown={videoCooldown}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Sequences List */}
              <SequencesList
                sequences={sequences}
                selectedSequences={selectedSequences}
                onToggleSequence={handleToggleSequence}
                isLoading={isLoadingSequences}
              />

              {/* Simple Play Control */}
              <SimplePlayControl
                selectedSequences={selectedSequences}
                sequences={sequences}
                onPlay={handlePlaySequences}
                onClear={handleClearSequences}
                onRemove={handleRemoveSequence}
                onReorder={handleReorderSequence}
                isPlaying={isPlaying}
                disabled={!isReady}
              />

              {/* Render Status Panel */}
              <RenderStatusPanel renderJob={renderJob} onCancelRender={handleCancelRender} />
            </>
          )}
        </section>

        {/* RIGHT: Control panel */}
        <aside className="col-span-12 xl:col-span-3">
          <div className="space-y-4 sticky top-4">
            {/* Car name */}
            <div className="p-5 bg-white rounded-lg hover:bg-gray-50 transition-colors duration-200">
              <h2 className="text-2xl font-bold leading-tight">
                {currentCar?.name ?? carId}
              </h2>
              <div className="mt-2 h-px bg-gray-200"></div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-gray-600">Mode:</span>
                <span className="text-sm font-semibold">{mode === 'photo' ? '📷 Photo' : '🎬 Video'}</span>
              </div>
              {mode === 'video' && (
                <>
                  {selectedSequences.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      Selected: {selectedSequences.length} camera motion{selectedSequences.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Exterior Colours */}
            <div className="rounded-2xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="text-sm font-semibold mb-2">Colours</div>

              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {exteriorColours.map((col) => (
                  <button
                    key={col.id}
                    title={col.name}
                    disabled={!isReady}
                    onClick={() => onPickColor(col)}
                    className={[
                      "group relative rounded-xl overflow-hidden transition-all duration-200 transform cursor-pointer",
                      selectedColorId === col.id ? "ring-2 ring-black scale-102" : "hover:shadow-md hover:scale-102",
                      !isReady ? "opacity-30 cursor-not-allowed" : ""
                    ].join(' ')}
                  >
                    <div className="aspect-square overflow-hidden">
                      <Image
                        src={col.img}
                        alt={col.name}
                        width={400}
                        height={400}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {col.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Wheels */}
            <div className="rounded-2xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="mb-3">
                <div className="text-sm font-semibold">Wheels</div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {wheels.map((w) => (
                  <button
                    key={w.id}
                    disabled={!isReady}
                    className={[
                      "aspect-square border rounded-xl overflow-hidden bg-white transition-all duration-200 relative transform cursor-pointer",
                      selectedWheelId === w.id ? "ring-2 ring-black scale-102" : "hover:shadow-md hover:scale-102",
                      !isReady ? "opacity-30 cursor-not-allowed" : ""
                    ].join(' ')}
                    onClick={() => onPickWheel(w)}
                  >
                    <Image
                      src={w.img}
                      alt={w.id}
                      width={300}
                      height={300}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Image Preview Modal */}
      {previewImageUrl && (
        <ImagePreviewModal imageUrl={previewImageUrl} onClose={handleClosePreview} />
      )}
    </main>
  );
}

// Loading component
function ConfiguratorLoading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading configurator...</p>
      </div>
    </div>
  );
}

// Main component with Suspense wrapper
export default function ConfiguratorPage() {
  return (
    <Suspense fallback={<ConfiguratorLoading />}>
      <ConfiguratorContent />
    </Suspense>
  );
}