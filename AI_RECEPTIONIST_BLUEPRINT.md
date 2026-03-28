# AI Receptionist Platform Blueprint

## 1. Project Overview

We are building a multi-tenant AI receptionist platform for businesses. Each business can sign up, configure its company information, and let an AI answer customer calls automatically. The AI should speak naturally, collect customer details, take orders or booking requests, store everything in the business portal, and send email summaries after each call.

The platform must work well on:

- Desktop computers
- Laptops
- Tablets
- Mobile phones

This will be a responsive web portal, not a separate desktop app.

Important delivery rule:

- No product development should begin until the blueprint is reviewed and explicitly approved by the founders or project owners.

## 2. Main Goal

The goal is to let any business activate an AI receptionist from a web portal.

When a business turns the AI switch `ON`, the AI should:

- Answer incoming calls automatically
- Greet callers using the business name
- Talk in natural language like a real human
- Answer basic questions using the business's data
- Take orders, booking requests, or messages
- Store the full transcript and structured summary in the backend
- Email a call summary to the business
- Follow after-hours rules
- Follow medical safety rules for medical businesses

## 3. Product Type

This is a SaaS platform with multi-tenant architecture.

That means:

- Many businesses can sign up on the same platform
- Each business sees only its own data
- The platform admin can see and manage all businesses

## 4. Core Business Idea

Example use cases:

- Restaurants taking phone orders
- Salons receiving booking requests
- Clinics collecting patient callback requests
- Repair shops taking service inquiries
- Real estate offices handling lead calls
- Law firms capturing consultation requests

The portal should support many industries, not just one.

## 5. User Types

### Platform-Level Roles

#### Super Admin

Can manage the whole system:

- View all businesses
- View all call logs
- View all transcripts if needed for support
- Manage subscriptions
- Suspend or reactivate accounts
- Manage system-wide settings
- Review failures and errors

#### Support Admin

Can help businesses with setup and support:

- View business settings
- View logs and transcripts for troubleshooting
- Help update configuration
- Cannot change platform ownership settings unless granted

#### Operations Admin

- Can manage call routing behavior
- Can review AI failures and telephony incidents
- Can monitor call quality and service uptime

#### Billing Admin

- Can manage plans, invoices, trials, overdue states, and payment policies
- Can decide the free trial duration at platform level

### Business-Level Roles

#### Business Owner

- Full access to that business account
- Can edit company profile
- Can manage staff
- Can change AI settings
- Can see calls, transcripts, and orders
- Can manage billing for that business

#### Manager

- Can manage day-to-day operations
- Can view calls, transcripts, and requests
- Can update business settings based on permission

#### Staff

- Can view assigned or allowed data
- Can see customer requests and transcripts based on permissions

#### Billing Admin

- Can manage invoices and plan details
- Cannot control full business settings unless allowed

Custom platform-level and business-level roles should be supported later so the admin can define extra roles and assign duties as needed.

## 6. Business Signup Flow

When a business signs up, it should complete onboarding in steps:

1. Create account
2. Enter business name
3. Select industry/category
4. Enter address and location
5. Enter contact number
6. Enter email address
7. Enter timezone
8. Add services or products
9. Add fee list or pricing
10. Set operating hours
11. Configure AI scenarios and conditions
12. Choose greeting and voice preference
13. Review settings
14. Make a test call
15. Edit any preferences if needed
16. Select package and billing cycle
17. Turn AI receptionist `ON`

If the company is already registered, the sign-in page should include:

- Username or email field
- Password field
- Sign in button

If the company is new, the sign-up page should include:

- Business name
- Industry type
- Address
- Contact number
- Email address
- Password

## 7. Business Categories

We should support category-based behavior from day one.

Example categories:

- Restaurant
- Cafe
- Salon
- Spa
- Dental
- Clinic
- Doctor
- Physiotherapy
- Pharmacy
- Veterinary
- Repair shop
- Plumbing
- Electrician
- Real estate
- Legal
- Consultancy
- Other

## 8. Medical Mode

Medical Mode should be enabled automatically when a business signs up as a medical-type business.

Medical-type categories include:

- Doctor
- Clinic
- Dental
- Physiotherapy
- Mental health
- Urgent care
- Veterinary
- Pharmacy

When Medical Mode is enabled:

- The AI must give an emergency warning when appropriate
- The AI must avoid risky medical advice
- The AI must avoid diagnosis-like responses
- The AI should mainly capture callback requests, appointment requests, and general inquiries
- The AI should use safer conversation rules

