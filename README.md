# LinkVault

> Serverless URL shortener with analytics, personal link management, and geo-enriched click tracking built on AWS Lambda, API Gateway, and DynamoDB.

![AWS SAM](https://img.shields.io/badge/AWS-SAM-orange?logo=amazon-aws)
![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![DynamoDB](https://img.shields.io/badge/DynamoDB-NoSQL-yellow?logo=amazon-dynamodb)
![Status](https://img.shields.io/badge/Status-Live-brightgreen)
![CI](https://github.com/kumaraharsh84/linkvault-analytics/actions/workflows/ci.yml/badge.svg)

---

## What is LinkVault?

LinkVault is a fully serverless URL shortener where users can shorten links, track every click with geo and device data, and manage their personal link collection from a modern, responsive React single-page application.

Unlike basic URL shorteners, LinkVault treats every link as a managed asset: it can have a saved title, an expiry window, and a 7-day restore grace period after expiry. Every redirect is tracked with country, city, device, and ISP data from a geo enrichment call.

**Live API:** `https://n5wzw93cd3.execute-api.ap-south-1.amazonaws.com/Prod`

---

## Architecture

```text
                   +--------------------------------------+
                   |         React Frontend (Vite)        |
                   | Login / Register / Shorten / Links   |
                   | Analytics / Restore / Search / UI    |
                   +------------------+-------------------+
                                      |
                                      v
                         +------------+-------------+
                         |       API Gateway        |
                         | /auth /shorten /links /s |
                         +------+------+------+-----+
                                |      |      |
                +---------------+      |      +------------------+
                |                      |                         |
                v                      v                         v
         +------+-------+      +------+--------+        +-------+--------+
         | Auth Lambda  |      | Shorten Lambda|        | Redirect Lambda|
         | login/register|     | create links  |        | redirect + log |
         +------+-------+      +------+--------+        +-------+--------+
                |                      |                         |
                v                      v                         v
         +------+-------+      +------+--------+        +-------+--------+
         | Users Table  |      | Links Table   |        | Clicks Table   |
         | email GSI    |      | userId GSI    |        | code GSI       |
         +------+-------+      +------+--------+        +-------+--------+
                                                        |
                                                        v
                                                 +------+--------+
                                                 |  ip-api.com   |
                                                 | geo enrichment|
                                                 +---------------+

            +---------------------+       +----------------------+
            | Analytics Lambda    |       | Links Lambda         |
            | country/device/date |       | list/rename/restore  |
            +---------------------+       | /delete/search/sort  |
                                          +----------------------+
```

**5 Lambda functions - 3 DynamoDB tables - 9 API routes - 1 React frontend**

---

## Features

### Authentication
- Register and login with email and password
- Passwords hashed with `bcrypt` before storage
- JWT tokens with 24-hour expiry issued on login
- Token stored in browser storage so the session is securely managed
- Atomic email reservation using DynamoDB transactions to prevent duplicate accounts on concurrent signups

### URL Shortening
- Deterministic 8-character Base62 short codes generated from MD5 hash of the URL
- Optional custom aliases supported
- Auto-adds `https://` if the user forgets it
- Rejects invalid URLs and already-shortened LinkVault URLs
- Duplicate protection so the same user cannot save the same destination URL twice

### Link Management
- Add a personal saved title to any link
- Rename saved titles at any time
- Choose expiry: `Never`, `1 Day`, `7 Days`, or `30 Days`
- Expired links stay restorable for an extra 7-day grace window
- Restore expired links directly from the My Links page
- Delete any link and all its associated click records
- Search, filter, and sort saved links

### Click Analytics
- Every redirect increments the click counter on the link
- Each click stored with: timestamp, device type, country, city, region, ISP, lat/lon
- Geo data fetched from `ip-api.com` on every redirect
- Analytics dashboard shows breakdowns by country, device, and date
- Recent click history table per link

### Infrastructure
- AWS SAM template where a single `sam deploy` provisions everything
- API Gateway with CORS headers on every response
- 3 DynamoDB tables with GSIs and TTL configured
- IAM roles scoped per Lambda function
- CloudWatch logs via `print()` on all Lambda handlers

---

## API Reference

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/register` | No | Create a new user account |
| POST | `/auth/login` | No | Validate credentials and return a JWT |
| POST | `/shorten` | Yes | Create a short URL |
| GET | `/s/{code}` | No | Redirect and record a click |
| GET | `/links` | Yes | List all links for the logged-in user |
| PATCH | `/links/{code}` | Yes | Rename the saved title of a link |
| POST | `/links/{code}/restore` | Yes | Restore an expired link within the grace window |
| DELETE | `/links/{code}` | Yes | Delete a link and all its click records |
| GET | `/analytics/{code}` | Yes | Return click analytics for a link |

All protected routes require: `Authorization: Bearer <token>`

---

## DynamoDB Schema

### Users Table
| Attribute | Type | Description |
|-----------|------|-------------|
| `userId` | String (PK) | Unique user ID |
| `name` | String | Display name |
| `email` | String | Login email |
| `password` | String | bcrypt hash |
| `createdAt` | String | ISO timestamp |
| `email-index` | GSI | Lookup user by email |

> Registration writes an `EMAIL_LOCK` item atomically to block concurrent duplicate signups.

### Links Table
| Attribute | Type | Description |
|-----------|------|-------------|
| `code` | String (PK) | Short code |
| `longUrl` | String | Destination URL |
| `userId` | String | Link owner |
| `title` | String | User-saved title |
| `activeUntil` | Number | Unix time when redirect stops working |
| `expiresAt` | Number | TTL - DynamoDB purges after this (`activeUntil + 7 days`) |
| `clickCount` | Number | Total redirect count |
| `isCustom` | Boolean | True for custom aliases |
| `userId-index` | GSI | List all links by user |

> `activeUntil` controls when the redirect stops. `expiresAt` controls when the record is deleted. The 7-day gap between them is the restore window.

### Clicks Table
| Attribute | Type | Description |
|-----------|------|-------------|
| `clickId` | String (PK) | Unique click ID |
| `code` | String | Short code |
| `timestamp` | String | ISO timestamp |
| `device` | String | Desktop / Mobile / Tablet |
| `country` | String | Geo country |
| `city` | String | Geo city |
| `isp` | String | Internet provider |
| `lat` / `lon` | Number | Coordinates |
| `code-index` | GSI | Query all clicks for a code |

---

## Local Setup

### Prerequisites
| Tool | Notes |
|------|-------|
| AWS CLI | Configured with deployment credentials |
| AWS SAM CLI | Required for build and deploy |
| Python 3.11 | Lambda runtime |
| Node.js & npm | To run the React frontend |

### Deploy

```bash
# 1. Build Lambda packages
sam build

# 2. Deploy to AWS (first time - use guided)
sam deploy --guided
# Set JwtSecret when prompted

# 3. Copy the ApiBaseUrl from SAM output
# Paste it into frontend/src/config.js as API_BASE
```

### Run Lambdas Locally

```bash
# Run Lambdas locally with hot-reload
sam local start-api --port 3001
```

### Run Frontend Locally

```bash
# In another terminal, navigate to the frontend directory
cd frontend

# Install dependencies (only needed once)
npm install

# Start the Vite development server
npm run dev
# Open http://localhost:5173
```

### Run sam local invoke examples

You can invoke individual Lambdas directly using event files:
```bash
sam local invoke AuthFunction -e events/auth-login.json
```
---

## How It Works

### Base62 Short Code Generation
1. MD5 hash the destination URL
2. Take the first 8 hex characters
3. Map each hex character to the Base62 alphabet (`0-9a-zA-Z`)
4. Result: deterministic 8-character code for the same URL
5. On collision with a different URL, adjust the last character using later hash bytes

### Expiry and Restore Window
- `activeUntil` - redirect stops working after this Unix timestamp
- `expiresAt` - DynamoDB TTL, set to `activeUntil + 7 days`
- During those 7 extra days, the frontend shows a **Restore** button
- Restoring the link resets `activeUntil` to a new expiry from today

### Geo Enrichment
1. Redirect Lambda reads source IP from API Gateway event
2. Calls `ip-api.com/json/{ip}` for country, city, region, ISP, lat, lon
3. Saves fields with the click record
4. If lookup fails, the click is still saved with `Unknown` fallback values

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized - please login` | Missing or expired token | Login again |
| `Email already registered` | Email taken | Use login or different email |
| `This URL is already saved in your links` | Duplicate URL for same user | Use the existing saved link |
| `This is already a LinkVault short URL` | Pasted a short URL instead of original | Paste the destination URL |
| `This short link has expired` | Link passed `activeUntil` | Restore if grace window is open |
| `The restore window has ended` | Grace window expired | Create a new short link |
| Geo fields show `Unknown` | `ip-api.com` lookup failed | Check Lambda internet access |

---



---

## Project Structure

```text
url-shortener-analytics/
|-- src/
|   |-- auth_handler/       # Register and login Lambda
|   |-- shorten_handler/    # URL shortening Lambda
|   |-- redirect_handler/   # Redirect + click tracking Lambda
|   |-- links_handler/      # Link management Lambda
|   `-- analytics_handler/  # Click analytics Lambda
|-- frontend/
|   |-- src/                # React source code (components, pages, etc.)
|   |-- package.json        # Frontend dependencies
|   `-- vite.config.js      # Vite configuration
|-- template.yaml           # AWS SAM infrastructure definition
`-- README.md
```

---

## Author

**Harsh Kumar** - B.Tech CSE  
Deployment Lead - LinkVault  
[GitHub](https://github.com/kumaraharsh84)
