# Third-Party Accounts and Setup Checklist

## 1. Purpose of This Document

This document lists every third-party account and service that may be needed for the AI Receptionist platform.

It is intended to help the founder and intern understand:

- which services are required
- why each service is needed
- when to create the account
- whether it is mandatory for MVP
- what credentials or configuration will be needed later

Important rule:

- No implementation should begin until the project owners explicitly approve the stack, architecture, and setup plan.

## 2. Recommended Creation Order

Create accounts in this order:

1. GitHub
2. Render
3. Supabase
4. OpenAI
5. Twilio
6. Email provider
7. Redis provider
8. Stripe
9. Monitoring tools
10. Calendar integration providers

This order keeps the setup simple and avoids creating unnecessary accounts too early.

## 3. Core Required Accounts

### GitHub

Purpose:

- Store source code
- Track version history
- Collaborate safely
- Trigger auto deployment to hosting

Why we need it:

- You said you want every change pushed to GitHub and deployed from there

Needed for MVP:

- Yes

What we will use it for:

- Repository hosting
- Branch workflow
- Pull requests
- Deployment integration with Render
- CI pipeline later

Recommended setup:

- Create one organization or one dedicated project account
- Create separate repositories if needed, or one monorepo
- Protect the production branch later

Important credentials/settings:

- GitHub account owner access
- Repository access controls
- Deploy key or GitHub app authorization for Render

### Render

Purpose:

- Host NestJS backend
- Host background workers
- Optionally host Next.js frontend

Why we need it:

- We want GitHub-based deployment and easy infrastructure management

Needed for MVP:

- Yes

What we will use it for:

- API hosting
- Worker hosting
- Autoscaling later
- Environment variables
- Background jobs
- Staging and production services later

Recommended setup:

- Connect GitHub repository
- Enable auto-deploy from selected branch
- Use Render Blueprint later for infrastructure-as-code

Important credentials/settings:

- Render account
- GitHub connection
- service environment variables
- domain settings later

### Supabase

Purpose:

- PostgreSQL database
- Optional auth
- Optional file storage

Why we need it:

- We want PostgreSQL with a managed service and good developer speed

Needed for MVP:

- Yes

What we will use it for:

- Main production database
- tenant-aware data storage
- backups and recovery
- storage later if needed

Recommended setup:

- One project for development
- Separate production project later
- Enable connection pooling
- Keep direct database URL for migrations only

Important credentials/settings:

- Project URL
- Anon key if frontend reads are needed
- Service role key for secure backend operations
- Pooled database URL
- Direct database URL

### OpenAI

Purpose:

- AI conversation intelligence
- voice handling logic
- summaries and extraction

Why we need it:

- The platform depends on AI-driven phone conversations and structured transcript handling

Needed for MVP:

- Yes

What we will use it for:

- AI agent behavior
- call conversation intelligence
- transcript summarization
- structured extraction from calls

Important credentials/settings:

- API key
- project or organization ownership
- usage and billing limits

### Twilio

Purpose:

- Phone numbers
- inbound voice calls
- call routing and telephony events

Why we need it:

- The product cannot answer real phone calls without a telephony provider

Needed for MVP:

- Yes

What we will use it for:

- buying phone numbers
- receiving customer calls
- forwarding call audio to the AI system
- call webhooks
- recordings and telephony logs depending on final setup

Important credentials/settings:

- Account SID
- Auth token
- Twilio phone numbers
- webhook configuration
- region and compliance settings

### Email Provider

Recommended provider:

- Resend

Purpose:

- Send post-call summaries
- Send alerts
- Send invoice reminders and payment confirmations

Why we need it:

- Email is part of the platform requirements from day one

Needed for MVP:

- Yes

What we will use it for:

- call summary email
- transcript email
- billing emails
- reminder emails

Important credentials/settings:

- API key
- verified sending domain
- sender address

### Redis Provider

Recommended provider:

- Render Redis or Upstash Redis

Purpose:

- background queue support
- caching
- rate limiting

Why we need it:

- Needed for high reliability and heavier traffic
- Prevents heavy async jobs from blocking the main API

Needed for MVP:

- Strongly recommended

What we will use it for:

- BullMQ queues
- retries
- scheduled jobs
- throttling
- temporary cache

Important credentials/settings:

- Redis connection URL
- auth token or password

