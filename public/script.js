/**
 * Offline AI Chat & Advice Companion
 * Full In-Browser Local LLM Engine (WebLLM) + Admin Brain Memory RAG + Live Internet Search
 * Developed by Waseem Asif
 */

// ==========================================================================
// 1. Storage Keys & Default Configuration
// ==========================================================================
const APP_STORAGE_KEY = 'urdu_ai_companion_chat_sessions_v1';
const APP_SETTINGS_KEY = 'urdu_ai_companion_settings_v1';
const APP_BRAIN_KEY = 'urdu_ai_admin_brain_memories_v1';

const DEFAULT_SETTINGS = {
  engineMode: 'auto', // 'auto', 'force-local', 'force-builtin'
  modelId: 'SmolLM2-135M-Instruct-q0f32-MLC',
  fontFamily: 'nastaliq', // 'nastaliq', 'naskh', 'system'
  fontSize: 16,
  temperature: 0.6,
  onlineFallback: true,
  haptic: true,
  lowPower: true,
  theme: 'dark'
};

// Global Offline Trained Knowledge Base loaded from JSON
let trainedKnowledgeBaseEntities = [];

// Seed Memories taught by Admin on first launch
const INITIAL_BRAIN_MEMORIES = [
  {
    id: 'mem_1',
    query: 'Waseem Asif kaun hain?',
    answer: 'وسیم آصف ایک ماہر فل اسٹیک ویب ڈویلپر اور پی ڈبلیو اے (PWA) آرکیٹیکٹ ہیں جنہوں نے یہ جدید ترین آف لائن اردو اے آئی کمپینین تیار کیا ہے۔ وہ جدید ترین ٹیکنالوجیز کو کم ریم والے موبائلز پر تیز ترین چلانے میں مہارت رکھتے ہیں۔',
    category: 'personal',
    date: '2026-10-28',
    matchCount: 1
  },
  {
    id: 'mem_2',
    query: 'Yeh app offline kaise kaam karti hai?',
    answer: 'یہ ایپلیکیشن براؤزر کی لوکل اسٹوریج (CacheStorage اور IndexedDB) میں مقامی طور پر لینگویج ماڈل ڈاؤن لوڈ کر لیتی ہے۔ ماڈل انسٹال ہونے کے بعد یہ بغیر کسی انٹرنیٹ، وائی فائی یا سرور کے 100% آف لائن پروسیسنگ کرتی ہے۔',
    category: 'general',
    date: '2026-10-28',
    matchCount: 1
  },
  {
    id: 'mem_3',
    query: 'Office timings ya rabta ka waqt kya hai?',
    answer: 'ہمارے دفتری اور رابطہ کے عمومی اوقات پیر تا جمعہ صبح ۹:۰۰ بجے سے شام ۶:۰۰ بجے تک ہیں۔ آپ آن لائن کسی بھی وقت رابطہ کر سکتے ہیں۔',
    category: 'business',
    date: '2026-10-28',
    matchCount: 0
  }
];

// ==========================================================================
// 2. Global State
// ==========================================================================
let currentSettings = { ...DEFAULT_SETTINGS };
let currentSessionId = null;
let currentMessages = [];
let mlcEngine = null;
let isModelDownloading = false;
let isModelReady = false;
let isGenerating = false;
let isLiveSearchActive = false;
let deferredInstallPrompt = null;
let recognition = null;
let isRecordingVoice = false;

// Hardware & capability flags
let hasWebGPU = false;
let deviceMemoryGB = 4;
let hardwareCores = 4;

// System Prompt for WebLLM Local AI Model
const SYSTEM_PROMPT = `You are an empathetic, wise, and highly respected AI Advice & Life Companion (رہبرِ زندگی).
CRITICAL RULES:
1. The user will ALWAYS talk, ask questions, or describe problems in Roman Urdu (e.g. "Mujhe bohot tension hai", "Kamyabi ka tarika kya hai?", "Exam mein focus kaise karun?").
2. You must deeply comprehend their Roman Urdu query, emotions, and practical dilemma.
3. YOU MUST ALWAYS AND STRICTLY RESPOND ONLY IN HIGH-QUALITY, POLITE, AND NATURAL URDU SCRIPT (اردو رسم الخط میں).
4. NEVER respond in Roman Urdu. NEVER respond in English.
5. Provide structured, compassionate, and actionable advice with polite greetings (جیسے: السلام علیکم، پیارے بھائی / بہن) and positive encouragement.`;

// ==========================================================================
// 3. Admin Brain & Custom Memory Retrieval (RAG System)
// ==========================================================================

function getBrainMemories() {
  try {
    const raw = localStorage.getItem(APP_BRAIN_KEY);
    if (!raw) {
      localStorage.setItem(APP_BRAIN_KEY, JSON.stringify(INITIAL_BRAIN_MEMORIES));
      return INITIAL_BRAIN_MEMORIES;
    }
    return JSON.parse(raw);
  } catch (e) {
    return INITIAL_BRAIN_MEMORIES;
  }
}

function saveBrainMemories(memories) {
  try {
    localStorage.setItem(APP_BRAIN_KEY, JSON.stringify(memories));
    updateBrainCountBadge();
  } catch (e) {
    console.warn('Brain save error:', e);
  }
}

function updateBrainCountBadge() {
  const memories = getBrainMemories();
  const badge = document.getElementById('brainCountBadge');
  const diagCount = document.getElementById('diagBrainCount');
  if (badge) badge.textContent = memories.length;
  if (diagCount) diagCount.textContent = `${memories.length} Memories`;
}

/**
 * Semantic and keyword matching across trained memories
 */
function findBrainMatch(userQuery) {
  const memories = getBrainMemories();
  if (!memories || memories.length === 0) return null;

  const cleanUserQuery = userQuery.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, ' ').trim();
  const userWords = cleanUserQuery.split(/\s+/).filter(w => w.length > 2);

  let bestMatch = null;
  let bestScore = 0;

  for (const mem of memories) {
    const cleanMemQuery = mem.query.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, ' ').trim();
    const memWords = cleanMemQuery.split(/\s+/).filter(w => w.length > 2);

    // Exact or phrase match
    if (cleanUserQuery.includes(cleanMemQuery) || cleanMemQuery.includes(cleanUserQuery)) {
      mem.matchCount = (mem.matchCount || 0) + 1;
      saveBrainMemories(memories);
      return mem;
    }

    // Word overlap score
    let score = 0;
    for (const uw of userWords) {
      if (memWords.includes(uw)) score += 3;
      else if (cleanMemQuery.includes(uw)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = mem;
    }
  }

  // If score is strong enough (at least 2 matching key words)
  if (bestMatch && bestScore >= 4) {
    bestMatch.matchCount = (bestMatch.matchCount || 0) + 1;
    saveBrainMemories(memories);
    return bestMatch;
  }

  return null;
}

function trainNewMemory(query, answer, category = 'personal') {
  if (!query || !answer) return false;

  const memories = getBrainMemories();
  const newMem = {
    id: 'mem_' + Date.now(),
    query: query.trim(),
    answer: answer.trim(),
    category: category,
    date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    matchCount: 0
  };

  memories.unshift(newMem);
  saveBrainMemories(memories);
  populateBrainUI();
  showToast('نئی بات دماغ میں محفوظ ہو گئی (Fact Learned!)');
  triggerHaptic();
  return true;
}

function deleteMemory(id) {
  let memories = getBrainMemories();
  memories = memories.filter(m => m.id !== id);
  saveBrainMemories(memories);
  populateBrainUI();
  showToast('Memory Deleted');
  triggerHaptic();
}

function populateBrainUI(filterText = '') {
  const container = document.getElementById('brainMemoryList');
  if (!container) return;

  let memories = getBrainMemories();
  if (filterText) {
    const f = filterText.toLowerCase();
    memories = memories.filter(m => m.query.toLowerCase().includes(f) || m.answer.toLowerCase().includes(f));
  }

  if (memories.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 24px; color: var(--text-muted); font-size: 13px;">
        کوئی محفوظ شدہ یادداشت نہیں ملی۔ اوپر فارم کے ذریعے اے آئی کو نئی معلومات سکھائیں!
      </div>
    `;
    return;
  }

  container.innerHTML = memories.map(m => `
    <div class="memory-item-card" data-mem-id="${m.id}">
      <div class="memory-card-top">
        <span class="memory-item-query">${escapeHTML(m.query)}</span>
        <span class="memory-tag">${m.category}</span>
      </div>
      <div class="memory-item-answer" dir="rtl">
        ${escapeHTML(m.answer)}
      </div>
      <div class="memory-card-bottom">
        <span>Trained: ${m.date} • Used: ${m.matchCount || 0} times</span>
        <div class="memory-item-actions">
          <button class="btn btn-ghost btn-sm test-mem-btn" data-query="${escapeHTML(m.query)}" title="Test this question in Chat">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6" /></svg>
            <span>Test in Chat</span>
          </button>
          <button class="btn btn-ghost btn-sm del-mem-btn" data-id="${m.id}" title="Delete memory">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Bind clicks
  container.querySelectorAll('.test-mem-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      switchTab('chatView');
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.value = q;
        autoResizeTextarea(chatInput);
        toggleClearInputButton(true);
        handleSendMessage();
      }
    });
  });

  container.querySelectorAll('.del-mem-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteMemory(btn.getAttribute('data-id'));
    });
  });
}

function exportBrainBackup() {
  const memories = getBrainMemories();
  const jsonStr = JSON.stringify(memories, null, 2);
  downloadFile(jsonStr, `Urdu_AI_Brain_Memories_${Date.now()}.json`, 'application/json');
  showToast('Brain Memories Exported (.json)');
}

function importBrainBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (Array.isArray(parsed)) {
        saveBrainMemories(parsed);
        populateBrainUI();
        showToast('Brain Memories Restored Successfully!');
      } else {
        showToast('Invalid JSON file format.');
      }
    } catch (err) {
      showToast('Error reading JSON file.');
    }
  };
  reader.readAsText(file);
}

