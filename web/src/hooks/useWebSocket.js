import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket connection states
 */
export const ConnectionState = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting'
};

/**
 * Hook for managing WebSocket connection with auto-reconnect
 * @param {Object} options
 * @param {string} options.url - WebSocket URL (defaults to current host)
 * @param {function} options.onMessage - Callback for each message received
 * @returns {{
 *   connectionState: string,
 *   isConnected: boolean,
 *   latency: number|null,
 *   send: (data: object) => void
 * }}
 */
export function useWebSocket({ url, onMessage } = {}) {
  const [connectionState, setConnectionState] = useState(ConnectionState.DISCONNECTED);
  const [latency, setLatency] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const lastMessageTime = useRef(null);
  const onMessageRef = useRef(onMessage);

  // Keep onMessage ref updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Build WebSocket URL
  const wsUrl = url || (() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  })();

  const connect = useCallback(() => {
    // Don't connect if already connecting/connected
    if (wsRef.current?.readyState === WebSocket.CONNECTING ||
        wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState(
      reconnectAttempts.current > 0
        ? ConnectionState.RECONNECTING
        : ConnectionState.CONNECTING
    );

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnectionState(ConnectionState.CONNECTED);
        reconnectAttempts.current = 0;
        lastMessageTime.current = Date.now();
      };

      ws.onmessage = (event) => {
        const now = Date.now();
        try {
          const data = JSON.parse(event.data);

          // Calculate latency from message timestamp if available
          if (data.timestamp) {
            const messageTime = new Date(data.timestamp).getTime();
            const calculatedLatency = now - messageTime;
            // Only use if reasonable (< 5 seconds)
            if (calculatedLatency >= 0 && calculatedLatency < 5000) {
              setLatency(calculatedLatency);
            }
          } else if (lastMessageTime.current) {
            // Fallback: time since last message
            setLatency(now - lastMessageTime.current);
          }

          lastMessageTime.current = now;

          // Call the message handler directly (not via state)
          // This ensures every message is processed, not just the last one
          if (onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        setConnectionState(ConnectionState.DISCONNECTED);
        wsRef.current = null;

        // Auto-reconnect with exponential backoff
        if (!event.wasClean) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setConnectionState(ConnectionState.DISCONNECTED);
    }
  }, [wsUrl]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    connectionState,
    isConnected: connectionState === ConnectionState.CONNECTED,
    latency,
    send
  };
}