## 4. Billing and Subscription Accounts

### Stripe

Purpose:

- subscriptions
- invoice handling
- payment methods
- auto pay

Why we need it:

- Your blueprint includes plans, billing cycles, invoices, reminders, and auto pay

Needed for MVP:

- Yes, if billing is included in the first release
- No, if billing is postponed to a later phase

What we will use it for:

- free trial logic
- package billing
- card storage
- recurring billing
- payment confirmation
- invoice generation support

Important credentials/settings:

- Publishable key
- Secret key
- webhook signing secret
- product and pricing setup

## 5. Monitoring and Reliability Accounts

### Sentry

Purpose:

- Error tracking
- issue alerts

Why we need it:

- Useful for production support and debugging

Needed for MVP:

- Recommended

What we will use it for:

- frontend error tracking
- backend exception monitoring
- alerting

Important credentials/settings:

- DSN
- project setup for frontend and backend

### Uptime / Health Monitoring

Possible providers:

- Better Stack
- UptimeRobot
- Render internal monitoring

Purpose:

- detect downtime
- alert on service issues

Needed for MVP:

- Recommended

## 6. Calendar Integration Accounts

These should only be created when calendar booking is ready to implement.

### Google Cloud

Purpose:

- Google Calendar API integration

Needed for MVP:

- Optional unless calendar sync is in first release

What we will use it for:

- check available slots
- create events
- sync consultation bookings

Important credentials/settings:

- Google Cloud project
- OAuth client credentials
- authorized redirect URLs

### Microsoft Azure / Microsoft 365 App Registration

Purpose:

- Microsoft Calendar integration

Needed for MVP:

- Optional unless calendar sync is in first release

Important credentials/settings:

- App registration
- client ID
- client secret
- redirect URLs

### Calendly Developer Setup

Purpose:

- Calendly availability and booking integration

Needed for MVP:

- Optional unless Calendly is part of the first release

Important credentials/settings:

- API token or OAuth app setup depending on implementation

## 7. Optional Product and Analytics Accounts

### PostHog

Purpose:

- product analytics
- funnels
- user behavior tracking

Needed for MVP:

- Optional

### Log Management / APM

Possible providers:

- Datadog
- New Relic
- Grafana Cloud

Needed for MVP:

- Optional at first
- More useful as traffic grows

## 8. Domain and Email Infrastructure

### Domain Registrar

Purpose:

- own the product domain

Needed for MVP:

- Yes

Examples:

- Cloudflare Registrar
- Namecheap
- GoDaddy

### DNS Provider

Purpose:

- manage DNS records
- connect website, API, email, and domain verification

Needed for MVP:

- Yes

Recommended:

- Cloudflare

### Email Domain Setup

Needed when using Resend or another email provider:

- SPF record
- DKIM record
- sender domain verification

## 9. Environment Variable Categories

We should expect secrets such as:

- GitHub deployment configuration
- Render service variables
- Supabase database URLs and keys
- OpenAI API key
- Twilio SID and token
- Email provider API key
- Redis URL
- Stripe keys and webhooks
- OAuth credentials for calendars

These should never be hardcoded into the application.

## 10. Ownership Recommendation

To avoid confusion later:

- Use a business email address for all core accounts
- Keep the founder as primary owner
- Add trusted admin access carefully
- Document recovery methods and backup codes

## 11. Recommended MVP Account List

For MVP, I recommend creating only these first:

- GitHub
- Render
- Supabase
- OpenAI
- Twilio
- Resend
- Redis provider
- Stripe if billing is in MVP
- domain + DNS provider

## 12. Recommended Later Account List

Create these later when needed:

- Google Cloud
- Microsoft calendar integration setup
- Calendly developer setup
- Sentry
- PostHog
- advanced APM/logging

## 13. My Practical Recommendation

Start with these accounts first:

1. GitHub
2. Render
3. Supabase
4. OpenAI
5. Twilio
6. Resend
7. Redis
8. domain provider
9. Stripe

Then only add integrations when the product needs them.

This keeps the setup clean, reduces cost, and avoids overcomplicating the project too early.

## 14. Next Planning Document

After this checklist, the next useful planning document should be:

- production architecture diagram
- monorepo structure
- environment variable inventory
- deployment flow from GitHub to Render
- scaling plan for higher traffic