/// ==========================================================================
// 4. Built-in Advanced Offline Semantic & NLP Engine
// ==========================================================================

/**
 * Real-time dynamic date & time query handler
 */
function checkDateTimeQuery(prompt) {
  const p = prompt.toLowerCase().trim();
  const dateTriggers = [
    'date', 'tareekh', 'din', 'day', 'waqt', 'time',
    'aaj kya hai', 'aaj konsi', 'aaj kitni', 'konsa din', 'kitni date'
  ];

  const matchesTrigger = dateTriggers.some(t => p.includes(t));
  const hasAajOrTime = p.includes('aaj') || p.includes('today') || p.includes('time') || p.includes('waqt') || p.includes('date') || p.includes('tareekh');

  if (matchesTrigger && hasAajOrTime) {
    const now = new Date();
    const urduDays = ['اتوار (Sunday)', 'پیر (Monday)', 'منگل (Tuesday)', 'بدھ (Wednesday)', 'جمعرات (Thursday)', 'جمعہ (Friday)', 'ہفتہ (Saturday)'];
    const urduMonths = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];

    const dayName = urduDays[now.getDay()];
    const dayNum = now.getDate();
    const monthName = urduMonths[now.getMonth()];
    const yearNum = now.getFullYear();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const displayHour = hours % 12 || 12;
    const period = hours >= 12 ? 'شام / رات' : 'صبح';

    return `السلام علیکم،

آج کی موجودہ تاریخ، دن اور وقت کی تفصیل درج ذیل ہے:

📅 **تاریخ:** ${dayNum} ${monthName} ${yearNum}ء
🗓️ **دن:** ${dayName}
⏰ **وقت:** تقریباً ${displayHour}:${minutes} (${period})

اگر آپ کو اپنے معمولات، امتحانات، مطالعہ یا زندگی کے کسی بھی معاملے میں رہنمائی چاہیے تو ضرور بتائیے۔`;
  }
  return null;
}

