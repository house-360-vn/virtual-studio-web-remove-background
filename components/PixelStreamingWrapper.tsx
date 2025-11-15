// Copyright Epic Games, Inc. All Rights Reserved.

import React, { useEffect, useRef, useState } from 'react';
import {
    Config,
    AllSettings,
    PixelStreaming
} from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.6';

import { registerPS } from '@/lib/psBus'

export interface PixelStreamingWrapperProps {
    initialSettings?: Partial<AllSettings>;
}

export const PixelStreamingWrapper = ({
    initialSettings
}: PixelStreamingWrapperProps) => {
    const videoParent = useRef<HTMLDivElement>(null);
    const [pixelStreaming, setPixelStreaming] = useState<PixelStreaming>();
    const [clickToPlayVisible, setClickToPlayVisible] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        let streaming: PixelStreaming | null = null;
        let cleanupDone = false;
        let reconnectTimeoutId: NodeJS.Timeout | null = null;

        const initializePixelStreaming = async () => {
            if (!videoParent.current || cleanupDone) return;

            try {
                registerPS(null);

                const config = new Config({ 
                    initialSettings: {
                        AutoPlayVideo: true,
                        AutoConnect: true,
                        StartVideoMuted: true,
                        FakeMouseWithTouches: true,
                        HoveringMouse: false,
                        WaitForStreamer: true,
                        ...initialSettings
                    }
                });
                
                streaming = new PixelStreaming(config, {
                    videoElementParent: videoParent.current
                });

                // WebRTC connection events (primary events)
                streaming.addEventListener('webRtcConnected', () => {
                    console.log('WebRTC connected (WebSocket ready)');
                    setIsConnected(true);
                });

                streaming.addEventListener('webRtcDisconnected', () => {
                    console.log('WebRTC disconnected (WebSocket lost)');
                    setIsConnected(false);
                    attemptReconnect(2000);
                });

                // UE streaming stops but WebSocket still alive
                streaming.addEventListener('dataChannelError', () => {
                    console.log('UE stopped streaming (data channel error)');
                    setIsConnected(false);
                    attemptReconnect(2000);
                });

                // Play stream events
                streaming.addEventListener('playStreamRejected', () => {
                    setClickToPlayVisible(true);
                });

                // 1. Response listeners from UE
                streaming.addResponseEventListener('Info', (response) => {
                    console.log('UE Info Response:', response);
                    //alert(response);
                });

                registerPS(streaming);
                setPixelStreaming(streaming);

            } catch (error) {
                console.error('PixelStreaming initialization error:', error);
                if (!cleanupDone) {
                    // Retry initialization after delay
                    reconnectTimeoutId = setTimeout(() => {
                        if (!cleanupDone) {
                            initializePixelStreaming();
                        }
                    }, 3000);
                }
            }
        };

        const attemptReconnect = (delay: number) => {
            if (cleanupDone) return;
            
            // Clear any existing reconnect timeout
            if (reconnectTimeoutId) {
                clearTimeout(reconnectTimeoutId);
            }

            reconnectTimeoutId = setTimeout(() => {
                if (streaming && !cleanupDone) {
                    try {
                        console.log('Attempting to reconnect...');
                        streaming.reconnect();
                    } catch (err) {
                        console.log('Reconnect failed, will retry');
                        // Retry again with longer delay
                        attemptReconnect(5000);
                    }
                }
            }, delay);
        };

        initializePixelStreaming();

        return () => {
            cleanupDone = true;
            
            // Clear reconnect timeout
            if (reconnectTimeoutId) {
                clearTimeout(reconnectTimeoutId);
            }

            if (streaming) {
                try {
                    streaming.disconnect();
                } catch (err) {
                    console.warn('Cleanup warning:', err);
                }
            }
            registerPS(null);
            setPixelStreaming(undefined);
            setIsConnected(false);
        };
    }, []); // Empty dependency array to prevent recreation

    useEffect(() => {
        const container = videoParent.current;
        if (!container) return;

        const preventTouch = (e: TouchEvent) => {
            e.preventDefault();
        };

        container.addEventListener('touchstart', preventTouch, { passive: false });
        container.addEventListener('touchmove', preventTouch, { passive: false });
        container.addEventListener('touchend', preventTouch, { passive: false });

        return () => {
            container.removeEventListener('touchstart', preventTouch);
            container.removeEventListener('touchmove', preventTouch);
            container.removeEventListener('touchend', preventTouch);
        };
    }, []);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                backgroundColor: '#000'
            }}
        >
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    touchAction: 'none',
                    overflow: 'hidden'
                }}
                ref={videoParent}
            />
            
            {/* Click to play overlay */}
            {clickToPlayVisible && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        color: 'white',
                        fontSize: '18px',
                        zIndex: 10
                    }}
                    onClick={() => {
                        if (pixelStreaming) {
                            pixelStreaming.play();
                            setClickToPlayVisible(false);
                        }
                    }}
                >
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>▶️</div>
                        <div>Click to start streaming</div>
                    </div>
                </div>
            )}

            {/* Loading circle when not connected */}
            {!isConnected && !clickToPlayVisible && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        zIndex: 5
                    }}
                >
                    <div
                        style={{
                            width: '60px',
                            height: '60px',
                            border: '4px solid rgba(255, 255, 255, 0.3)',
                            borderTop: '4px solid #ffffff',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }}
                    />
                </div>
            )}

            {/* CSS Animation */}
            <style jsx>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                div, video, canvas {
                    cursor: grab !important;
                }
            `}</style>
        </div>
    );
};