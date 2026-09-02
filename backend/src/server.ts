import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Initialize and Validate Environment Variables
dotenv.config();
import { validateEnv } from './utils/env';
validateEnv();

// Route Imports
import authRoutes, { ensureSuperAdmin } from './routes/auth';
import restaurantRoutes from './routes/restaurant';
import dishRoutes from './routes/dish';
import tableRoutes from './routes/table';
import orderRoutes from './routes/order';
import billRoutes from './routes/bill';
import analyticsRoutes from './routes/analytics';
import staffRoutes from './routes/staff';
import dataOpsRoutes from './routes/dataOps';
import qtRoutes from './routes/qt';

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Render, Vercel, Nginx, etc.)
const server = http.createServer(app);

// Free Tier Optimization 1: Gzip/Deflate HTTP Response Compression
app.use(compression());

// Strict CORS Configuration based on FRONTEND_URL
const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const normalizedFrontendUrl = rawFrontendUrl.replace(/\/+$/, '');

const allowedOrigins = Array.from(
  new Set([
    normalizedFrontendUrl,
    'https://cafe-flow1-omega.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ])
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanedOrigin = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(cleanedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'x-idempotency-key'],
    credentials: true,
  })
);

// Helmet Security Headers (allowing cross-origin resource sharing for static files)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static assets - generated bills & uploaded restaurant media
app.use('/bills', express.static(path.join(__dirname, '../public/bills')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Free Tier Optimization 2: Low-RAM Socket.io Engine Tuning
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanedOrigin = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(cleanedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`Socket CORS policy does not allow access from origin: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// Make Socket.io instance accessible in Express request object
app.set('io', io);

// Rate Limiters for Production API protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per 15 minutes on auth/OTP endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again in 15 minutes.',
  },
});

// Apply Rate Limiters
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// Socket Events Setup
io.on('connection', (socket) => {
  console.log(`[Socket] New connection established: ${socket.id}`);

  // Room joining requests
  socket.on('join_restaurant', (restaurantId: string) => {
    if (restaurantId) {
      socket.join(restaurantId);
      console.log(`[Socket] Client ${socket.id} joined restaurant room: ${restaurantId}`);
    }
  });

  socket.on('join_order', (orderId: string) => {
    if (orderId) {
      socket.join(orderId);
      console.log(`[Socket] Client ${socket.id} joined order room: ${orderId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/data-ops', dataOpsRoutes);
app.use('/api/qt', qtRoutes);

// Free Tier Optimization 3: Detailed Keep-Alive & Health Check Endpoints
app.get(['/health', '/api/health'], (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  res.status(200).json({
    status: 'UP',
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbStatusMap[dbState] || 'unknown',
    memoryUsageMB: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error]:', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong on the server.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// DB Connection & Server Boot
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

// Free Tier Optimization 4: Mongoose Connection Pool Capping for MongoDB Atlas M0 Limit (50 max connections)
mongoose
  .connect(MONGO_URI, {
    maxPoolSize: 10, // Caps Mongoose pool size so Render instances never exceed Atlas M0 50-connection ceiling
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(async () => {
    console.log('[Database] MongoDB connection pool initialized (maxPoolSize: 10).');
    await ensureSuperAdmin();
    server.listen(PORT, () => {
      console.log(`[Server] CafeFlow backend listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('[Database] Connection failed:', error);
    process.exit(1);
  });
