# BRB

Remotely interact with AI coding assistants from your phone via SMS and voice. Approve, deny, and send instructions back to your assistant — even when you're away from your desk.

## Project Structure

```
BRB/
├── backend/          Express API server (TypeScript)
│   └── src/
│       ├── config/       Environment & app configuration
│       ├── db/           MongoDB connection
│       ├── middleware/   Error handling, validation
│       ├── modules/      Feature modules (health, users, assistants, etc.)
│       ├── routes/       Route aggregator
│       └── utils/        Logger and shared utilities
├── frontend/         React SPA (Vite + TypeScript)
│   └── src/
│       ├── components/   Shared components
│       ├── pages/        Route pages
│       ├── hooks/        Custom React hooks
│       ├── lib/          Utility functions
│       ├── types/        TypeScript type definitions
│       └── styles/       Global styles
├── package.json      Root workspace config
└── tsconfig.base.json Shared TypeScript config
```

## Tech Stack

- **Monorepo**: npm workspaces
- **Backend**: Express 5, Mongoose, Zod, Pino
- **Frontend**: React, Vite, React Router
- **Language**: TypeScript everywhere
- **Database**: MongoDB
- **Tooling**: ESLint, Prettier

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB running locally (or a MongoDB Atlas connection string)

### Setup

```bash
# Install all dependencies (root + workspaces)
npm install

# Copy env file and fill in values
cp .env.example .env
```

Edit `.env` and set at minimum:

- `MONGODB_URI` — your MongoDB connection string
- `JWT_SECRET` — any string for now (auth not yet implemented)

### Run

```bash
# Run both backend and frontend
npm run dev

# Run only backend (port 3001)
npm run dev:backend

# Run only frontend (port 5173)
npm run dev:frontend

# Build both
npm run build

# Lint
npm run lint

# Format
npm run format
```

### Verify

- Backend health check: `curl http://localhost:3001/api/health`
- Frontend: open `http://localhost:5173` in your browser

## Placeholder Scaffolding

The following modules exist as scaffolding only — routes return `{ status: "not implemented" }`:

- **auth** — authentication/authorization
- **users** — user management
- **assistants** — AI assistant connections
- **phone-numbers** — phone number registration
- **sessions** — active assistant sessions
- **approvals** — approval/deny flows
- **messages** — SMS/voice message handling
- **webhooks** — external service webhooks (Twilio, etc.)

The **health** module is fully functional.
