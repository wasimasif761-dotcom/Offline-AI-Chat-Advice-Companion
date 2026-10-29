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

// Initialize GoogleGenAI SDK with User-Agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Live AI & Internet Knowledge Endpoint with Multi-Model Fallback
app.post('/api/live-lookup', async (req, res) => {
  try {
    const { query, customMemoryContext } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on server' });
    }

    const now = new Date();
    const currentDateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Karachi'
    });
    const currentTimeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Karachi'
    });

    const systemPrompt = `You are an empathetic, wise, and highly knowledgeable AI Companion (رہبرِ زندگی).
Current Real-Time Reference (Pakistan / PKT): ${currentDateStr}, ${currentTimeStr}.
User query in Roman Urdu: "${query}".

${customMemoryContext ? `Custom Memories / Facts taught by Admin:\n${customMemoryContext}\n` : ''}

CRITICAL RULES:
1. Deeply understand the user's Roman Urdu query, question, or dilemma.
2. YOU MUST ALWAYS AND EXCLUSIVELY RESPOND IN NATURAL, ELOQUENT, AND PROPER URDU SCRIPT (اردو رسم الخط میں).
3. NEVER respond in Roman Urdu or English.
4. Give a complete, informative, and beautifully structured answer in authentic Urdu with polite Islamic greetings where appropriate.
5. If asked about today's date or time, give the exact current date/time accurately based on the provided reference.`;

    const candidateModels = [
      'gemini-3.1-flash-lite-preview',
      'gemini-3.8-flash'
    ];

    let generatedText = '';
    let usedModel = '';

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: systemPrompt,
        });

        if (response && response.text) {
          generatedText = response.text;
          usedModel = model;
          break;
        }
      } catch (err: any) {
        console.warn(`Model ${model} attempt failed:`, err?.status || err?.message);
      }
    }

    if (generatedText) {
      return res.json({
        text: generatedText,
        source: 'online_ai',
        model: usedModel
      });
    }

    return res.status(503).json({ error: 'AI models temporarily busy' });
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