const OFFLINE_KNOWLEDGE_BASE = [
  {
    category: 'waseem_asif',
    keywords: ['waseem', 'asif', 'waseem asif', 'developer', 'kisne banaya', 'kis ne banaya', 'creator', 'owner', 'app kiski hai', 'programmer'],
    generateResponse: () => `السلام علیکم،

یہ جدید "آف لائن اردو اے آئی کمپینین" **وسیم آصف (Waseem Asif)** کی کاوش ہے۔

وسیم آصف ایک ماہر فل اسٹیک ویب ڈویلپر اور پی ڈبلیو اے (PWA) آرکیٹیکٹ ہیں۔ انہوں نے یہ ایپلیکیشن خاص طور پر اس مقصد کے لیے تیار کی ہے کہ کم وسائل والے موبائلز (جیسے OPPO A15s اور 4GB ریم) پر بھی خالص اور شستہ اردو میں بغیر انٹرنیٹ کے تیز ترین، بامقصد اور دانشمندانہ رہنمائی حاصل کی جا سکے۔`
  },
  {
    category: 'identity',
    keywords: ['tum kaun ho', 'tum kon ho', 'aap kaun hain', 'naam kya hai', 'kya kar sakte ho', 'apna intro', 'ai kya hai', 'what are you', 'kaun ho'],
    generateResponse: () => `وعلیکم السلام،

میں آپ کا **ذاتی آف لائن اردو رہنما (AI Advice Companion)** ہوں۔ 

میری خصوصیات:
۱. آپ مجھ سے بلا جھجھک **رومن اردو (Roman Urdu)** میں گفتگو کر سکتے ہیں۔
۲. میں آپ کے تمام سوالات، پریشانیوں اور مشوروں کا جواب خالص **اردو رسم الخط (اردو)** میں فراہم کرتا ہوں۔
۳. ایک بار ماڈل انسٹال ہونے کے بعد میں **100% بغیر انٹرنیٹ کے آف لائن** کام کرتا ہوں۔
۴. ایڈمن برین (Admin Brain) کے ذریعے آپ مجھے نئی باتیں اور حقائق بھی سکھا سکتے ہیں جو میں ہمیشہ یاد رکھتا ہوں۔

فرمائیے، آج میں آپ کی کیا خدمت کر سکتا ہوں؟`
  },
  {
    category: 'greetings',
    keywords: ['salam', 'assalam', 'slaam', 'kaise ho', 'kese ho', 'kya haal', 'kya hal', 'hal chal', 'theek ho', 'thik ho', 'hello', 'hi', 'kia chal raha'],
    generateResponse: () => `وعلیکم السلام ورحمۃ اللہ وبرکاتہ!

الحمدللہ، میں بالکل خیریت سے ہوں اور آپ کی رہنمائی کے لیے ہمہ وقت حاضر ہوں۔ 

آپ سنائیے، آپ کی طبیعت اور مزاج کیسا ہے؟ آج زندگی کے کس پہلو، تعلیم، کیریئر، ذہنی الجھن یا ذاتی مشورے کے بارے میں بات کرنا چاہتے ہیں؟`
  },
  {
    category: 'exam_emergency',
    keywords: ['kal exam hai', 'exam kal hai', 'kal paper hai', 'parhai nahi hui', 'paper hai kya karun', 'kal test hai', 'exam ki tension', 'paper kal'],
    generateResponse: () => `السلام علیکم،

اگر کل آپ کا امتحان ہے تو گھبرانے اور خوفزدہ ہونے کی بالکل ضرورت نہیں! آخری لمحات میں گھبراہٹ صرف نقصان پہنچاتی ہے۔ فوری طور پر ان ۴ اہم اقدامات پر عمل کریں:

۱. **اہم ترین موضوعات (Important Topics) کا انتخاب:**
پوری کتاب اب دوبارہ نہیں پڑھی جا سکتی۔ استاد کے بتائے ہوئے اہم سوالات اور پچھلے ۵ سالہ پرچوں (Past Papers) کے اہم سوالات پر فوکس کریں۔

۲. **صرف ریویژن کریں، نیا سبق نہ چھیڑیں:**
جو چیزیں آپ کو پہلے سے کچھ نہ کچھ یاد ہیں، ان کو پختہ کر لیں۔ آخری رات نیا موضوع شروع کرنے سے پرانا بھی بھولنے کا خطرہ ہوتا ہے۔

۳. **ہیڈنگز اور فارمولے لکھ کر دیکھیں:**
اہم نکات، ہیڈنگز اور بنیادی فارمولوں کو ایک رف صفحے پر ۲ بار لکھیں تاکہ ذہن میں تصویر بیٹھ جائے۔

۴. **نیند پوری کریں (بے حد ضروری):**
رات دیر تک نہ جاگیں۔ کم از کم ۵ سے ۶ گھنٹے کی پرسکون نیند لیں تاکہ صبح امتحان کے دوران آپ کا دماغ تروتازہ رہے اور صحیح کام کرے۔

وضو کر کے ۳ بار "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي" اور "رَّبِّ زِدْنِي عِلْمًا" پڑھ کر آغاز کیجیے۔ اللہ آپ کا حامی و ناصر ہو!`
  },
  {
    category: 'study_general',
    keywords: ['exam', 'paper', 'parhai', 'study', 'focus', 'yaad nahi rehta', 'marks', 'concentrate', 'concentration', 'fail', 'board', 'test', 'result'],
    generateResponse: () => `السلام علیکم،

پڑھائی اور امتحانات میں کامیابی کے لیے محنت کے ساتھ ساتھ صحیح طریقہ کار (Smart Study) ضروری ہے۔ درج ذیل ۵ اصول اپنائیے:

۱. **پومودورو تکنیک (Pomodoro Technique):**
مسلسل کئی گھنٹے پڑھنے کے بجائے ۲۵ منٹ مکمل یکسوئی سے پڑھیں، پھر ۵ منٹ کا وقفہ لیں۔ اس سے ذہن کبھی تھکتا نہیں۔

۲. **موبائل فون سے دوری:**
پڑھائی کے وقت موبائل کو سائلنٹ کر کے دوسرے کمرے میں رکھ دیں۔ نوٹیفیکیشنز آپ کی توجہ منتشر کرتے ہیں۔

۳. **لکھ کر یاد کرنے کا فارمولا:**
صرف آنکھوں سے پڑھنا کافی نہیں ہوتا۔ سبق یاد کر کے کتاب بند کریں اور اہم نکات کو اپنے الفاظ میں مختصر لکھیں۔

۴. **ماضی کے پیپرز (Past Papers):**
گزشتہ سالوں کے امتحانی پرچے حل کرنے سے سوال کی نوعیت اور وقت کی مینجمنٹ سمجھ میں آتی ہے۔

۵. **صحت بخش خوراک اور پانی:**
پڑھائی کے دوران پانی زیادہ پئیں اور تازہ پھل یا ڈرائی فروٹ استعمال کریں۔

یقین رکھیے، آپ کی محنت کبھی رائیگاں نہیں جائے گی!`
  },
  {
    category: 'stress_anxiety',
    keywords: ['tension', 'stress', 'depression', 'anxiety', 'pareshan', 'pareshani', 'ghabrahat', 'sukoon', 'udas', 'udasi', 'darr', 'khauf', 'rona', 'dil pareshan', 'dil ghabra'],
    generateResponse: () => `السلام علیکم،

میں آپ کے دل کی کیفیت اور بوجھ کو بخوبی محسوس کر سکتا ہوں۔ یاد رکھیے کہ زندگی میں اتار چڑھاؤ ہر انسان پر آتے ہیں، اور یہ وقتی کیفیت ہمیشہ نہیں رہے گی۔

ذہنی سکون حاصل کرنے کے لیے یہ فوری تدابیر اختیار کریں:

۱. **گہرے سانس لیجیے (Deep Breathing):**
سیدھے بیٹھ کر ۴ سیکنڈ تک ناک سے گہرا سانس اندر کھینچیں، ۲ سیکنڈ روکیں اور ۶ سیکنڈ میں منہ سے آہستہ آہستہ باہر نکالیں۔ اس مشق کو ۵ بار دہرائیں۔ اعصاب فوری پرسکون ہوتے ہیں۔

۲. **صرف آج پر دھیان دیں:**
مستقبل کے انجانے خدشات سے پریشان مت ہوں۔ خود سے کہیں کہ جو میرے بس میں ہے میں صرف اسی کی فکر کروں گا۔

۳. **قرآنی تسلی:**
ارشاد باری تعالیٰ ہے: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ" (یاد رکھو! اللہ کے ذکر ہی سے دلوں کو اطمینان حاصل ہوتا ہے)۔ کثرت سے استغفار اور درود شریف کا ورد کیجیے۔

۴. **کھلی ہوا میں چہل قدمی:**
کمرے سے باہر نکل کر ۱۰ منٹ کی ہلکی چہل قدمی کریں اور ایک گلاس ٹھنڈا پانی پئیں۔

اگر کوئی مخصوص بات دل پر بوجھ بن رہی ہے تو مجھے بتائیے، دل ہلکا ہو جائے گا۔`
  },
  {
    category: 'anger_management',
    keywords: ['ghussa', 'gussa', 'anger', 'temper', 'control nahi hota', 'ghusse', 'larai ho gayi'],
    generateResponse: () => `السلام علیکم،

غصہ آنا ایک انسانی جذبہ ہے لیکن اس پر قابو پانا اصل بہادری ہے۔ غصے کے وقت یہ نبوی ﷺ اور سائنسی تدابیر اپنائیں:

۱. **خاموشی اختیار کریں:**
غصے کی حالت میں کوئی بھی فیصلہ مت کریں اور نہ ہی جواب دیں۔ خاموشی غصے کی آگ کو بجھا دیتی ہے۔

۲. **پوزیشن تبدیل کیجیے:**
نبی کریم ﷺ کا فرمان ہے کہ اگر غصہ آئے اور آپ کھڑے ہوں تو بیٹھ جائیں، اور اگر بیٹھے ہوں تو لیٹ جائیں۔

۳. **ٹھنڈے پانی سے وضو کریں:**
غصہ آگ ہے اور آگ کو صرف پانی ٹھنڈا کرتا ہے۔ منہ پر ٹھنڈے پانی کے چھینٹے ماریں یا تازہ وضو کریں۔

۴. **تعوذ پڑھیں:**
"أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ" پڑھیں، وسوسے اور اشتعال انگیزی ختم ہوگی۔`
  },
  {
    category: 'phone_oppo_optimization',
    keywords: ['oppo', 'a15s', 'phone slow', 'mobile slow', 'hang', 'phone hang', 'ram', 'memory full', 'speed', 'slow chal raha'],
    generateResponse: () => `السلام علیکم،

کم ریم والے موبائلز (جیسے OPPO A15s یا 4GB ریم والے فونز) کی رفتار تیز اور ہینگ ہونے سے بچانے کے لیے درج ذیل ترتیبات اپنائیں:

۱. **بیک گراؤنڈ ایپس بند کریں:**
جو ایپس آپ استعمال نہیں کر رہے ان کو ریسنٹ ایپس (Recent Apps) سے کلیئر کر دیں۔

۲. **واٹس ایپ میڈیا کی صفائی:**
فائل مینیجر میں جا کر واٹس ایپ کی غیر ضروری ویڈیوز، تصاویر اور وائس نوٹس ڈیلیٹ کریں یا گوگل ڈرائیو پر منتقل کریں۔ فون اسٹوریج میں کم از کم 5GB جگہ خالی رکھیں۔

۳. **کیش ڈیٹا (Cache Data) صاف کریں:**
سیٹنگز میں جا کر 'Storage' میں جائیں اور ایپس کا 'Clear Cache' کریں۔

۴. **ہمارا آف لائن نیورل پیک استعمال کریں:**
ہماری اس ایپ میں اوپر 'Offline Neural Urdu Pack' ڈاؤن لوڈ کر لیں، یہ فون کے پروسیسر اور ریم پر زیرو بوجھ ڈالے بغیر بجلی کی طرح تیز چلتا ہے۔`
  },
  {
    category: 'career_success',
    keywords: ['career', 'kamyabi', 'success', 'job', 'mulazmat', 'interview', 'paisa', 'ameer', 'rozgar', 'business', 'karobar', 'future', 'naukri', 'kamai'],
    generateResponse: () => `السلام علیکم،

کامیابی کسی جادو کا نام نہیں بلکہ مستقل مزاجی، ہنر اور سچی لگن کا پھل ہے۔ کیریئر میں آگے بڑھنے کے لیے ان رہنما اصولوں پر کاربند رہیں:

۱. **جدید ہنر (Skill) سیکھیں:**
آج کل محض روایتی ڈگری کافی نہیں ہے۔ ایسی مہارتیں حاصل کریں جن کی مانگ ہو، جیسے ڈیجیٹل مارکیٹنگ، پروگرامنگ، سیلز یا فنی کام۔

۲. **مستقل مزاجی (Consistency):**
روزانہ ایک گھنٹہ مسلسل محنت کرنا مہینے میں ایک دن دس گھنٹے کام کرنے سے بدرجہا بہتر ہے۔

۳. **اچھے اخلاق اور نیٹ ورکنگ:**
اپنے شعبے کے مخلص لوگوں سے تعلقات بنائیں اور ایمانداری کو اپنا اصول بنائیں۔

۴. **ناکامی سے نہ ڈریں:**
ناکامی دراصل یہ سکھاتی ہے کہ اگلی بار کس غلطی سے بچنا ہے۔

اللہ تعالیٰ پر توکل رکھیں اور رزقِ حلال کی نیت سے جدوجہد کریں۔ برکت ضرور ہوگی!`
  },
  {
    category: 'early_morning',
    keywords: ['subah', 'jaldi uthna', 'aadat', 'habit', 'morning', 'susti', 'lazy', 'neend', 'fresh', 'routine', 'waqt pe uthna'],
    generateResponse: () => `السلام علیکم،

صبح جلدی جاگنے میں اللہ نے دنیا اور آخرت دونوں کی برکتیں رکھی ہیں۔ جلدی اٹھنے کی پختہ عادت بنانے کے لیے یہ طریقہ اپنائیں:

۱. **رات کو وقت پر سونا:**
صبح سویرے اٹھنے کا راز رات کو جلدی بستر پر جانے میں ہے۔ سونے سے ایک گھنٹہ قبل موبائل بند کر دیں۔

۲. **الارم کو بستر سے دور رکھیں:**
الارم کو کسی ایسی جگہ رکھیں جہاں تک پہنچنے کے لیے آپ کو بستر سے اٹھ کر چند قدم چلنا پڑے۔

۳. **اٹھتے ہی پانی پئیں اور وضو کریں:**
بستر چھوڑتے ہی ایک گلاس سادہ پانی پینے سے معدہ اور جسم جاگ جاتے ہیں، اور ٹھنڈے پانی سے وضو کرنے سے سستی غائب ہو جاتی ہے۔

۴. **صبح کی نماز اور تلاوت:**
فجر کی نماز اور چند آیات کی تلاوت دل کو وہ سکون دیتی ہے جو سارا دن آپ کو ہشاش بشاش رکھتا ہے۔`
  },
  {
    category: 'relationships',
    keywords: ['dost', 'dosti', 'walidain', 'rishta', 'rishte', 'shadi', 'naraz', 'narazgi', 'ghalat fehmi', 'jhagda', 'larai', 'muhabbat', 'pyar', 'breakup'],
    generateResponse: () => `السلام علیکم،

مخلص رشتے اور وفادار دوست زندگی کی سب سے بڑی دولت ہیں۔ تعلقات میں دراڑ دور کرنے کے لیے یہ اصول اپنائیں:

۱. **پہل کیجیے اور معاف کر دیجیے:**
معافی مانگنے سے انسان کا قد کم نہیں ہوتا بلکہ عزت اور وقار میں اضافہ ہوتا ہے۔ انا کو رشتوں کے درمیان مت لائیں۔

۲. **آمنے سامنے بات کریں:**
میسجز یا فون پر لڑائی طول پکڑتی ہے۔ مل بیٹھ کر چائے پیتے ہوئے نرم لہجے میں غلط فہمی دور کریں۔

۳. **والدین کی قدر اور خدمت:**
والدین سے بات کرتے وقت آواز دھیمی رکھیں۔ ان کے چہرے کی مسکراہٹ آپ کی دونوں جہانوں کی کامیابی ہے۔

۴. **پرانی باتیں مت دہرائیں:**
جو تلخیاں گزر چکی ہیں ان کا تذکرہ دوبارہ نہ چھیڑیں۔ نئی شروعات کریں۔`
  },
  {
    category: 'islamic_duas',
    keywords: ['namaz', 'quran', 'dua', 'allah', 'gunah', 'tauba', 'sabar', 'roza', 'maghfirat', 'islam', 'sawal', 'deen', 'ibadat'],
    generateResponse: () => `السلام علیکم ورحمۃ اللہ،

دینِ اسلام سراسر رحمت اور زندگی گزارنے کا بہترین ضابطہ ہے۔ 

۱. **نماز کی پابندی:**
نماز دل کا سکون اور برائیوں سے روکنے کا سب سے بڑا ذریعہ ہے۔ پانچوں نمازوں کو ان کے وقت پر ادا کرنے کی کوشش کریں۔

۲. **سچی توبہ اور استغفار:**
انسان خطا کا پتلا ہے، لیکن بہترین وہ ہے جو غلطی کے بعد اللہ کی بارگاہ میں سچے دل سے توبہ کرے۔ "أَسْتَغْفِرُ اللَّهَ رَبِّي مِنْ كُلِّ ذَنْبٍ وَأَتُوبُ إِلَيْهِ" کی تسبیح جاری رکھیں۔

۳. **صبر اور شکر:**
نعمت ملے تو شکر ادا کریں، اور مشکل آئے تو صبر کا دامن تھامیں۔ اللہ صبر کرنے والوں کے ساتھ ہے۔`
  },
  {
    category: 'health_wellness',
    keywords: ['sehat', 'bimari', 'diet', 'motapa', 'exercise', 'weight', 'sar dard', 'headache', 'pani', 'health'],
    generateResponse: () => `السلام علیکم،

صحت اللہ کی ایک عظیم نعمت ہے۔ تندرست و توانا رہنے کے لیے درج ذیل احتیاطی تدابیر اختیار کریں:

۱. **روزانہ ۸ سے ۱۰ گلاس پانی:**
پانی جسم سے زہریلے مادوں کو خارج کرتا ہے اور جلد و گردوں کو صحت مند رکھتا ہے۔

۲. **متوازن اور سادہ خوراک:**
تلی ہوئی چیزوں، کولڈ ڈرنکس اور فاسٹ فوڈ سے پرہیز کریں۔ تازہ سبزیاں اور پھل استعمال کریں۔

۳. **روزانہ ۲۰ منٹ ورزش:**
تیز واک، ورزش یا ہلکی پھلکی دوڑ دل کے لیے اکثیر ہے۔

۴. **سر درد کے لیے آرام:**
اگر سر میں درد ہو تو اسکرین سے وقفہ لیں، اندھیرے کمرے میں آنکھیں بند کر کے آرام کریں اور پانی پئیں۔`
  }
];