Example emergency notice:

`If this is a medical emergency, please call 911 immediately.`

Important note:

If we handle sensitive medical data in the United States, we may need HIPAA-focused architecture and vendor review. For MVP, the safer approach is to support basic intake and callback handling instead of detailed clinical data collection.

## 9. Main Features for Businesses

Each business should have access to the following portal modules:

### Dashboard

- Quick stats
- AI status
- Recent calls
- Recent orders or requests
- Missed calls or failed calls

### Business Profile

- Brand name
- Category
- Description
- Address
- Service area
- Phone number
- Email
- Timezone

### Services / Products

- Add services
- Add products
- Set pricing if desired
- Add FAQs related to services

### Operating Hours

- Set open and close time per day
- Mark closed days
- Set holiday exceptions later

### AI Settings

- Toggle AI `ON/OFF`
- Select scenarios for when AI should answer
- Select voice preference
- Set greeting message
- Set tone and speaking style
- Configure special instructions
- Configure escalation rules
- Make a test call before going live

### Call Answering Scenarios

Businesses should be able to choose how AI answers calls based on their own rules.

Examples:

- Answer all incoming calls
- Answer calls only during specific hours
- Answer after business hours only
- Answer only if staff does not answer within 3 to 4 rings
- Answer overflow calls during busy periods
- Answer only weekend calls
- Answer only holiday or special closure calls
- Use different logic for different departments later

### Call Logs

- List all calls
- Call date and time
- Caller name
- Caller number
- Caller email if collected
- Call duration
- Call outcome
- Call notes or summary
- Linked transcript
- Download or listen to recording later

### Transcripts

- Full conversation transcript
- AI summary
- Search and filter

### Call Recordings

- Record all calls answered by AI
- Store recording references securely
- Allow playback based on permissions
- Add legal consent notice where required

### Orders / Requests / Leads

- Customer name
- Phone number
- Request type
- Notes
- Address if needed
- Status such as new, in progress, completed, cancelled

### Notifications

- Email summary recipients
- Urgent call alerts
- Failure alerts
- Send post-call email immediately after the call ends

### Team Management

- Invite staff
- Assign roles
- Control permissions
- Allow future custom roles and custom duties

### Billing

- Current plan
- Free trial status
- Usage
- Invoices
- Payment method
- Card details for auto pay
- Billing cycle selection
- Auto pay toggle
- Payment confirmations
- Overdue reminders

### Calendar Integrations

- Connect Google Calendar
- Connect Calendly
- Connect Microsoft Calendar
- Check available slots
- Tell callers available slots
- Book consultations directly into the connected calendar

### Industry Workflows

Different industries need different AI actions. The system should support workflows such as:

- Take general inquiry or message
- Note callback request
- Share service fees
- Share consultation fees
- Take restaurant or bakery orders
- Read menu pricing
- Capture consultation booking request
- Capture delivery request or pickup request
- Collect lead information
- Route urgent but non-emergency matters correctly

## 10. Main Features for Platform Admin

The admin panel should include:

- View all registered businesses
- Search businesses by name, category, status, or location
- View business plan and usage
- View global call statistics
- View failed calls and system incidents
- Access support tools
- Manage account status
- Manage subscription state
- View audit logs
- Create and manage packages
- Set free trial duration
- Decide package pricing rules
- Monitor unpaid invoices
- Disable or warn accounts based on payment policy
- Manage available voices, accents, and playback samples
- Manage role templates at platform level

### Packages and Plans

The system should support package setup such as:

- Free Trial
- Basic
- Silver
- Gold
- Platinum

Each package should define:

- Monthly fee or fee per minute bundle
- Included features
- Limits on minutes, users, locations, or integrations
- Trial duration where applicable

### Billing Policy

The system should support:

- Monthly, quarterly, or yearly billing cycles
- Auto pay with saved card
- Manual invoicing when auto pay is disabled
- Invoice generation based on billing cycle
- Due date emails
- Payment confirmation emails
- Reminder emails 10 days before due date for manual billing
- Additional reminder 5 days later for unpaid manual invoices
- Outstanding balance emails after due date
- Warning and account disable workflow after 3 unpaid invoices

## 11. AI Calling Flow

High-level call flow:

