# SponsorSignal MVP

SponsorSignal is a Next.js job-search and application tracker. It uses SQLite for users, sessions, cached job listings, and saved applications. Local development uses a database file at `.data/sponsorsignal.db`; deployments use Turso/libSQL, a hosted SQLite-compatible service.

## Run locally

1. Use Node.js 20.9 or newer and run `npm install`.
2. Run `npm run dev` and open `http://localhost:3000`.
3. Create an account in the app. The local SQLite database and tables are created automatically.

To point local development at a hosted SQLite database, copy `.env.example` to `.env.local` and set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Without those variables, the app stores data in `.data/sponsorsignal.db`.

## Deploy to Vercel

Vercel Functions do not provide a shared persistent local filesystem, so a database file stored in a deployed function would not reliably retain data. Create a Turso/libSQL database, then add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the Vercel project's Production and Preview environment variables. Import the repository; Vercel detects Next.js and runs `npm run build`.

The app creates its tables and seeds sample jobs at startup. Users sign up with email and password; passwords are stored as scrypt hashes, session tokens are stored as hashes, and the browser receives an HTTP-only session cookie. Application queries are scoped to the authenticated user.

## Features

- Live remote job listings through the Himalayas API, with per-listing source links and attribution; local seeded listings remain available if the feed is unavailable.
- Keyword, location, experience, remote, salary-listed, and sort filters, with pagination.
- SQLite-backed account signup/signin and saved applications with status tracking.
- Responsive dashboard and Vercel deployment support.