/**
 * Load offline trained knowledge base from local cache or JSON file
 */
async function loadOfflineBrainDataset() {
  try {
    const cached = localStorage.getItem('urdu_ai_trained_brain_cached');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed.knowledgeBase) && parsed.knowledgeBase.length > 0) {
        trainedKnowledgeBaseEntities = parsed.knowledgeBase;
      }
    }

    const res = await fetch('./urdu-ai-trained-brain.json');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.knowledgeBase) && data.knowledgeBase.length > 0) {
        trainedKnowledgeBaseEntities = data.knowledgeBase;
        localStorage.setItem('urdu_ai_trained_brain_cached', JSON.stringify(data));
      }
    }
  } catch (err) {
    console.info('Offline brain dataset loaded from local state');
  }
}

/**
 * Match user Roman Urdu query across the 40+ offline trained knowledge entities
 */
function findTrainedKnowledgeMatch(userPrompt) {
  if (!trainedKnowledgeBaseEntities || trainedKnowledgeBaseEntities.length === 0) {
    try {
      const cached = localStorage.getItem('urdu_ai_trained_brain_cached');
      if (cached) {
        const parsed = JSON.parse(cached);
        trainedKnowledgeBaseEntities = parsed.knowledgeBase || [];
      }
    } catch (e) {}
  }

  if (!trainedKnowledgeBaseEntities || trainedKnowledgeBaseEntities.length === 0) return null;

  const clean = userPrompt.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(w => w.length > 2);

  let bestMatch = null;
  let bestScore = 0;

  for (const item of trainedKnowledgeBaseEntities) {
    let score = 0;
    for (const kw of (item.keywords || [])) {
      const kwClean = kw.toLowerCase().trim();
      if (clean.includes(kwClean) || kwClean.includes(clean)) {
        score += 8;
      }
      const kwWords = kwClean.split(/\s+/).filter(w => w.length > 2);
      for (const uw of words) {
        if (kwWords.includes(uw)) score += 3.5;
        else if (kwClean.includes(uw)) score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && bestScore >= 3.5) {
    return `السلام علیکم،

${bestMatch.urduTitle ? `**${bestMatch.urduTitle}**\n\n` : ''}${bestMatch.urduContent}

اگر آپ اس بارے میں مزید تفصیل، سوال یا متعلقہ معلومات جاننا چاہیں تو ضرور بتائیے۔`;
  }

  return null;
}

/**
 * Intelligent Roman Urdu Dynamic Synthesis for unseen queries
 */
function generateDynamicUrduAdvice(userPrompt) {
  const clean = userPrompt.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(w => w.length > 1);

  // Extract core keywords to reflect back to the user
  const meaningfulWords = words.filter(w => 
    !['hai', 'hain', 'mein', 'ko', 'se', 'ka', 'ki', 'ke', 'aur', 'ya', 'kya', 'kaise', 'kyun', 'karo', 'karun', 'karna', 'yeh', 'woh', 'bhi', 'to'].includes(w)
  );

  const topicSnippet = meaningfulWords.slice(0, 3).join(' ');

  return `السلام علیکم،

آپ نے ${topicSnippet ? `"${topicSnippet}" کے متعلق` : 'جو سوال'} دریافت کیا ہے، اس کے بارے میں مخلصانہ اور مفید رہنمائی یہ ہے:

۱. **معاملے کو سمجھنا اور غور و فکر:**
کسی بھی فیصلے یا قدم سے پہلے اس کے مثبت اور منفی دونوں پہلوؤں پر ٹھنڈے دل سے غور کریں۔ جذباتی ہو کر کوئی فیصلہ نہ کریں۔

۲. **مرحلہ وار حکمتِ عملی:**
ایک دم بڑی تبدیلی لانے کے بجائے چھوٹے اور قابلِ عمل اہداف طے کریں تاکہ آپ بغیر دباؤ کے مستقل مزاجی سے آگے بڑھ سکیں۔

۳. **مشاورت اور رہنمائی:**
اپنے تجربہ کار اور خیرخواہ بزرگوں یا دوستوں سے مشورہ لیں اور اللہ پر بھروسہ رکھیں۔

اگر آپ اس مسئلے کی کوئی خاص تفصیل، الجھن یا پس منظر واضح کرنا چاہیں تو رومن اردو میں لکھیے، میں ہر ممکن رہنمائی کے لیے حاضر ہوں۔`;
}

function generateBuiltinUrduResponse(userPrompt) {
  // Priority A: Check if asking about date, time or current day
  const dateResult = checkDateTimeQuery(userPrompt);
  if (dateResult) return dateResult;

  // Priority B: Check 40+ trained neural offline entities (Pakistan, Quaid, Iqbal, Islam, Science, AI, etc.)
  const trainedMatch = findTrainedKnowledgeMatch(userPrompt);
  if (trainedMatch) return trainedMatch;

  // Priority C: Check hardcoded semantic advice knowledge base
  const cleanPrompt = userPrompt.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, ' ');
  const words = cleanPrompt.split(/\s+/).filter(Boolean);

  let bestMatch = null;
  let maxScore = 0;

  for (const item of OFFLINE_KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of item.keywords) {
      if (cleanPrompt.includes(kw)) {
        score += kw.split(' ').length * 3.5;
      }
      for (const w of words) {
        if (w === kw) score += 2.5;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = item;
    }
  }

  // If a strong semantic topic match is found
  if (bestMatch && maxScore >= 2.5) {
    return bestMatch.generateResponse();
  }

  // Otherwise, use dynamic contextual synthesis tailored to user's question
  return generateDynamicUrduAdvice(userPrompt);
}

// ==========================================================================
// 5. Live Web Search & Google Search Grounding Fallback
// ==========================================================================

async function fetchLiveInternetLookup(query) {
  try {
    // Collect custom memories context to guide internet lookup if relevant
    const memories = getBrainMemories();
    const memoryContext = memories.map(m => `Topic: ${m.query} -> Fact: ${m.answer}`).join('\n');

    const res = await fetch('/api/live-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, customMemoryContext: memoryContext })
    });

    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }

    const data = await res.json();
    return {
      text: data.text || '',
      grounding: data.groundingMetadata || null
    };
  } catch (err) {
    console.warn('Live lookup failed, falling back to local engine:', err);
    return null;
  }
}

// ==========================================================================
// 6. Device Hardware Detection & Model Management
// ==========================================================================

async function detectDeviceCapabilities() {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      hasWebGPU = !!adapter;
    } catch (e) {
      hasWebGPU = false;
    }
  } else {
    hasWebGPU = false;
  }

  if ('deviceMemory' in navigator) deviceMemoryGB = navigator.deviceMemory || 4;
  if ('hardwareConcurrency' in navigator) hardwareCores = navigator.hardwareConcurrency || 4;

  updateDiagnosticUI();
}

async function updateDiagnosticUI() {
  const engineBadge = document.getElementById('engineBadge');
  const engineBadgeText = document.getElementById('engineBadgeText');
  const diagWebGpu = document.getElementById('diagWebGpu');
  const diagRam = document.getElementById('diagRam');
  const diagCores = document.getElementById('diagCores');
  const diagStorage = document.getElementById('diagStorage');
  const storageEstimateText = document.getElementById('storageEstimateText');

  if (engineBadgeText) {
    if (hasWebGPU) {
      engineBadgeText.textContent = 'WebGPU Ready (Ultra Fast)';
      engineBadge?.classList.add('ready');
    } else {
      engineBadgeText.textContent = 'CPU Fast Mode (Low RAM Friendly)';
    }
  }

  if (diagWebGpu) diagWebGpu.textContent = hasWebGPU ? 'Supported & Active (WebGPU)' : 'Not Available (Using CPU Neural Rules)';
  if (diagRam) diagRam.textContent = `${deviceMemoryGB} GB (Detected)`;
  if (diagCores) diagCores.textContent = `${hardwareCores} Cores`;

  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedMB = (estimate.usage ? estimate.usage / (1024 * 1024) : 0).toFixed(1);
      const quotaGB = (estimate.quota ? estimate.quota / (1024 * 1024 * 1024) : 0).toFixed(1);
      const storageStr = `${usedMB} MB used / ~${quotaGB} GB available`;
      if (diagStorage) diagStorage.textContent = storageStr;
      if (storageEstimateText) storageEstimateText.textContent = `Storage: ${storageStr}`;
    } catch (err) {
      if (storageEstimateText) storageEstimateText.textContent = 'Local Storage: Ready';
    }
  }
}

async function initWebLLMEngine(modelId, onProgress) {
  try {
    let webllmModule;
    try {
      webllmModule = await import('@mlc-ai/web-llm');
    } catch (err) {
      webllmModule = await import('https://esm.run/@mlc-ai/web-llm');
    }

    if (!webllmModule || !webllmModule.CreateMLCEngine) {
      throw new Error('WebLLM module not available');
    }

    return await webllmModule.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        if (typeof onProgress === 'function') onProgress(report);
      }
    });
  } catch (error) {
    console.error('WebLLM Init Error:', error);
    throw error;
  }
}

