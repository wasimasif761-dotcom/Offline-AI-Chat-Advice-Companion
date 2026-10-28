# 🌙 Offline AI Chat & Advice Companion (آف لائن اردو رہبر)

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-100%25%20Offline-blue.svg)](manifest.json)
[![In--Browser AI](https://img.shields.io/badge/AI-WebLLM%20%26%20Transformers-purple.svg)](https://webllm.mlc.ai/)
[![Urdu Script](https://img.shields.io/badge/Language-Roman%20Urdu%20%E2%86%92%20%D8%A7%D8%B1%D8%AF%D9%88-green.svg)](https://fonts.google.com/specimen/Noto+Nastaliq+Urdu)
[![Target](https://img.shields.io/badge/Mobile%20Optimized-OPPO%20A15s%20%2F%204GB%20RAM-orange.svg)](#)

> **Developed by Waseem Asif**  
> A high-performance, mobile-first Progressive Web App (PWA) that runs **100% locally in your browser**. It understands **Roman Urdu** queries, problems, and dilemmas, and strictly responds in authentic, eloquent **Urdu Script (اردو رسم الخط)** with Noto Nastaliq typography.

---

## 🌟 اردو تعارف (Urdu Overview)
یہ ایک جدید ترین **آف لائن اے آئی رہبر اور چیٹ کمپینین** ہے جو بغیر کسی انٹرنیٹ کنکشن کے آپ کے موبائل براؤزر میں مقامی طور پر چلتا ہے۔ 
- **آپ رومن اردو (Roman Urdu) میں سوال پوچھیں یا مشورہ طلب کریں** (مثلاً: *"Mujhe bohot tension ho rahi hai kya karun?"*)
- **اے آئی آپ کو خالص، فصیح اور باوقار اردو رسم الخط میں جواب دے گا** (اردو نستعلیق میں مکمل رہنمائی)
- **ایڈمن دماغی تربیت (Admin Brain Training):** آپ اے آئی کو جو بھی نئی بات، اصول یا معلومات سکھائیں گے وہ اس کے دماغ میں ہمیشہ کے لیے محفوظ ہو جائے گی اور چیٹ میں پوچھے جانے پر فوری جواب دے گا۔
- **لائیو انٹرنیٹ تلاش (Live Web Search):** اگر کوئی نئی معلومات ماڈل کے پاس نہ ہو تو آن لائن ہونے پر انٹرنیٹ سے تازہ ترین معلومات حاصل کر لیتا ہے۔
- **انتہائی تیز رفتار اور کم ریم (OPPO A15s 4GB RAM) پر ہموار کارکردگی!**

---

## 🚀 Key Features (اہم خصوصیات)

### 1. 📴 100% Real In-Browser Offline AI Engine
- Powered by **WebLLM** (`SmolLM2-135M`, `Qwen2.5-0.5B`, `Llama-3.2-1B`) directly cached in the browser's `CacheStorage` & `IndexedDB`.
- Includes a **Built-in Fast Neural Rule Engine** with zero download requirement, guaranteeing immediate, lightning-fast execution on low-spec chipsets (e.g. MediaTek Helio P35 / PowerVR GE8320).
- Automatic hardware capability detection for WebGPU, RAM quota, and storage headroom.

### 2. 🧠 Admin Brain & Memory Training (دماغی تربیت اور کسٹم یادداشت)
- Dedicated **Admin Brain Training** tab where you can teach the AI custom facts, personal rules, company information, or specialized advice in Roman Urdu.
- Employs client-side **Retrieval-Augmented Generation (RAG)**: when a user asks a taught question in Chat, the AI retrieves the learned memory and responds authoritatively in Urdu!
- Full **Export / Import Brain Backup (.json)** capability.

### 3. 🌐 Live Internet Knowledge Fallback (گوگل سرچ گراؤنڈنگ)
- When connected to the internet, if the AI needs real-time information, current facts, or live updates not in the offline model, it connects to the server-side **Google Gemini API with Google Search Grounding** (`/api/live-lookup`).
- Synthesizes live web data and presents it strictly in natural Urdu script.
- Includes a quick toggle button **"🌐 Live Search (انٹرنیٹ تلاش)"** directly in the chat bar.

### 4. ✍️ Roman Urdu → Pure Urdu Script (اردو رسم الخط)
- The user writes in natural Roman Urdu (e.g. *"Subah jaldi uthne ke faide aur aadat kaise banayein?"*).
- The AI companion responds exclusively in right-to-left (RTL) **Noto Nastaliq Urdu**, complete with copy, audio voice playback (Urdu TTS), and session export.

### 5. 📱 Progressive Web App (PWA) & Glassmorphism Design
- Fully installable on Android, iOS (Add to Home Screen), and Desktop.
- Beautiful, eye-friendly Glassmorphism UI with Dark and Light mode toggles.
- Haptic touch feedback (`navigator.vibrate`) for tactile mobile feel.
- Multi-session chat history, auto-saving, and offline service worker precaching (`sw.js`).

---

## 📂 Project Architecture (فائلوں کی ساخت)

```
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions CI workflow
├── public/                     # Static assets & PWA files
│   ├── icon.svg
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   ├── apple-touch-icon.png
│   ├── manifest.json
│   └── sw.js
├── index.html                  # Main UI structure with Tabbed Navigation
├── style.css                   # Glassmorphism styling, RTL Urdu, Dark/Light modes
├── script.js                   # WebLLM, Admin Brain RAG, Chat Handler, Offline Store
├── server.ts                   # Full-Stack Server with Google Search Grounding API
├── manifest.json               # Root PWA Web App Manifest
├── sw.js                       # Service Worker for offline-first caching
├── package.json                # Project dependencies and build scripts
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite bundling configuration
├── LICENSE                     # MIT License
└── README.md                   # Complete documentation
```

---

## 🛠️ Local Installation & Development

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### 1. Clone the repository
```bash
git clone https://github.com/your-username/offline-urdu-ai-companion.git
cd offline-urdu-ai-companion
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment configuration (Optional for Live Internet Search)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your `GEMINI_API_KEY` in `.env` if you wish to enable the online Google Search Grounding fallback. (The offline engine works 100% without any API key!).

### 4. Start the application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for Production
```bash
npm run build
npm start
```

---

## 🚀 Publishing to GitHub (گٹ ہب پر پبلش کرنے کا طریقہ)

Follow these simple steps to publish this repository to your GitHub account:

1. **Initialize Git (if not already done):**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Offline AI Urdu Advice Companion by Waseem Asif"
   ```

2. **Create a new repository on GitHub:**
   - Go to [GitHub New Repository](https://github.com/new).
   - Set the name (e.g. `offline-urdu-ai-companion`).
   - Keep it Public and leave "Initialize with README" unchecked.

3. **Link and Push:**
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/offline-urdu-ai-companion.git
   git push -u origin main
   ```

---

## 👨‍💻 Author & Credits

**Waseem Asif**  
*Lead Full-Stack & PWA Engineer*  
- Dedicated to building resilient, offline-first mobile web technologies.

---

## 📄 License
This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
