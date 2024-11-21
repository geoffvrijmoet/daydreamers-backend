# Project Overview
Use this guide to build a web app that allows me to manage my business Daydreamers Pet Supply LLC. Mainly, I'm interested in tracking every single sale and purchase, but I also want to be able to manage my inventory and create projections for the future, come up with marketing strategies, and price products in a sustainable and profitable way.

# Feature Requirements
- The app should have a dashboard that gives me a high level overview of my business.
- The app should have a calendar view of my sales and purchases, and allow me to easily add new ones.
- The app should have a list view of my sales and purchases, and allow me to easily add new ones.
- The app should integrate with my Square account so that I can sync my sales.
- The app should integrate with my Shopify account so that I can sync my sales and inventory.
- The app should integrate with my Gmail account. This will, first and foremost, allow me to see notifications from American Express so I can sync my purchases.
- The web app should have lightning-fast performance.
- We will use Next.js, Shadcn, Lucid, Clerk, MongoDB, and Tailwind CSS to build the app.
- The app doesn't necessarily need to be accessible through a publicly available URL. It can be hosted on my personal machine and I can access it through http://localhost:3001.

# Relevant Docs
This is the reference documentation for Clerk: https://clerk.com/docs/references/nextjs/

# Current File Structure
DAYDREAMERS-BACKEND/
├── app/
│   ├── fonts/
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── ui/
│       ├── button.tsx
│       ├── card.tsx
│       └── input.tsx
├── lib/
│   └── utils.ts
├── node_modules/
├── requirements/
│   ├── frontend-instructions.md
│   └── .cursorrules
├── .eslintrc.json
├── .gitignore
├── components.json
├── next-env.d.ts
├── next.config.mjs
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── README.md
├── tailwind.config.ts
└── tsconfig.json

# Rules
- All new components should go in /components and be named like example-component.tsx unless otherwise specified.
- All new pages go in /app.