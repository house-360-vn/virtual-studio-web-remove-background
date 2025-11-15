// src/app/api/generate-video/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
//const VIDEO_MODEL = 'veo-2.0-generate-001';
const VIDEO_MODEL = 'veo-3.0-generate-001';

// Cấu hình polling
const POLLING_INTERVAL_MS = 5000; // Poll mỗi 5 giây
const MAX_POLLING_ATTEMPTS = 60; // Timeout sau 5 phút (60 * 5s)

interface ApiError extends Error {
  status?: number;
}

function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && 'status' in error;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error occurred';
}

function getErrorStatus(error: unknown): number | undefined {
  return isApiError(error) ? error.status : undefined;
}

/**
 * Generate video from image using Veo model with polling mechanism
 */
async function generateVideoFromImage(
  imageBase64: string,
  mimeType: string
): Promise<{ videoBase64: string; mimeType: string }> {
  const prompt = "Animate this image with subtle, realistic motion. If there is a car, make it seem to move forward gently. Add slight ambient motion to the background elements like trees or clouds. The overall effect should be a high-quality, cinematic clip.";

  try {
    console.log('Starting video generation operation...');
    
    // Start video generation operation
    let operation = await ai.models.generateVideos({
      model: VIDEO_MODEL,
      prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: mimeType,
      },
      config: {
        numberOfVideos: 1
      },
    });

    console.log('Video generation started, polling for completion...');
    let attempts = 0;

    // Polling loop - wait for video generation to complete
    while (!operation.done) {
      if (attempts >= MAX_POLLING_ATTEMPTS) {
        throw new Error(`Video generation timed out after ${(MAX_POLLING_ATTEMPTS * POLLING_INTERVAL_MS) / 1000} seconds.`);
      }
      
      attempts++;
      console.log(`Polling attempt ${attempts}/${MAX_POLLING_ATTEMPTS}...`);
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
      
      // Get updated operation status
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    console.log('Video generation completed!');

    // Extract download link from operation response
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error('Video generation completed, but no download link was found.');
    }

    console.log('Downloading generated video...');

    // Download the video from Google's server
    const videoResponse = await fetch(`${downloadLink}&key=${API_KEY}`);
    
    if (!videoResponse.ok) {
      // Check for rate limit/quota errors
      if (videoResponse.status === 429) {
        throw new Error('QUOTA_EXCEEDED: You have exceeded your API quota for video generation. Please check your plan or try again later.');
      }
      throw new Error(`Failed to download the generated video. Status: ${videoResponse.status}`);
    }

    // Convert video to base64
    const videoBuffer = await videoResponse.arrayBuffer();
    const videoBase64 = Buffer.from(videoBuffer).toString('base64');

    console.log('Video downloaded and converted to base64 successfully');

    return {
      videoBase64: videoBase64,
      mimeType: 'video/mp4'
    };

  } catch (error) {
    console.error('Error in generateVideoFromImage:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('Starting video generation request');
    
    const { imageBase64, mimeType } = await request.json();

    // Validate input
    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: imageBase64 and mimeType are required' },
        { status: 400 }
      );
    }

    // Generate video
    const videoData = await generateVideoFromImage(imageBase64, mimeType);
    
    const duration = Date.now() - startTime;
    console.log(`Video generation completed in ${duration}ms`);
    
    return NextResponse.json({ 
      videoBase64: videoData.videoBase64,
      mimeType: videoData.mimeType,
      metadata: {
        processingTime: duration,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    console.error(`Video generation failed after ${duration}ms:`, error);
    
    const errorMessage = getErrorMessage(error);
    const errorStatus = getErrorStatus(error);
    
    // Check for quota/rate limit errors
    if (errorMessage.includes('QUOTA_EXCEEDED') || 
        errorMessage.toLowerCase().includes('resource_exhausted') || 
        errorMessage.includes('429') ||
        errorStatus === 429) {
      return NextResponse.json(
        { 
          error: 'API quota exceeded',
          message: errorMessage.startsWith('QUOTA_EXCEEDED:') 
            ? errorMessage 
            : 'QUOTA_EXCEEDED: You have exceeded your API quota for video generation. Please check your plan or try again later.',
          code: 'QUOTA_EXCEEDED',
          processingTime: duration
        },
        { status: 429 }
      );
    }

    // Safety policy errors
    if (errorMessage.toLowerCase().includes('safety')) {
      return NextResponse.json(
        { 
          error: 'Video generation was blocked due to safety policies. Please try a different image.',
          code: 'SAFETY_ERROR',
          processingTime: duration
        },
        { status: 400 }
      );
    }

    // Model availability errors
    if (errorMessage.toLowerCase().includes('not available') || 
        errorMessage.toLowerCase().includes('model may not be available') ||
        errorStatus === 404) {
      return NextResponse.json(
        { 
          error: 'Video model not available',
          message: 'The video generation model (Veo) may not be available for your API key. This feature requires special access. Please check the Gemini API documentation or upgrade your plan.',
          code: 'MODEL_UNAVAILABLE',
          processingTime: duration
        },
        { status: 503 }
      );
    }

    // Timeout errors
    if (errorMessage.includes('timed out')) {
      return NextResponse.json(
        { 
          error: `Video generation timed out. The process is taking longer than expected.`,
          message: errorMessage,
          code: 'TIMEOUT_ERROR',
          processingTime: duration
        },
        { status: 408 }
      );
    }

    // Download errors
    if (errorMessage.includes('Failed to download')) {
      return NextResponse.json(
        { 
          error: 'Failed to download generated video',
          message: errorMessage,
          code: 'DOWNLOAD_ERROR',
          processingTime: duration
        },
        { status: 500 }
      );
    }

    // Service unavailable
    if (errorStatus === 503) {
      return NextResponse.json(
        { 
          error: 'Gemini API is temporarily overloaded. Please try again in a few minutes.',
          code: 'SERVICE_UNAVAILABLE',
          processingTime: duration
        },
        { status: 503 }
      );
    }

    // Authentication errors
    if (errorStatus === 401) {
      return NextResponse.json(
        { 
          error: 'Invalid API key. Please check your GEMINI_API_KEY configuration.',
          code: 'AUTH_ERROR',
          processingTime: duration
        },
        { status: 401 }
      );
    }

    // Generic error
    return NextResponse.json(
      { 
        error: 'Failed to generate video',
        message: errorMessage || 'Failed to generate video. Please try again later.',
        code: 'PROCESSING_ERROR',
        processingTime: duration
      },
      { status: 500 }
    );
  }
}