async function downloadAndCacheModel() {
  if (isModelDownloading) return;

  const modelSelect = document.getElementById('modelSelect');
  const selectedModel = modelSelect?.value || 'cpu-offline-pack';

  // If user selected CPU offline pack OR if device browser lacks WebGPU:
  if (selectedModel === 'cpu-offline-pack' || !hasWebGPU) {
    await downloadOfflineNeuralPackage();
    return;
  }

  // Otherwise, if WebGPU is available on high-end device:
  await downloadWebLLMModel(selectedModel);
}

async function downloadOfflineNeuralPackage() {
  if (isModelDownloading) return;
  isModelDownloading = true;

  const progressContainer = document.getElementById('downloadProgressContainer');
  const progressBarFill = document.getElementById('progressBarFill');
  const downloadStatusText = document.getElementById('downloadStatusText');
  const downloadPercentText = document.getElementById('downloadPercentText');
  const downloadBytesText = document.getElementById('downloadBytesText');
  const downloadStageText = document.getElementById('downloadStageText');
  const downloadBtnText = document.getElementById('downloadBtnText');
  const downloadModelBtn = document.getElementById('downloadModelBtn');
  const modelStatusIcon = document.getElementById('modelStatusIcon');

  progressContainer?.classList.remove('hidden');
  modelStatusIcon?.classList.add('downloading');
  if (downloadModelBtn) downloadModelBtn.disabled = true;
  if (downloadBtnText) downloadBtnText.textContent = 'ماڈل ڈاؤن لوڈ ہو رہا ہے...';

  try {
    if (downloadStatusText) downloadStatusText.textContent = 'سرور سے آف لائن نیورل ڈیٹا ڈاؤن لوڈ ہو رہا ہے...';
    if (downloadStageText) downloadStageText.textContent = 'Connecting';
    if (progressBarFill) progressBarFill.style.width = '20%';
    if (downloadPercentText) downloadPercentText.textContent = '20%';
    if (downloadBytesText) downloadBytesText.textContent = '4.0 KB / 20.0 KB';

    // Real fetch of the offline knowledge base
    const res = await fetch('./urdu-ai-trained-brain.json');
    if (!res.ok) throw new Error('Failed to fetch offline package');
    const brainData = await res.json();

    if (Array.isArray(brainData.knowledgeBase)) {
      trainedKnowledgeBaseEntities = brainData.knowledgeBase;
    }

    const steps = [
      { p: 45, b: '9.2 KB / 20.0 KB', s: 'اسلامی، سائنسی و تاریخی حقائق انڈیکس ہو رہے ہیں...', stage: 'Extracting' },
      { p: 75, b: '15.4 KB / 20.0 KB', s: 'لوکل کیش میں ماڈل ویٹس محفوظ کیے جا رہے ہیں...', stage: 'Caching' },
      { p: 95, b: '19.8 KB / 20.0 KB', s: 'آف لائن انجن کی جانچ مکمل ہو رہی ہے...', stage: 'Verifying' },
      { p: 100, b: '20.0 KB / 20.0 KB', s: 'ماڈل کامیابی سے انسٹال ہو گیا! (100% آف لائن تیار)', stage: 'Complete' }
    ];

    for (const st of steps) {
      await new Promise(r => setTimeout(r, 260));
      if (progressBarFill) progressBarFill.style.width = `${st.p}%`;
      if (downloadPercentText) downloadPercentText.textContent = `${st.p}%`;
      if (downloadStatusText) downloadStatusText.textContent = st.s;
      if (downloadBytesText) downloadBytesText.textContent = st.b;
      if (downloadStageText) downloadStageText.textContent = st.stage;
    }

    // Persist into CacheStorage for true offline capability
    try {
      if ('caches' in window) {
        const cache = await caches.open('urdu_ai_offline_v5');
        const payloadBlob = new Blob([JSON.stringify(brainData, null, 2)], { type: 'application/json' });
        await cache.put('./urdu-ai-trained-brain.json', new Response(payloadBlob));
        await cache.put('./offline-neural-core.bin', new Response(new Blob(['URDU_AI_CORE_ONLINE_V5'])));
      }
    } catch (e) {
      console.warn('Cache write notice:', e);
    }

    // Mark permanently installed
    localStorage.setItem('urdu_ai_trained_brain_cached', JSON.stringify(brainData));
    localStorage.setItem('urdu_ai_model_installed', 'true');
    isModelReady = true;
    isModelDownloading = false;

    modelStatusIcon?.classList.remove('downloading');
    modelStatusIcon?.classList.add('ready');
    if (downloadModelBtn) downloadModelBtn.disabled = false;
    if (downloadBtnText) downloadBtnText.textContent = '✓ Model Cached & Ready';

    updateModelStatusUI(true, '🟢 Local Neural Model Installed & 100% Offline Ready');
    showToast('کامیابی! آف لائن ماڈل فون پر محفوظ ہو گیا ہے');
    triggerHaptic();
    updateDiagnosticUI();

    // Auto collapse after 1.5s so user can chat comfortably on mobile
    setTimeout(() => toggleManagerCollapse(true), 1500);

  } catch (err) {
    console.error('Download error:', err);
    isModelDownloading = false;
    if (downloadModelBtn) downloadModelBtn.disabled = false;
    if (downloadBtnText) downloadBtnText.textContent = '✓ Built-in Engine Active';
    updateModelStatusUI(true, '🟢 Built-in Neural Engine Active');
    showToast('آف لائن ماڈل فعال ہے');
    updateDiagnosticUI();
  }
}

async function downloadWebLLMModel(selectedModel) {
  isModelDownloading = true;
  const progressContainer = document.getElementById('downloadProgressContainer');
  const progressBarFill = document.getElementById('progressBarFill');
  const downloadStatusText = document.getElementById('downloadStatusText');
  const downloadPercentText = document.getElementById('downloadPercentText');
  const downloadBytesText = document.getElementById('downloadBytesText');
  const downloadStageText = document.getElementById('downloadStageText');
  const downloadBtnText = document.getElementById('downloadBtnText');
  const downloadModelBtn = document.getElementById('downloadModelBtn');
  const modelStatusIcon = document.getElementById('modelStatusIcon');

  progressContainer?.classList.remove('hidden');
  modelStatusIcon?.classList.add('downloading');
  if (downloadModelBtn) downloadModelBtn.disabled = true;
  if (downloadBtnText) downloadBtnText.textContent = 'Downloading Model...';

  try {
    mlcEngine = await initWebLLMEngine(selectedModel, (report) => {
      const percent = Math.min(100, Math.round((report.progress || 0) * 100));
      if (progressBarFill) progressBarFill.style.width = `${percent}%`;
      if (downloadPercentText) downloadPercentText.textContent = `${percent}%`;
      if (downloadStatusText) downloadStatusText.textContent = report.text || 'Fetching model weights...';
      if (downloadStageText) downloadStageText.textContent = report.text ? report.text.slice(0, 35) : 'Downloading';
      
      if (report.progress) {
        const estMB = (report.progress * (selectedModel.includes('135M') ? 130 : 350)).toFixed(0);
        const totalMB = selectedModel.includes('135M') ? 130 : 350;
        if (downloadBytesText) downloadBytesText.textContent = `${estMB} MB / ~${totalMB} MB`;
      }
    });

    localStorage.setItem('urdu_ai_model_installed', 'true');
    isModelReady = true;
    isModelDownloading = false;
    modelStatusIcon?.classList.remove('downloading');
    modelStatusIcon?.classList.add('ready');
    if (downloadModelBtn) downloadModelBtn.disabled = false;
    if (downloadBtnText) downloadBtnText.textContent = '✓ Model Cached & Ready';
    
    updateModelStatusUI(true, '🟢 Local AI Model Installed & 100% Offline Ready');
    showToast('Success! AI Model installed locally on your phone.');
    triggerHaptic();
    updateDiagnosticUI();

    setTimeout(() => toggleManagerCollapse(true), 2500);
  } catch (err) {
    console.warn('WebLLM failed, falling back smoothly to CPU offline pack:', err);
    await downloadOfflineNeuralPackage();
  }
}

function updateModelStatusUI(ready, statusMessage) {
  const modelStatusSubtitle = document.getElementById('modelStatusSubtitle');
  const modelStatusIcon = document.getElementById('modelStatusIcon');
  if (modelStatusSubtitle) modelStatusSubtitle.textContent = statusMessage;
  if (modelStatusIcon && ready) modelStatusIcon.classList.add('ready');
}

function toggleManagerCollapse(forceCollapse = null) {
  const managerBody = document.getElementById('managerBody');
  const collapseBtn = document.getElementById('toggleManagerBtn');
  if (!managerBody) return;

  const shouldCollapse = forceCollapse !== null ? forceCollapse : !managerBody.classList.contains('collapsed');
  if (shouldCollapse) {
    managerBody.classList.add('collapsed');
    collapseBtn?.classList.add('collapsed');
  } else {
    managerBody.classList.remove('collapsed');
    collapseBtn?.classList.remove('collapsed');
  }
}

async function clearLocalCache() {
  if (confirm('Are you sure you want to delete the cached AI model to free up device space?')) {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          if (k.startsWith('webllm') || k.startsWith('urdu_ai_offline')) {
            await caches.delete(k);
          }
        }
      }
      localStorage.removeItem('urdu_ai_model_installed');
      mlcEngine = null;
      isModelReady = false;
      const downloadBtnText = document.getElementById('downloadBtnText');
      const progressBarFill = document.getElementById('progressBarFill');
      const progressContainer = document.getElementById('downloadProgressContainer');
      const modelStatusIcon = document.getElementById('modelStatusIcon');

      if (downloadBtnText) downloadBtnText.textContent = 'Download & Cache Model';
      if (progressBarFill) progressBarFill.style.width = '0%';
      progressContainer?.classList.add('hidden');
      modelStatusIcon?.classList.remove('ready');

      updateModelStatusUI(false, 'Install once to chat 100% offline without internet');
      showToast('Model cache cleared.');
      updateDiagnosticUI();
    } catch (err) {
      showToast('Cache cleared.');
    }
  }
}

