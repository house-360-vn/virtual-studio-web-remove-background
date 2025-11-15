// lib/psBus.ts
import { PixelStreaming } from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.6';

let globalPixelStreaming: PixelStreaming | null = null;
let isWebSocketConnected = false;
let isVideoStreamActive = false;

export function registerPS(ps: PixelStreaming | null) {
    // Cleanup previous instance
    if (globalPixelStreaming && globalPixelStreaming !== ps) {
        try {
            globalPixelStreaming.disconnect();
        } catch (err) {
            console.warn('Error disconnecting previous PixelStreaming instance:', err);
        }
    }
    
    globalPixelStreaming = ps;
    
    if (ps) {
        console.log('PixelStreaming instance registered globally');
        
        // Listen to verified connection events only
        ps.addEventListener('webRtcConnected', () => {
            console.log('WebRTC connected (ready for communication)');
            isWebSocketConnected = true;
        });
        
        ps.addEventListener('webRtcDisconnected', () => {
            console.log('WebRTC disconnected');
            isWebSocketConnected = false;
        });
        
        ps.addEventListener('videoInitialized', () => {
            console.log('📺 Video stream initialized');
            isVideoStreamActive = true;
        });
        
        ps.addEventListener('videoEncoderAvgQP', () => {
            // This fires when video is actively streaming
            isVideoStreamActive = true;
        });
        
        // Reset connection status when registering new instance
        isWebSocketConnected = false;
        isVideoStreamActive = false;
    } else {
        console.log('PixelStreaming instance unregistered');
        isWebSocketConnected = false;
        isVideoStreamActive = false;
    }
}

export function getPS(): PixelStreaming | null {
    return globalPixelStreaming;
}

export function sendToPS(message: string): boolean {
    if (!globalPixelStreaming) {
        console.warn('❌ No PixelStreaming instance available:', message);
        return false;
    }
    
    // CRITICAL: Check actual WebSocket connection status
    if (!isWebSocketConnected) {
        console.warn('❌ WebSocket not connected - message will be lost:', message);
        return false;
    }

    try {
        globalPixelStreaming.emitUIInteraction(message);
        console.log('📤 Message sent to UE:', message);
        return true;
    } catch (error) {
        console.error('📤❌ Failed to send to UE:', error, message);
        return false;
    }
}

// Proper connection status check
export function isPSReady(): boolean {
    return !!(globalPixelStreaming && isWebSocketConnected);
}

// Check if video is working (for fallback scenarios)
export function isVideoWorking(): boolean {
    return isVideoStreamActive;
}

// Get detailed status for debugging
export function getConnectionStatus() {
    return {
        hasInstance: !!globalPixelStreaming,
        webSocketConnected: isWebSocketConnected,
        videoActive: isVideoStreamActive,
        overallStatus: isPSReady() ? 'ready' : 'not-ready'
    };
}