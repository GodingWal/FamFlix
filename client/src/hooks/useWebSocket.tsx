import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./useAuth";

interface WebSocketMessage {
  type: string;
  userId?: string;
  videoId?: string;
  data?: any;
  timestamp?: number;
}

interface UseWebSocketOptions {
  videoId?: string;
  onMessage?: (message: WebSocketMessage) => void;
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
  onCollaborationUpdate?: (data: any) => void;
}

export function useWebSocket({
  videoId,
  onMessage,
  onUserJoined,
  onUserLeft,
  onCollaborationUpdate,
}: UseWebSocketOptions = {}) {
  const { user, isAuthenticated } = useAuth();
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!isAuthenticated || !user || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/collaboration`;
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;

        // Join collaboration session for specific video
        if (videoId && user) {
          sendMessage({
            type: "join",
            userId: user.id,
            videoId,
            timestamp: Date.now(),
          });
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Handle specific message types
          switch (message.type) {
            case "user_joined":
              onUserJoined?.(message.userId!);
              break;
            case "user_left":
            case "user_disconnected":
              onUserLeft?.(message.userId!);
              break;
            case "collaboration_update":
              onCollaborationUpdate?.(message.data);
              break;
            default:
              onMessage?.(message);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionError("Connection error occurred");
      };

      ws.current.onclose = (event) => {
        setIsConnected(false);
        
        if (!event.wasClean && reconnectAttempts.current < maxReconnectAttempts) {
          // Attempt to reconnect
          const delay = Math.pow(2, reconnectAttempts.current) * 1000; // Exponential backoff
          reconnectAttempts.current++;
          
          setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      setConnectionError("Failed to establish connection");
    }
  }, [isAuthenticated, user, videoId, onMessage, onUserJoined, onUserLeft, onCollaborationUpdate]);

  const disconnect = useCallback(() => {
    if (ws.current && user && videoId) {
      // Send leave message before closing
      sendMessage({
        type: "leave",
        userId: user.id,
        videoId,
        timestamp: Date.now(),
      });
    }

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    setIsConnected(false);
  }, [user, videoId]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const sendCollaborationUpdate = useCallback((data: any) => {
    if (!user || !videoId) return false;
    
    return sendMessage({
      type: "update",
      userId: user.id,
      videoId,
      data,
      timestamp: Date.now(),
    });
  }, [user, videoId, sendMessage]);

  const sendCursorMove = useCallback((position: { x: number; y: number }) => {
    if (!user || !videoId) return false;
    
    return sendMessage({
      type: "cursor_move",
      userId: user.id,
      videoId,
      data: position,
      timestamp: Date.now(),
    });
  }, [user, videoId, sendMessage]);

  const sendChatMessage = useCallback((message: string) => {
    if (!user || !videoId) return false;
    
    return sendMessage({
      type: "chat",
      userId: user.id,
      videoId,
      data: { message },
      timestamp: Date.now(),
    });
  }, [user, videoId, sendMessage]);

  // Auto-connect when authenticated and videoId is provided
  useEffect(() => {
    if (isAuthenticated && videoId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, videoId, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    connectionError,
    connect,
    disconnect,
    sendMessage,
    sendCollaborationUpdate,
    sendCursorMove,
    sendChatMessage,
  };
}