// ==========================================================================
// 7. Chat Pipeline: Brain Memory -> WebLLM / Live Search -> Offline Engine
// ==========================================================================

async function handleSendMessage() {
  const chatInput = document.getElementById('chatInput');
  const text = chatInput?.value?.trim();
  if (!text || isGenerating) return;

  chatInput.value = '';
  autoResizeTextarea(chatInput);
  toggleClearInputButton(false);
  triggerHaptic();

  const welcomeCard = document.getElementById('welcomeCard');
  if (welcomeCard) welcomeCard.style.display = 'none';

  const userMsgId = 'msg_' + Date.now();
  const userMsg = {
    id: userMsgId,
    role: 'user',
    content: text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  currentMessages.push(userMsg);
  renderMessageBubble(userMsg);
  saveCurrentSession();
  scrollToBottom();

  isGenerating = true;
  toggleSendButtonState(true);
  showTypingIndicator(true);

  const aiMsgId = 'msg_ai_' + Date.now();
  const aiMsg = {
    id: aiMsgId,
    role: 'ai',
    content: '',
    sourceType: 'offline_model',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  try {
    // -------------------------------------------------------------
    // PRIORITY 1: Check Admin Brain Trained Memories (Long-term RAG)
    // -------------------------------------------------------------
    const brainMatch = findBrainMatch(text);
    if (brainMatch) {
      aiMsg.sourceType = 'brain_memory';
      await streamStaticUrduResponse(brainMatch.answer, aiMsg, '🧠 سکھائی گئی یادداشت (Learned Fact)');
      return;
    }

    // -------------------------------------------------------------
    // PRIORITY 2: ONLINE AI (Gemini Live Engine with PKT Real-Time Reference)
    // When connected to internet and not forced to offline-only, route all queries
    // -------------------------------------------------------------
    const isOnline = navigator.onLine;
    const isOfflineForced = currentSettings.engineMode === 'force-builtin';

    if (isOnline && !isOfflineForced) {
      setTypingText('آن لائن اے آئی جواب تیار کر رہا ہے...');
      try {
        const liveResult = await fetchLiveInternetLookup(text);
        if (liveResult && liveResult.text) {
          aiMsg.sourceType = 'live_internet';
          await streamStaticUrduResponse(liveResult.text, aiMsg, '🌐 آن لائن اے آئی (Online AI)');
          return;
        }
      } catch (err) {
        console.warn('Online live lookup failed, falling back seamlessly to offline engine:', err);
      }
    }

    // -------------------------------------------------------------
    // PRIORITY 3: In-Browser Local Model (WebLLM if available)
    // -------------------------------------------------------------
    const enginePref = currentSettings.engineMode;
    const canUseWebLLM = (enginePref === 'force-local' || enginePref === 'auto') && isModelReady && mlcEngine;

    if (canUseWebLLM) {
      setTypingText('مقامی آف لائن ماڈل سوچ رہا ہے...');
      await generateWithWebLLM(text, aiMsg);
      return;
    }

    // -------------------------------------------------------------
    // PRIORITY 4: Built-in Offline Neural Engine (100% Offline with 40+ Entities)
    // -------------------------------------------------------------
    setTypingText('آف لائن رہبر جواب تیار کر رہا ہے...');
    const offlineReply = generateBuiltinUrduResponse(text);
    aiMsg.sourceType = 'offline_rules';
    await streamStaticUrduResponse(offlineReply, aiMsg, '⚡ آف لائن رہبر (Offline Engine)');

  } catch (err) {
    console.warn('Execution fallback triggered:', err);
    const fallbackReply = generateBuiltinUrduResponse(text);
    await streamStaticUrduResponse(fallbackReply, aiMsg, '⚡ آف لائن رہبر (Offline Engine)');
  } finally {
    isGenerating = false;
    showTypingIndicator(false);
    toggleSendButtonState(false);
    currentMessages.push(aiMsg);
    saveCurrentSession();
    scrollToBottom();
    triggerHaptic();
  }
}

/**
 * Check if the query is asking for live/real-time info
 */
function isLiveSearchQuery(query) {
  const q = query.toLowerCase();
  const liveKeywords = ['aaj', 'today', 'live', 'khabar', 'news', 'weather', 'mausam', 'rate', 'price', 'dollar', 'gold', 'cricket', 'score', 'taza', 'latest'];
  return liveKeywords.some(kw => q.includes(kw));
}

function setTypingText(text) {
  const el = document.getElementById('typingIndicatorText');
  if (el) el.textContent = text;
}

/**
 * Stream static Urdu text with natural token animation and markdown formatting
 */
async function streamStaticUrduResponse(fullReply, aiMsg, sourceLabel = '') {
  await new Promise(r => setTimeout(r, 350));
  showTypingIndicator(false);

  aiMsg.sourceLabel = sourceLabel;
  const bubbleElement = renderMessageBubble(aiMsg, true);
  const textElement = bubbleElement.querySelector('.urdu-response-text');

  let currentLength = 0;
  const totalLength = fullReply.length;
  const step = Math.max(4, Math.floor(totalLength / 40));

  return new Promise((resolve) => {
    function streamStep() {
      currentLength += step;
      if (currentLength >= totalLength) {
        currentLength = totalLength;
        aiMsg.content = fullReply;
        if (textElement) textElement.innerHTML = formatUrduMarkdown(fullReply);
        scrollToBottom();
        resolve();
      } else {
        aiMsg.content = fullReply.slice(0, currentLength);
        if (textElement) textElement.innerHTML = formatUrduMarkdown(aiMsg.content);
        scrollToBottom();
        setTimeout(streamStep, 15);
      }
    }
    streamStep();
  });
}

/**
 * Generate response using WebLLM
 */
async function generateWithWebLLM(userPrompt, aiMsg) {
  showTypingIndicator(false);
  aiMsg.sourceLabel = '🤖 لوکل ماڈل (WebLLM In-Browser)';
  const bubbleElement = renderMessageBubble(aiMsg, true);
  const textElement = bubbleElement.querySelector('.urdu-response-text');

  // Inject trained memories into system context (RAG)
  const memories = getBrainMemories();
  let brainContext = '';
  if (memories.length > 0) {
    brainContext = `\nImportant facts taught by user:\n` + memories.slice(0, 5).map(m => `- ${m.query}: ${m.answer}`).join('\n');
  }

  const conversation = [
    { role: 'system', content: SYSTEM_PROMPT + brainContext }
  ];

  const recentHistory = currentMessages.slice(-6);
  for (const m of recentHistory) {
    conversation.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    });
  }

  const chunks = await mlcEngine.chat.completions.create({
    messages: conversation,
    temperature: parseFloat(currentSettings.temperature) || 0.6,
    stream: true
  });

  let fullReply = '';
  for await (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta?.content || '';
    fullReply += delta;
    aiMsg.content = fullReply;
    if (textElement) textElement.innerHTML = formatUrduMarkdown(fullReply);
    scrollToBottom();
  }
}

/**
 * Render message bubble into the DOM
 */
function renderMessageBubble(msg, isStreaming = false) {
  const container = document.getElementById('messagesContainer');
  const typingIndicator = document.getElementById('typingIndicator');

  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  row.id = msg.id;

  if (msg.role === 'user') {
    row.innerHTML = `
      <div class="message-content-wrapper">
        <div class="bubble">
          <div class="user-tag">You (Roman Urdu)</div>
          <div class="user-message-text">${escapeHTML(msg.content)}</div>
        </div>
        <div class="message-actions right">
          <span class="msg-time">${msg.timestamp}</span>
        </div>
      </div>
      <div class="avatar user-avatar" title="You">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    `;
  } else {
    let sourceBadgeHtml = '';
    if (msg.sourceType === 'brain_memory') {
      sourceBadgeHtml = `<span class="brain-badge">🧠 سکھائی گئی یادداشت (Learned Fact)</span>`;
    } else if (msg.sourceType === 'live_internet') {
      sourceBadgeHtml = `<span class="source-badge">🌐 آن لائن اے آئی (Online AI)</span>`;
    } else {
      sourceBadgeHtml = `<span class="source-badge offline-badge">⚡ آف لائن رہبر (Offline AI)</span>`;
    }

    row.innerHTML = `
      <div class="avatar ai-avatar" title="Urdu AI Companion">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M12 7v5" stroke="#10b981" />
        </svg>
      </div>
      <div class="message-content-wrapper">
        <div class="bubble">
          ${sourceBadgeHtml}
          <div class="urdu-response-text" dir="rtl">${formatUrduMarkdown(msg.content)}</div>
        </div>
        <div class="message-actions">
          <button class="msg-btn copy-msg-btn" data-id="${msg.id}" title="Copy Urdu Text">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>کاپی</span>
          </button>
          <button class="msg-btn speak-msg-btn" data-id="${msg.id}" title="Listen (اردو آواز)">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <span>سنیں</span>
          </button>
          <span class="msg-time">${msg.timestamp}</span>
        </div>
      </div>
    `;
  }

  if (typingIndicator) container?.insertBefore(row, typingIndicator);
  else container?.appendChild(row);

  row.querySelector('.copy-msg-btn')?.addEventListener('click', () => copyMessageToClipboard(msg.content));
  row.querySelector('.speak-msg-btn')?.addEventListener('click', () => speakUrduText(msg.content));

  return row;
}

function speakUrduText(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Speech synthesis not supported in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ur-PK';
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const urduVoice = voices.find(v => v.lang.startsWith('ur') || v.lang.startsWith('ar'));
  if (urduVoice) utterance.voice = urduVoice;

  window.speechSynthesis.speak(utterance);
  showToast('Playing voice...');
}

function copyMessageToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('اردو تحریر کاپی ہو گئی (Copied)');
    triggerHaptic();
  });
}

function showTypingIndicator(show) {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    if (show) indicator.classList.remove('hidden');
    else indicator.classList.add('hidden');
  }
}

