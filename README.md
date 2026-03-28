# Receptionist AI

This repository contains the first application foundation for the Receptionist AI platform.

## Structure

- `apps/web`: Next.js customer and admin portal
- `apps/api`: NestJS backend API and background job entrypoint foundation
- `packages/config`: shared configuration placeholders
- `prisma`: database schema

## Local Setup

1. Copy `.env.example` to `.env`
2. Install dependencies with `npm install`
3. Run the web app with `npm run dev:web`
4. Run the API with `npm run dev:api`

## Current Scope

This initial scaffold includes:

- monorepo workspace setup
- Next.js app shell
- NestJS API shell
- Prisma starter schema
- environment template

No production features should be built or deployed without explicit approval.
