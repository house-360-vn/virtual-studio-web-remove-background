// src/app/api/generate-scene/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality, Part } from "@google/genai";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
  },
};

// Hoặc cho App Router
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 phút timeout

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Cấu hình timeout và retry
const REQUEST_TIMEOUT = 90000; // 90 giây (vì generate nhiều ảnh phức tạp hơn)
const MAX_RETRIES = 3;
const BASE_DELAY = 5000;
const MAX_DELAY = 30000;

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

function calculateDelay(attempt: number): number {
  const exponentialDelay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.floor(exponentialDelay + jitter);
}

function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error).toLowerCase();
  
  return (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    status === 429 ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('connection')
  );
}

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

/**
 * Helper function to generate a single composite image với retry logic
 */
async function generateSingleImageWithRetry(
  parts: Part[],
  promptText: string,
  variationName: string
): Promise<string | null> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Generating ${variationName} - Attempt ${attempt}/${MAX_RETRIES}`);
      
      const allParts: Part[] = [
        { text: promptText },
        ...parts
      ];

      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: { parts: allParts },
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
          console.log(`Successfully generated ${variationName} on attempt ${attempt}`);
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }

      throw new Error(`No image was generated for ${variationName}`);
      
    } catch (error: unknown) {
      lastError = error;
      const errorMessage = getErrorMessage(error);
      
      console.error(`${variationName} attempt ${attempt} failed:`, errorMessage);
      
      // Nếu không phải lỗi có thể retry, throw ngay
      if (!isRetryableError(error)) {
        console.error(`Non-retryable error for ${variationName}:`, errorMessage);
        return null; // Return null thay vì throw để không break toàn bộ process
      }
      
      // Nếu đã hết lần retry
      if (attempt === MAX_RETRIES) {
        console.error(`All ${MAX_RETRIES} attempts failed for ${variationName}`);
        return null;
      }
      
      // Delay trước khi retry
      const delay = calculateDelay(attempt);
      console.log(`Waiting ${delay}ms before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('Starting scene generation request');
    
    const { 
      carImages, 
      backgroundImageBase64, 
      backgroundImageMimeType, 
      maskBase64 
    } = await request.json();

    // Validate input
    if (!carImages || carImages.length === 0 || !backgroundImageBase64 || !maskBase64) {
      return NextResponse.json(
        { error: 'Missing required fields: carImages, backgroundImageBase64, and maskBase64 are required' },
        { status: 400 }
      );
    }

    // Debug: Log dữ liệu nhận được
    console.log('Received data:', {
      carImagesCount: carImages.length,
      carImageSample: {
        base64Length: carImages[0]?.base64?.length,
        mimeType: carImages[0]?.mimeType,
        hasInvalidChars: carImages[0]?.base64 ? !/^[A-Za-z0-9+/=]+$/.test(carImages[0].base64) : false
      },
      backgroundImageBase64Length: backgroundImageBase64.length,
      maskBase64Length: maskBase64.length
    });

    // Clean và validate base64 strings
    const cleanCarImages = carImages.map((img: { base64: string; mimeType: string }) => {
      // Remove any whitespace and validate base64
      const cleanBase64 = img.base64.replace(/\s/g, '');
      
      // Validate base64 format
      if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
        throw new Error('Invalid base64 format in car image');
      }
      
      return {
        base64: cleanBase64,
        mimeType: img.mimeType || 'image/png'
      };
    });

    const cleanBackgroundBase64 = backgroundImageBase64.replace(/\s/g, '');
    const cleanMaskBase64 = maskBase64.replace(/\s/g, '');

    // Validate cleaned data
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanBackgroundBase64)) {
      throw new Error('Invalid base64 format in background image');
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanMaskBase64)) {
      throw new Error('Invalid base64 format in mask');
    }

    console.log('Data cleaned and validated successfully');

    // Prepare image parts với dữ liệu đã clean
    const carImageParts: Part[] = cleanCarImages.map((img: { base64: string; mimeType: string }) => ({
      inlineData: { 
        data: img.base64, 
        mimeType: img.mimeType 
      }
    }));

    const backgroundImagePart: Part = { 
      inlineData: { 
        data: cleanBackgroundBase64, 
        mimeType: backgroundImageMimeType 
      } 
    };

    const maskImagePart: Part = { 
      inlineData: { 
        data: cleanMaskBase64, 
        mimeType: 'image/png' 
      } 
    };

    // Combine all parts
    const allParts: Part[] = [
      backgroundImagePart,
      maskImagePart,
      ...carImageParts
    ];

    const baseConstraints = `
**PRIMARY GOAL: Perform a photo-realistic vehicle replacement with absolute fidelity to the source car image.**

**NON-NEGOTIABLE RULE #1: ABSOLUTE PRESERVATION OF CAR'S FORM.** The physical form of the user-provided car is SACROSANCT. You are strictly forbidden from altering, modifying, distorting, or regenerating any part of the selected car's physical structure. This includes, but is not limited to: its shape, design, proportions, wheels, headlights, logos, and textures. You **MUST** use the pixel data from the source image as-is. Do not redraw or reinterpret the car.

**NON-NEGOTIABLE RULE #2: PERMITTED CHANGES.** The ONLY modifications you are permitted to make to the selected car image are:
1.  **Scaling:** Resizing the entire car proportionally to fit the scene's perspective.
2.  **Integration:** Applying realistic lighting, shadows, and reflections to seamlessly blend the car into the background environment.

**NON-NEGOTIABLE RULE #3: USE THE PROVIDED CAR IMAGES.** You **MUST** select the single best-matching car image from the provided source set. You **MUST NOT** generate, create, or invent a new car.

**NON-NEGOTIABLE RULE #4: MATCH THE ASPECT RATIO.** The final output image **MUST** have the exact same aspect ratio as the original background image.

**PROCESS:**
1.  **ANALYZE SCENE:** Analyze the background image to understand its perspective, camera angle, and lighting.
2.  **SELECT BEST ANGLE:** From the set of provided car source images, choose the ONE image that best fits the perspective and angle of the background scene, respecting all non-negotiable rules.
3.  **REPLACE AND INTEGRATE:** Use the provided mask to remove the object from the background. Place the car image you selected into the scene. Apply ONLY the permitted changes (Scaling and Integration) to blend it realistically.
**FINAL OUTPUT:** The output must be the final composite image ONLY. Do not output text.`;

    const prompt1 = `
**Goal:** Replace the masked object in the ORIGINAL background with the most suitable car from the Car Image Set.
**NON-NEGOTIABLE RULE #5: DO NOT CHANGE THE BACKGROUND.** You **MUST** use the original background image provided. Do not alter, modify, or regenerate it in any way. Only the masked area should be changed.
${baseConstraints}`;

    const prompt2 = `
**Goal:** Create a CREATIVE VARIATION. Generate a new background that is thematically similar to the original, then perform the full replacement process using the best-matching car from the Car Image Set.
${baseConstraints}`;

    const prompt3 = `
**Goal:** Create a SECOND, DIFFERENT CREATIVE VARIATION. Generate another new, unique background, thematically similar to the original but distinct from the first variation. Then, perform the full replacement process using the best-matching car. You **MUST** still use one of the user-provided car images.
${baseConstraints}`;

    // Generate all 3 variations in parallel
    console.log('Generating 3 scene variations in parallel...');
    const generationPromises = [
      generateSingleImageWithRetry(allParts, prompt1, 'Original Background'),
      generateSingleImageWithRetry(allParts, prompt2, 'Creative Variation 1'),
      generateSingleImageWithRetry(allParts, prompt3, 'Creative Variation 2'),
    ];

    const results = await Promise.all(generationPromises);
    const imageUrls = results.filter((url): url is string => url !== null);

    const duration = Date.now() - startTime;
    console.log(`Scene generation completed in ${duration}ms. Generated ${imageUrls.length}/3 images.`);

    if (imageUrls.length === 0) {
      throw new Error("The AI failed to generate any images. This might be due to a safety policy or an API error.");
    }

    return NextResponse.json({
      imageUrls: imageUrls,
      text: null,
      metadata: {
        processingTime: duration,
        successCount: imageUrls.length,
        totalAttempts: 3,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    console.error(`Scene generation failed after ${duration}ms:`, error);
    
    const errorMessage = getErrorMessage(error);
    const errorStatus = getErrorStatus(error);

    // Log chi tiết về lỗi
    console.error('Error details:', {
      message: errorMessage,
      status: errorStatus,
      error: error
    });

    // Handle validation errors
    if (errorMessage.includes('Invalid base64 format')) {
      return NextResponse.json(
        { 
          error: 'Invalid image data format. Please retake screenshots and upload background again.',
          code: 'VALIDATION_ERROR',
          processingTime: duration,
          details: errorMessage
        },
        { status: 400 }
      );
    }

    // Handle safety policy errors
    if (errorMessage.includes('SAFETY') || errorMessage.toLowerCase().includes('safety')) {
      return NextResponse.json(
        { 
          error: 'Image generation was blocked due to safety policies. This might be caused by invalid image format or content. Please check the console logs for details.',
          code: 'SAFETY_ERROR',
          processingTime: duration,
          details: errorMessage
        },
        { status: 400 }
      );
    }
    
    // Detailed error responses
    if (errorMessage.includes('timed out')) {
      return NextResponse.json(
        { 
          error: `Request timed out after ${REQUEST_TIMEOUT / 1000} seconds. The scene generation is taking longer than expected.`,
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
          error: errorMessage || 'Failed to generate the set of images. Please try again later.',
          code: 'PROCESSING_ERROR',
          processingTime: duration
        },
        { status: 500 }
      );
    }
  }
}