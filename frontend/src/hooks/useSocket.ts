import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/config';

/**
 * Socket.io React hook that establishes connection and handles room subscriptions
 * @param roomType The room category ('restaurant' for admin/kitchen dashboards, 'order' for customer order status)
 * @param roomId The specific ID (restaurantId or orderId)
 * @returns Active socket instance or null
 */
export const useSocket = (roomType?: 'restaurant' | 'order', roomId?: string | null) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!roomId) return;

    // Establish connection
    const socketInstance = io(SOCKET_URL);
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log(`[Socket Hook] Connected: ${socketInstance.id} | Room: ${roomType} -> ${roomId}`);
      
      if (roomType === 'restaurant') {
        socketInstance.emit('join_restaurant', roomId);
      } else if (roomType === 'order') {
        socketInstance.emit('join_order', roomId);
      }
    });

    socketInstance.on('connect_error', (err) => {
      console.error('[Socket Hook] Connection error:', err);
    });

    // Cleanup connection when component unmounts or roomId changes
    return () => {
      console.log(`[Socket Hook] Disconnecting from room: ${roomType} -> ${roomId}`);
      socketInstance.disconnect();
    };
  }, [roomType, roomId]);

  return socket;
};
export default useSocket;