1. Customer calls the business number
2. Telephony provider receives the call
3. The system checks whether AI answering is enabled
4. The system loads the business profile and business rules
5. The system checks the selected answering scenario
6. The system checks current business hours in that business timezone
7. If staff does not answer within the configured ring count, AI may take over if that rule is enabled
8. If the business is open and the selected conditions are met, AI answers normally
9. If the business is closed, AI uses the after-hours script if that scenario is enabled
10. If Medical Mode is enabled, the medical safety logic is applied
11. AI uses the custom greeting configured by the business
12. AI talks naturally with the caller
13. AI captures structured information from the call
14. The call is recorded if recording is enabled
15. Transcript and summary are stored
16. Email summary is sent to the business immediately after the call ends
17. The request appears in the business portal

## 12. After-Hours Behavior

If the business is closed:

- AI should inform the caller that the business is currently outside operating hours
- AI can still collect order details, callback requests, or appointment requests
- AI should clearly say the business will process the request when operating hours resume

Example after-hours message:

`We are currently outside our normal operating hours, but I can still take your request and the team will follow up when the business reopens.`

## 13. Voice Strategy

Voice selection will come from the AI voice provider.

For MVP, we should use provider-backed voice IDs and show user-friendly labels in the portal.

Portal labels can be:

- American Female - Warm
- American Female - Professional
- British Female - Polite
- American Male - Professional
- British Male - Formal

The business should be able to:

- Listen to a sample recording for each available voice
- Select male or female voice
- Select accent or tone variation where supported

The business should not see internal voice IDs directly.

The backend will map portal labels to actual provider voice names.

## 14. Required Data to Capture From Calls

Depending on business type, the AI should try to capture:

- Caller name
- Caller phone number
- Caller email address if shared
- Reason for calling
- Order details
- Service needed
- Preferred date and time
- Delivery or service address if needed
- Special notes
- Urgency level if relevant
- Consultation slot if booked
- Fee or price quoted if applicable

## 15. Data Visibility Rules

Because this is a multi-tenant platform:

- Each business must only see its own data
- Business staff must only see what their role allows
- Admin can manage and view all data as needed for support and operations

This must be enforced at both:

- Application level
- Database level

## 16. Important System Rules

The system should also support:

- Timezone-based operating hours
- Call recording consent settings
- Spam call handling
- Failed call recovery
- Human transfer or voicemail fallback later
- Searchable transcripts
- Audit logs for admin actions
- Usage tracking by minutes and calls
- Payment reminders and overdue workflows
- Account warning rules for unpaid invoices
- Voice sample management
- Calendar booking sync logic

## 17. Features We Should Add to the Blueprint Now

These are important even if we build them later:

- Multi-location support
- SMS confirmations
- Appointment booking
- Calendar sync
- CRM integrations
- POS or order system integrations
- Custom knowledge base upload
- Analytics dashboard
- Language support beyond English
- Advanced voice library

## 18. MVP Scope

The first version should stay focused.

### MVP Includes

- Responsive web portal
- Business signup and login
- Multi-tenant account structure
- Business onboarding flow
- Business profile management
- Services or products setup
- Fee list setup
- Operating hours setup
- AI on/off toggle
- AI answering conditions and scenarios
- Custom greeting
- Voice selection
- Voice sample preview
- Call recordings
- Call logs
- Transcript history
- Order/request capture
- Email summaries
- Package selection
- Billing cycle selection
- Invoice generation
- Auto pay toggle
- Calendar integrations for booking support
- Medical Mode auto-enable for medical businesses
- Admin panel for platform management

### MVP Does Not Need Initially

- Custom cloned voices
- Outbound calling
- Multi-language support
- Deep CRM integrations
- HIPAA-heavy medical workflows
- Advanced analytics
- Native mobile apps

## 19. Recommended Technology Stack

This is the recommended stack for MVP:

### Frontend

- `Next.js`
- `TypeScript`
- `Tailwind CSS`

Why:

- Excellent for responsive web apps
- Fast development
- Good admin dashboard support
- Easy deployment

### Backend / Database / Auth

- `Supabase`

Use Supabase for:

- PostgreSQL database
- Authentication
- File storage if needed
- Realtime updates
- Row-level security for tenant isolation

### Backend Worker / Orchestration

- `Node.js` on `Render`

Why:

- Easy to build with
- Good for webhook handling
- Good for long-running AI call orchestration
- Easier than overcomplicated enterprise setup

### Telephony

- `Twilio`

Why:

- Reliable voice provider
- Easy number provisioning
- Supports inbound voice calls
- Good documentation and ecosystem

