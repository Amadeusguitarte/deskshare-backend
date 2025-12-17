# DeskShare Backend

Production-ready backend API for DeskShare computer rental platform.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database
- Cloudinary account (for images)
- Stripe account (for payments)

### Installation

1. **Clone and install dependencies**
```bash
cd backend
npm install
```

2. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your actual values
```

3. **Initialize database**
```bash
npx prisma migrate dev --name init
npx prisma generate
npm run db:seed
```

4. **Start development server**
```bash
npm run dev
```

Server runs on `http://localhost:3000`

## 📋 Environment Variables

Required variables in `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/deskshare"
JWT_SECRET="your-secret-key-minimum-32-characters"
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
STRIPE_SECRET_KEY="sk_test_..."
FRONTEND_URL="http://localhost:5500"
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Computers
- `GET /api/computers` - List computers (with filters)
- `GET /api/computers/:id` - Get computer details
- `POST /api/computers` - Create computer (protected)
- `PUT /api/computers/:id` - Update computer (protected)
- `DELETE /api/computers/:id` - Delete computer (protected)

### Bookings
- `POST /api/bookings` - Create booking
- `POST /api/bookings/:id/start` - Start session
- `POST /api/bookings/:id/end` - End session
- `GET /api/bookings/my-bookings` - Get user bookings
- `GET /api/bookings/:id` - Get booking details

### Chat
- `GET /api/chat/conversations` - Get conversations
- `GET /api/chat/:computerId` - Get messages for computer
- `POST /api/chat` - Send message

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/profile` - Update profile (protected)
- `GET /api/users/:id/stats` - Get user stats

### Payments
- `POST /api/payments/create-intent` - Create payment intent
- `POST /api/payments/webhook` - Stripe webhook
- `GET /api/payments/history` - Payment history

## 🧪 Testing

Test credentials after seeding:
- Email: `carlos@deskshare.com`
- Password: `password123`

## 🚢 Deployment

### Railway (Recommended)

1. Create Railway account
2. Connect GitHub repo
3. Add PostgreSQL service
4. Set environment variables
5. Deploy!

Railway auto-detects Node.js and runs:
```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm start
```

### Manual VPS Deployment

1. Install Node.js and PostgreSQL
2. Clone repo
3. Set environment variables
4. Run migrations
5. Start with PM2:
```bash
npm install -g pm2
pm2 start server.js --name deskshare-api
pm2 save
pm2 startup
```

## 📊 Database Schema

- Users
- Computers
- Computer Images
- Bookings
- Messages
- Reviews

See `prisma/schema.prisma` for full schema.

## 🔒 Security

- JWT authentication
- Password hashing with bcrypt
- Rate limiting
- Helmet.js security headers
- Input validation
- CORS protection

## 📝 License

MIT