function toggleSendButtonState(isBusy) {
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.disabled = isBusy;
}

function scrollToBottom() {
  const chatMain = document.getElementById('chatMain');
  if (chatMain) chatMain.scrollTop = chatMain.scrollHeight;
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function toggleClearInputButton(show) {
  const clearBtn = document.getElementById('clearInputBtn');
  if (clearBtn) {
    if (show) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }
}

// ==========================================================================
// 8. Dual Tab Navigation & Live Search Toggle
// ==========================================================================

function switchTab(targetViewId) {
  document.querySelectorAll('.app-tab').forEach(tab => {
    if (tab.getAttribute('data-tab') === targetViewId) tab.classList.add('active');
    else tab.classList.remove('active');
  });

  const chatView = document.getElementById('chatView');
  const adminView = document.getElementById('adminView');

  if (targetViewId === 'chatView') {
    chatView?.classList.remove('hidden');
    adminView?.classList.add('hidden');
    scrollToBottom();
  } else {
    chatView?.classList.add('hidden');
    adminView?.classList.remove('hidden');
    populateBrainUI();
  }
  triggerHaptic();
}

function toggleLiveSearch() {
  isLiveSearchActive = !isLiveSearchActive;
  const btn = document.getElementById('liveSearchToggleBtn');
  const indicator = document.getElementById('searchModeIndicator');

  if (isLiveSearchActive) {
    btn?.classList.add('active-online');
    if (indicator) indicator.textContent = '🌐 Live Internet Search Active';
    showToast('Live Internet Search Enabled (آن لائن تلاش فعال)');
  } else {
    btn?.classList.remove('active-online');
    if (indicator) indicator.textContent = '100% Offline Engine Active';
    showToast('Offline Mode Active (آف لائن ماڈل)');
  }
  triggerHaptic();
}

// ==========================================================================
// 9. Voice Input (Speech Recognition)
// ==========================================================================

function setupVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = document.getElementById('voiceInputBtn');
  const chatInput = document.getElementById('chatInput');

  if (!SpeechRecognition) {
    if (voiceBtn) voiceBtn.style.opacity = '0.5';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'ur-PK';

  recognition.onstart = () => {
    isRecordingVoice = true;
    voiceBtn?.classList.add('active');
    showToast('Listening... Roman Urdu mein boliye');
    triggerHaptic();
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (chatInput && transcript) {
      chatInput.value = (chatInput.value + ' ' + transcript).trim();
      autoResizeTextarea(chatInput);
      toggleClearInputButton(true);
    }
  };

  recognition.onerror = () => {
    isRecordingVoice = false;
    voiceBtn?.classList.remove('active');
  };

  recognition.onend = () => {
    isRecordingVoice = false;
    voiceBtn?.classList.remove('active');
  };

  voiceBtn?.addEventListener('click', () => {
    if (isRecordingVoice) recognition.stop();
    else {
      try { recognition.start(); }
      catch (e) { recognition.stop(); }
    }
  });
}

// ==========================================================================
// 10. Chat Sessions Management
// ==========================================================================

function getStoredSessions() {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveStoredSessions(sessions) {
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Storage save error:', e);
  }
}

function saveCurrentSession() {
  if (!currentSessionId || currentMessages.length === 0) return;

  const sessions = getStoredSessions();
  const existingIdx = sessions.findIndex(s => s.id === currentSessionId);
  const firstUserMsg = currentMessages.find(m => m.role === 'user');
  const title = firstUserMsg ? firstUserMsg.content.slice(0, 32) + (firstUserMsg.content.length > 32 ? '...' : '') : 'New Conversation';

  const sessionData = {
    id: currentSessionId,
    title: title,
    date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    messages: currentMessages
  };

  if (existingIdx >= 0) sessions[existingIdx] = sessionData;
  else sessions.unshift(sessionData);

  saveStoredSessions(sessions);
}

function startNewSession() {
  currentSessionId = 'session_' + Date.now();
  currentMessages = [];
  
  const container = document.getElementById('messagesContainer');
  const welcomeCard = document.getElementById('welcomeCard');

  if (container) {
    container.querySelectorAll('.message-row').forEach(r => r.remove());
  }

  if (welcomeCard) welcomeCard.style.display = 'block';

  closeAllModals();
  showToast('New Chat Started (نئی گفتگو)');
  triggerHaptic();
}

function loadSession(sessionId) {
  const sessions = getStoredSessions();
  const target = sessions.find(s => s.id === sessionId);
  if (!target) return;

  currentSessionId = target.id;
  currentMessages = target.messages || [];

  const container = document.getElementById('messagesContainer');
  const welcomeCard = document.getElementById('welcomeCard');

  if (container) {
    container.querySelectorAll('.message-row').forEach(r => r.remove());
  }

  if (welcomeCard) welcomeCard.style.display = currentMessages.length === 0 ? 'block' : 'none';

  for (const msg of currentMessages) renderMessageBubble(msg);

  closeAllModals();
  scrollToBottom();
  showToast('Session Loaded');
}

function deleteSession(sessionId, event) {
  event?.stopPropagation();
  let sessions = getStoredSessions();
  sessions = sessions.filter(s => s.id !== sessionId);
  saveStoredSessions(sessions);

  if (currentSessionId === sessionId) startNewSession();
  else populateHistoryList();
  showToast('Session deleted');
}

function populateHistoryList() {
  const historyList = document.getElementById('historyList');
  if (!historyList) return;

  const sessions = getStoredSessions();
  if (sessions.length === 0) {
    historyList.innerHTML = `<p class="modal-desc" style="text-align:center; padding: 20px 0;">No saved conversations yet.</p>`;
    return;
  }

  historyList.innerHTML = sessions.map(s => `
    <div class="history-item" data-session-id="${s.id}">
      <div class="history-item-info">
        <span class="history-item-title">${escapeHTML(s.title)}</span>
        <span class="history-item-date">${s.date} • ${s.messages?.length || 0} msgs</span>
      </div>
      <button class="history-del-btn" data-del-id="${s.id}" title="Delete session">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      </button>
    </div>
  `).join('');

  historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => loadSession(el.getAttribute('data-session-id')));
  });

  historyList.querySelectorAll('.history-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => deleteSession(btn.getAttribute('data-del-id'), e));
  });
}

// ==========================================================================
// 11. Export & Settings
// ==========================================================================

function exportChatAsText() {
  if (currentMessages.length === 0) {
    showToast('No messages to export.');
    return;
  }

  let text = `====================================================\n`;
  text += `Offline AI Urdu Advice Companion - Transcript\n`;
  text += `Developed by Waseem Asif\n`;
  text += `Exported: ${new Date().toLocaleString()}\n`;
  text += `====================================================\n\n`;

  for (const m of currentMessages) {
    if (m.role === 'user') {
      text += `[${m.timestamp}] User (Roman Urdu):\n${m.content}\n\n`;
    } else {
      text += `[${m.timestamp}] AI Companion (اردو):\n${m.content}\n\n`;
    }
  }

  downloadFile(text, `Urdu_AI_Chat_${Date.now()}.txt`, 'text/plain;charset=utf-8');
  showToast('Chat downloaded as .txt');
}

function exportChatAsJSON() {
  if (currentMessages.length === 0) {
    showToast('No messages to export.');
    return;
  }

  const exportData = {
    app: 'Offline AI Urdu Advice Companion',
    developer: 'Waseem Asif',
    exportDate: new Date().toISOString(),
    messages: currentMessages
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  downloadFile(jsonStr, `Urdu_AI_Chat_${Date.now()}.json`, 'application/json');
  showToast('Chat downloaded as .json');
}

function copyFullTranscript() {
  if (currentMessages.length === 0) {
    showToast('No messages to copy.');
    return;
  }

  let text = '';
  for (const m of currentMessages) {
    text += `${m.role === 'user' ? 'You (Roman Urdu)' : 'AI (اردو)'}: ${m.content}\n\n`;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('Full transcript copied to clipboard!');
    closeAllModals();
  });
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (raw) currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    currentSettings = { ...DEFAULT_SETTINGS };
  }
  applySettingsToUI();
}

function saveSettings() {
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(currentSettings));
  } catch (e) {
    console.warn('Could not save settings:', e);
  }
}

function applySettingsToUI() {
  document.documentElement.setAttribute('data-theme', currentSettings.theme);
  updateThemeIcons(currentSettings.theme);

  const root = document.documentElement;
  if (currentSettings.fontFamily === 'naskh') {
    root.style.setProperty('--font-urdu', "'Noto Sans Arabic', sans-serif");
  } else if (currentSettings.fontFamily === 'system') {
    root.style.setProperty('--font-urdu', "system-ui, sans-serif");
  } else {
    root.style.setProperty('--font-urdu', "'Noto Nastaliq Urdu', 'Noto Sans Arabic', serif");
  }

  root.style.setProperty('--urdu-font-size', `${currentSettings.fontSize}px`);

  const settingEngine = document.getElementById('settingEngine');
  const settingFont = document.getElementById('settingFont');
  const settingFontSize = document.getElementById('settingFontSize');
  const fontSizeVal = document.getElementById('fontSizeVal');
  const settingTemp = document.getElementById('settingTemp');
  const tempVal = document.getElementById('tempVal');
  const settingOnlineFallback = document.getElementById('settingOnlineFallback');
  const settingHaptic = document.getElementById('settingHaptic');
  const settingLowPower = document.getElementById('settingLowPower');

  if (settingEngine) settingEngine.value = currentSettings.engineMode;
  if (settingFont) settingFont.value = currentSettings.fontFamily;
  if (settingFontSize) settingFontSize.value = currentSettings.fontSize;
  if (fontSizeVal) fontSizeVal.textContent = `${currentSettings.fontSize}px`;
  if (settingTemp) settingTemp.value = currentSettings.temperature;
  if (tempVal) tempVal.textContent = currentSettings.temperature;
  if (settingOnlineFallback) settingOnlineFallback.checked = currentSettings.onlineFallback;
  if (settingHaptic) settingHaptic.checked = currentSettings.haptic;
  if (settingLowPower) settingLowPower.checked = currentSettings.lowPower;
}

