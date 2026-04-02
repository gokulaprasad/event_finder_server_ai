const Message = require('../models/Message');
const Event = require('../models/Event');
const User = require('../models/User');

// Store connected users
const connectedUsers = new Map();

const initializeChat = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join event chat room
    socket.on('join-event', async ({ eventId, userId }) => {
      try {
        // Verify user is registered for the event
        const event = await Event.findById(eventId);
        if (!event) {
          socket.emit('error', { message: 'Event not found' });
          return;
        }

        // Check if user is registered or is the organizer
        const isRegistered = event.isUserRegistered(userId);
        const isOrganizer = event.organizer.toString() === userId;

        if (!isRegistered && !isOrganizer) {
          socket.emit('error', { message: 'You must be registered for this event to join the chat' });
          return;
        }

        // Join the room
        socket.join(`event-${eventId}`);
        
        // Store user connection
        connectedUsers.set(socket.id, { userId, eventId });

        // Get user info
        const user = await User.findById(userId).select('name avatar');

        // Notify others that user joined
        socket.to(`event-${eventId}`).emit('user-joined', {
          userId,
          name: user.name,
          avatar: user.avatar,
          timestamp: new Date()
        });

        // Send recent messages
        const messages = await Message.find({ eventId })
          .populate('sender', 'name avatar')
          .sort({ timestamp: -1 })
          .limit(50);

        socket.emit('previous-messages', messages.reverse());

        // Send online users count
        const room = io.sockets.adapter.rooms.get(`event-${eventId}`);
        const onlineCount = room ? room.size : 0;
        io.to(`event-${eventId}`).emit('online-count', onlineCount);

        console.log(`User ${userId} joined event ${eventId}`);
      } catch (error) {
        console.error('Join event error:', error);
        socket.emit('error', { message: 'Failed to join event chat' });
      }
    });

    // Handle new message
    socket.on('send-message', async ({ eventId, userId, message }) => {
      try {
        // Validate message
        if (!message || message.trim().length === 0) {
          socket.emit('error', { message: 'Message cannot be empty' });
          return;
        }

        if (message.length > 1000) {
          socket.emit('error', { message: 'Message is too long' });
          return;
        }

        // Create and save message
        const newMessage = await Message.create({
          sender: userId,
          eventId,
          message: message.trim()
        });

        // Populate sender info
        await newMessage.populate('sender', 'name avatar');

        // Broadcast to all users in the event room
        io.to(`event-${eventId}`).emit('new-message', newMessage);

        console.log(`New message in event ${eventId} from user ${userId}`);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator
    socket.on('typing', ({ eventId, userId, isTyping }) => {
      socket.to(`event-${eventId}`).emit('user-typing', { userId, isTyping });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const userData = connectedUsers.get(socket.id);
      if (userData) {
        const { userId, eventId } = userData;
        
        // Notify others that user left
        socket.to(`event-${eventId}`).emit('user-left', {
          userId,
          timestamp: new Date()
        });

        // Update online count
        const room = io.sockets.adapter.rooms.get(`event-${eventId}`);
        const onlineCount = room ? room.size - 1 : 0;
        io.to(`event-${eventId}`).emit('online-count', onlineCount);

        connectedUsers.delete(socket.id);
        console.log(`User ${userId} disconnected from event ${eventId}`);
      }
      console.log('User disconnected:', socket.id);
    });
  });
};

module.exports = initializeChat;
