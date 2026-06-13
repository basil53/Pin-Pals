# 🎳 Pin Pals — Deployment Guide

A shared bowling tracker with real cloud storage. Follow these steps to get it live.

---

## Step 1 — Set up Supabase (your database)

1. Go to **https://supabase.com** and click **Start your project**
2. Sign in with GitHub (one click)
3. Click **New project**, give it a name like `pinpals`, choose a region close to you (e.g. London), set a database password and save it somewhere
4. Wait ~2 minutes for it to provision
5. In the left sidebar go to **SQL Editor** → **New query**
6. Open the file `supabase-setup.sql` from this folder, paste the entire contents in, and click **Run**
7. You should see "Success. No rows returned"

Now grab your credentials:
- Go to **Settings** (gear icon) → **API**
- Copy your **Project URL** (looks like `https://xxxx.supabase.co`)
- Copy your **anon public** key (long string starting with `eyJ...`)

---

## Step 2 — Push code to GitHub

1. Go to **https://github.com/new** and create a new repository called `pinpals` (keep it public or private, either works)
2. On your computer, open Terminal and run:

```bash
cd path/to/pinpals   # wherever you saved this folder
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pinpals.git
git push -u origin main
```

---

## Step 3 — Deploy on Vercel

1. Go to **https://vercel.com** and click **Sign up with GitHub**
2. Click **Add New Project**
3. Find and import your `pinpals` repository
4. Before clicking Deploy, expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → paste your Project URL from Step 1
   - `VITE_SUPABASE_ANON_KEY` → paste your anon key from Step 1
5. Click **Deploy**
6. Wait ~1 minute. Vercel will give you a URL like `pinpals.vercel.app`

That's it — share the URL with your friends! 🎳

---

## Updating the app later

Any time you push changes to GitHub, Vercel automatically redeploys. Just:

```bash
git add .
git commit -m "Your change description"
git push
```

---

## Custom domain (optional)

In Vercel → your project → **Settings** → **Domains**, you can add a custom domain like `pinpals.com` if you want something more personal.