### AI Voice / Conversation

- `OpenAI Realtime API`

Why:

- Built for low-latency voice interactions
- Good fit for natural AI phone conversations
- Strong choice for real-time speech-based agents

### Email

- `Resend`

Why:

- Simple transactional email setup
- Good for transcript summaries and alerts

### Payments

- `Stripe`

Why:

- Standard choice for SaaS billing
- Good for subscriptions, invoices, payment methods, and auto pay

## 20. Why This Stack Is Best for Us

This stack is recommended because it is:

- Fast to build
- Easy to maintain
- Startup-friendly
- Good for multi-tenant SaaS
- Flexible enough for future growth

We are intentionally avoiding unnecessary complexity in version 1.

## 21. Suggested Technical Architecture

### Frontend Layer

- Next.js portal
- Business dashboard
- Admin dashboard
- Mobile-responsive pages

### Backend Layer

- Node.js service handling webhooks and AI session orchestration
- Supabase for persistent application data

### AI Call Layer

- Twilio receives phone call
- Audio is bridged to AI system
- AI responds in real time
- Final structured output is saved

### Notifications Layer

- Email summaries
- Alerting for urgent or failed calls
- Billing reminders and payment confirmations

## 22. Portal Pages We Need

### Public Website

- Home page
- Pricing page
- Features page
- Contact page
- Login page
- Signup page

### Business Portal

- Dashboard
- Business Profile
- Services / Products
- Fee List
- Hours
- AI Settings
- AI Scenarios
- Voice Library
- Calls
- Transcripts
- Recordings
- Orders / Requests
- Calendar Integrations
- Team
- Notifications
- Billing
- Package Selection
- Test Call Review

### Admin Portal

- Admin Dashboard
- Businesses
- Call Monitoring
- Incident Logs
- Usage
- Billing Oversight
- Audit Logs
- Plans and Packages
- Voice Management
- Trial Management
- Payment Recovery

## 23. Database Entities We Will Need

At a high level, we will need tables such as:

- users
- businesses
- business_members
- business_locations
- services
- products
- price_lists
- business_hours
- ai_settings
- ai_answering_rules
- voice_options
- calls
- call_recordings
- transcripts
- call_summaries
- orders_or_requests
- calendar_integrations
- bookings
- notification_settings
- subscriptions
- invoices
- payments
- payment_methods
- package_definitions
- role_definitions
- audit_logs

## 24. Security and Access Control

We must design security from the beginning.

Important points:

- Strong authentication
- Role-based access control
- Tenant isolation
- Encryption for sensitive data
- Audit logs for admin actions
- Restricted transcript access where needed

## 25. Key Risks

The biggest risks are:

- Poor tenant isolation
- High voice latency
- Bad after-hours logic
- Incorrect medical handling
- Calendar sync failures
- Incorrect billing automation
- Weak prompt design causing poor call quality
- Compliance issues with recordings and personal data

## 26. What Success Looks Like

The MVP is successful if a business can:

- Sign up
- Configure its company details
- Add products, services, and fee list
- Configure when AI should answer
- Set a custom greeting
- Preview and select a voice
- Turn AI answering on
- Receive a real phone call
- Let AI answer naturally
- Capture useful structured information
- Record the call
- View that information in the portal
- Receive an email summary
- Select a plan and pay correctly

## 27. Build Order Recommendation

We should build in this order:

1. Blueprint and system planning
2. Database and user role design
3. Responsive portal UI
4. Business onboarding
5. Admin panel basics
6. Telephony integration
7. AI voice flow
8. Transcript and order storage
9. Email summaries
10. Testing and stabilization

## 28. Final Recommendation

We should move forward with:

- `Next.js`
- `Supabase`
- `Node.js`
- `Render`
- `Twilio`
- `OpenAI`
- `Resend`

This is the best combination for building the first version quickly without making the system unnecessarily hard to manage.

## 29. Notes for the Intern

When working on this project, keep these rules in mind:

- Build for responsive web first
- Keep the platform multi-tenant from day one
- Separate business data correctly
- Make Medical Mode automatic for medical businesses
- Keep admin controls separate from business controls
- Do not start implementation without explicit approval
- Keep the MVP focused and avoid overbuilding
- Use clear module boundaries so we can scale later

## 30. Next Step

The next document to create after this blueprint should be:

- Detailed feature breakdown by page
- Database schema design
- API list
- AI prompt and call behavior design
- Development roadmap by milestones
