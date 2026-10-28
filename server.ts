import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// Initialize GoogleGenAI SDK with User-Agent header as required
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Live Internet Search & Fact Lookup endpoint
app.post('/api/live-lookup', async (req, res) => {
  try {
    const { query, customMemoryContext } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on server' });
    }

    let prompt = `You are an expert, empathetic AI Advice & Knowledge Companion (رہبر).
User query written in Roman Urdu: "${query}".

${customMemoryContext ? `Important Custom Memories / Facts taught by Admin:\n${customMemoryContext}\n` : ''}

CRITICAL RULES:
1. Deeply understand the Roman Urdu query and emotional context.
2. Search the live internet for any up-to-date facts, current events, or verified info needed.
3. YOU MUST ALWAYS AND EXCLUSIVELY RESPOND IN NATURAL, ELOQUENT, AND PROPER URDU SCRIPT (اردو رسم الخط میں).
4. NEVER respond in Roman Urdu or English.
5. Provide structured, respectful, and compassionate advice and answers in authentic Urdu.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const urduText = response.text || '';
    return res.json({
      text: urduText,
      source: 'live_web',
      groundingMetadata: response.candidates?.[0]?.groundingMetadata || null,
    });
  } catch (error: any) {
    console.error('Error in /api/live-lookup:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Mount Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}

startServer();
