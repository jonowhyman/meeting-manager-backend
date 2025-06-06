# Meeting Manager Backend

This is the backend API for the Meeting Manager app that handles Motion API integration.

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env`
4. Deploy to Vercel: `vercel`

## Endpoints

- `GET /api/motion/user` - Get current Motion user
- `GET /api/motion/workspaces` - Get Motion workspaces
- `GET /api/motion/meetings` - Get Motion calendar events
- `POST /api/motion/tasks` - Create task in Motion

## Environment Variables

- `MOTION_API_KEY` - Your Motion API key

## Local Development

```bash
npm install
vercel dev
