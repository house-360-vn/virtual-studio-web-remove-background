// src/app/api/generate-mask/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality, Part } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Cấu hình timeout và retry
const REQUEST_TIMEOUT = 60000; // 60 giây
const MAX_RETRIES = 3;
const BASE_DELAY = 5000; // 5 giây base delay
const MAX_DELAY = 30000; // 30 giây max delay

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

// Tính toán delay với exponential backoff và jitter
function calculateDelay(attempt: number): number {
  const exponentialDelay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.floor(exponentialDelay + jitter);
}

// Kiểm tra xem lỗi có thể retry được không
function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error).toLowerCase();
  
  return (
    status === 503 || // Service Unavailable
    status === 502 || // Bad Gateway
    status === 504 || // Gateway Timeout
    status === 429 || // Too Many Requests
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('connection')
  );
}

// Promise với timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

// Gemini API call với retry logic
async function generateMaskWithRetry(parts: Part[]): Promise<string> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Generating mask - Attempt ${attempt}/${MAX_RETRIES}`);
      
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: { parts },
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
          },
        }),
        REQUEST_TIMEOUT
      );

      // Validate response structure
      if (!response.candidates || 
          response.candidates.length === 0 || 
          !response.candidates[0].content || 
          !response.candidates[0].content.parts) {
        throw new Error("Invalid response structure from Gemini API");
      }

      // Extract image data
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log(`Successfully generated mask on attempt ${attempt}`);
          return part.inlineData.data;
        }
      }

      throw new Error("No mask image was generated in the response");
      
    } catch (error: unknown) {
      lastError = error;
      const errorMessage = getErrorMessage(error);
      const errorStatus = getErrorStatus(error);
      
      console.error(`Attempt ${attempt} failed:`, errorMessage);
      
      // Nếu không phải lỗi có thể retry, throw ngay
      if (!isRetryableError(error)) {
        console.error(`Non-retryable error (${errorStatus}):`, errorMessage);
        throw error;
      }
      
      // Nếu đã hết lần retry, throw error cuối cùng
      if (attempt === MAX_RETRIES) {
        console.error(`All ${MAX_RETRIES} attempts failed`);
        throw error;
      }
      
      // Tính toán thời gian delay và chờ
      const delay = calculateDelay(attempt);
      console.log(`Waiting ${delay}ms before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('Starting mask generation request');
    
    const { imageBase64, mimeType } = await request.json();

    // Validate input
    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: imageBase64 and mimeType are required' },
        { status: 400 }
      );
    }

    const imagePart: Part = {
      inlineData: {
        mimeType: mimeType,
        data: imageBase64,
      },
    };

    const prompt = `You are an expert image segmentation model. Your task is to identify the main, most prominent car in the provided image and generate a precise, solid white segmentation mask of it against a black background.
- If there are multiple cars, choose the one that is largest, most central, or most in focus.
- If no car is present in the image, you MUST return a completely black image.
- The output must be ONLY the mask image file. Do not output any text, markdown, or other content.`;

    const parts: Part[] = [
      imagePart,
      { text: prompt }
    ];

    const maskData = await generateMaskWithRetry(parts);
    
    const duration = Date.now() - startTime;
    console.log(`Mask generation completed in ${duration}ms`);
    
    return NextResponse.json({ 
      maskBase64: maskData,
      metadata: {
        processingTime: duration,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    console.error(`Mask generation failed after ${duration}ms:`, error);
    
    const errorMessage = getErrorMessage(error);
    const errorStatus = getErrorStatus(error);
    
    // Detailed error responses
    if (errorMessage.includes('timed out')) {
      return NextResponse.json(
        { 
          error: `Request timed out after ${REQUEST_TIMEOUT / 1000} seconds. The mask generation is taking longer than expected.`,
          code: 'TIMEOUT_ERROR',
          processingTime: duration
        },
        { status: 408 }
      );
    } else if (errorStatus === 503) {
      return NextResponse.json(
        { 
          error: 'Gemini API is temporarily overloaded. Please try again in a few minutes.',
          code: 'SERVICE_UNAVAILABLE',
          processingTime: duration
        },
        { status: 503 }
      );
    } else if (errorStatus === 401) {
      return NextResponse.json(
        { 
          error: 'Invalid API key. Please check your GEMINI_API_KEY configuration.',
          code: 'AUTH_ERROR',
          processingTime: duration
        },
        { status: 401 }
      );
    } else if (errorStatus === 429) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please wait before making another request.',
          code: 'RATE_LIMIT_ERROR',
          processingTime: duration
        },
        { status: 429 }
      );
    } else {
      return NextResponse.json(
        { 
          error: `Failed to generate mask: ${errorMessage}`,
          code: 'PROCESSING_ERROR',
          processingTime: duration
        },
        { status: 500 }
      );
    }
  }
}