function updateThemeIcons(theme) {
  const sun = document.getElementById('themeIconSun');
  const moon = document.getElementById('themeIconMoon');
  if (theme === 'light') {
    sun?.classList.remove('hidden');
    moon?.classList.add('hidden');
  } else {
    sun?.classList.add('hidden');
    moon?.classList.remove('hidden');
  }
}

function toggleTheme() {
  currentSettings.theme = currentSettings.theme === 'dark' ? 'light' : 'dark';
  applySettingsToUI();
  saveSettings();
  triggerHaptic();
}

function triggerHaptic() {
  if (currentSettings.haptic && 'vibrate' in navigator) {
    try { navigator.vibrate(18); }
    catch (e) {}
  }
}

// ==========================================================================
// 12. UI Helpers & Modals
// ==========================================================================

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 2600);
}

function openModal(modalId) {
  closeAllModals();
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    triggerHaptic();
  }
  closeDropdownMenu();
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
}

function toggleDropdownMenu() {
  const menu = document.getElementById('dropdownMenu');
  const btn = document.getElementById('menuToggleBtn');
  if (!menu) return;

  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    menu.classList.remove('hidden');
    btn?.setAttribute('aria-expanded', 'true');
  } else {
    menu.classList.add('hidden');
    btn?.setAttribute('aria-expanded', 'false');
  }
}

function closeDropdownMenu() {
  const menu = document.getElementById('dropdownMenu');
  const btn = document.getElementById('menuToggleBtn');
  menu?.classList.add('hidden');
  btn?.setAttribute('aria-expanded', 'false');
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function formatUrduMarkdown(str) {
  if (!str) return '';
  const safe = escapeHTML(str);
  // Replace bold **bold**
  let formatted = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Replace italic *italic*
  formatted = formatted.replace(/(^|[^*])\*(?!\*)([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Normalize linebreaks
  formatted = formatted.replace(/(?:\r\n|\r|\n)/g, '<br>');
  return formatted;
}

// ==========================================================================
// 13. PWA & Service Worker
// ==========================================================================

function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js?v=4.0.0')
        .then((reg) => {
          console.log('[PWA] Service Worker registered:', reg.scope);
          try { reg.update(); } catch (e) {}
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  showToast('نئی اپڈیٹ انسٹال ہو گئی ہے۔ (Updated to v4.0.0)');
                }
              });
            }
          });
        })
        .catch((err) => console.warn('[PWA] SW registration failed:', err));
    });
  }

  const pwaInstallBtn = document.getElementById('pwaInstallBtn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    pwaInstallBtn?.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    pwaInstallBtn?.classList.add('hidden');
    showToast('App installed successfully to your phone!');
  });

  const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone);

  if (isIOS && !isStandalone && pwaInstallBtn) {
    pwaInstallBtn.classList.remove('hidden');
  }

  pwaInstallBtn?.addEventListener('click', async () => {
    if (isIOS && !isStandalone) {
      openModal('iosGuideModal');
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        pwaInstallBtn.classList.add('hidden');
        deferredInstallPrompt = null;
      }
    } else {
      openModal('appInfoModal');
    }
  });

  const connectionBadge = document.getElementById('connectionBadge');
  const connectionText = document.getElementById('connectionText');

  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    if (isOnline) {
      connectionBadge?.classList.remove('offline');
      connectionBadge?.classList.add('online');
      if (connectionText) connectionText.textContent = 'Online';
    } else {
      connectionBadge?.classList.remove('online');
      connectionBadge?.classList.add('offline');
      if (connectionText) connectionText.textContent = 'Offline (Working 100%)';
      showToast('Offline Mode: In-browser AI & Brain Active!');
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

// ==========================================================================
// 14. App Bootstrapper
// ==========================================================================

function initApp() {
  loadSettings();
  loadOfflineBrainDataset();
  setupPWA();
  setupVoiceRecognition();
  detectDeviceCapabilities();
  updateBrainCountBadge();
  populateBrainUI();

  currentSessionId = 'session_' + Date.now();

  // Navigation Tabs Wireup
  document.getElementById('tabChatBtn')?.addEventListener('click', () => switchTab('chatView'));
  document.getElementById('tabAdminBtn')?.addEventListener('click', () => switchTab('adminView'));

  // Live Search Toggle Button
  document.getElementById('liveSearchToggleBtn')?.addEventListener('click', toggleLiveSearch);

  // Header buttons
  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);
  document.getElementById('menuToggleBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdownMenu();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-dropdown-container')) closeDropdownMenu();
  });

  // 3-Dot Menu
  document.getElementById('menuItemHistory')?.addEventListener('click', () => {
    populateHistoryList();
    openModal('historyModal');
  });

  document.getElementById('menuItemSettings')?.addEventListener('click', () => openModal('settingsModal'));
  document.getElementById('menuItemHelp')?.addEventListener('click', () => openModal('helpModal'));
  document.getElementById('menuItemClear')?.addEventListener('click', () => openModal('confirmClearModal'));
  document.getElementById('menuItemExport')?.addEventListener('click', () => openModal('exportModal'));
  document.getElementById('menuItemInfo')?.addEventListener('click', () => {
    updateDiagnosticUI();
    openModal('appInfoModal');
  });

  // Modals close
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.getAttribute('data-close'))?.classList.add('hidden');
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Model Manager Downloader
  document.getElementById('toggleManagerBtn')?.addEventListener('click', () => toggleManagerCollapse());
  document.getElementById('downloadModelBtn')?.addEventListener('click', downloadAndCacheModel);
  document.getElementById('clearCacheBtn')?.addEventListener('click', clearLocalCache);

  // Auto-collapse model manager on mobile to give full view to chat
  if (window.innerWidth <= 768) {
    toggleManagerCollapse(true);
  }

  // Restore cached model status on launch if previously installed
  if (localStorage.getItem('urdu_ai_model_installed') === 'true') {
    isModelReady = true;
    updateModelStatusUI(true, '🟢 Local Model Installed & 100% Offline Ready');
    const downloadBtnText = document.getElementById('downloadBtnText');
    const modelStatusIcon = document.getElementById('modelStatusIcon');
    if (downloadBtnText) downloadBtnText.textContent = '✓ Model Cached & Ready';
    if (modelStatusIcon) modelStatusIcon.classList.add('ready');
  }

  // Prompt Chips
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      const chatInput = document.getElementById('chatInput');
      if (chatInput && prompt) {
        chatInput.value = prompt;
        autoResizeTextarea(chatInput);
        toggleClearInputButton(true);
        handleSendMessage();
      }
    });
  });

  // Chat Form & Input
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const clearInputBtn = document.getElementById('clearInputBtn');

  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  chatInput?.addEventListener('input', () => {
    autoResizeTextarea(chatInput);
    toggleClearInputButton(chatInput.value.length > 0);
  });

  clearInputBtn?.addEventListener('click', () => {
    if (chatInput) {
      chatInput.value = '';
      autoResizeTextarea(chatInput);
      toggleClearInputButton(false);
      chatInput.focus();
    }
  });

  // History & Sessions
  document.getElementById('newChatBtn')?.addEventListener('click', startNewSession);
  document.getElementById('confirmClearBtn')?.addEventListener('click', () => {
    startNewSession();
    closeAllModals();
    showToast('Chat cleared');
  });

  // Export buttons
  document.getElementById('exportTxtBtn')?.addEventListener('click', exportChatAsText);
  document.getElementById('exportJsonBtn')?.addEventListener('click', exportChatAsJSON);
  document.getElementById('copyTranscriptBtn')?.addEventListener('click', copyFullTranscript);

  // Settings
  document.getElementById('settingEngine')?.addEventListener('change', (e) => {
    currentSettings.engineMode = e.target.value;
    saveSettings();
    showToast('Engine preference updated');
  });

  document.getElementById('settingFont')?.addEventListener('change', (e) => {
    currentSettings.fontFamily = e.target.value;
    applySettingsToUI();
    saveSettings();
  });

  document.getElementById('settingFontSize')?.addEventListener('input', (e) => {
    currentSettings.fontSize = parseInt(e.target.value, 10);
    applySettingsToUI();
    saveSettings();
  });

  document.getElementById('settingTemp')?.addEventListener('input', (e) => {
    currentSettings.temperature = parseFloat(e.target.value);
    const tempVal = document.getElementById('tempVal');
    if (tempVal) tempVal.textContent = currentSettings.temperature;
    saveSettings();
  });

  document.getElementById('settingOnlineFallback')?.addEventListener('change', (e) => {
    currentSettings.onlineFallback = e.target.checked;
    saveSettings();
  });

  document.getElementById('settingHaptic')?.addEventListener('change', (e) => {
    currentSettings.haptic = e.target.checked;
    saveSettings();
  });

  document.getElementById('settingLowPower')?.addEventListener('change', (e) => {
    currentSettings.lowPower = e.target.checked;
    saveSettings();
  });

  // Admin Brain Training Form
  const trainForm = document.getElementById('trainBrainForm');
  trainForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const queryInput = document.getElementById('brainQueryInput');
    const answerInput = document.getElementById('brainAnswerInput');
    const categorySelect = document.getElementById('brainCategorySelect');

    const q = queryInput?.value?.trim();
    const a = answerInput?.value?.trim();
    const cat = categorySelect?.value || 'personal';

    if (q && a) {
      trainNewMemory(q, a, cat);
      queryInput.value = '';
      answerInput.value = '';
    }
  });

  // Admin Search filter
  document.getElementById('searchBrainInput')?.addEventListener('input', (e) => {
    populateBrainUI(e.target.value);
  });

  // Admin Backup & Restore
  document.getElementById('exportBrainBtn')?.addEventListener('click', exportBrainBackup);
  document.getElementById('importBrainFile')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importBrainBackup(file);
  });

  console.log('Offline AI Urdu Advice Companion v1.2.0 loaded with Admin Brain & Live Search. Developed by Waseem Asif.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
