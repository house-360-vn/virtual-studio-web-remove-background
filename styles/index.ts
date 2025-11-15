// src/types/index.ts

export interface UploadedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
  maskBase64?: string;
}

export interface GeneratedImageData {
  imageUrls: string[];
  text: string | null;
}

export interface Screenshot {
  id: string;
  url: string;
  timestamp: number;
}

export interface CarImage {
  base64: string;
  mimeType: string;
}

export interface BackgroundImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
  maskBase64?: string;
}

export interface VideoMetadata {
  processingTime: number;
  timestamp: string;
}

export interface ImageGenerationMetadata {
  processingTime: number;
  successCount: number;
  totalAttempts: number;
  timestamp: string;
}