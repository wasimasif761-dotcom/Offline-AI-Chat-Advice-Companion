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
  fontSize: 20,
  temperature: 0.6,
  onlineFallback: true,
  haptic: true,
  lowPower: true,
  theme: 'dark'
};

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

// ==========================================================================
// 4. Built-in Offline Neural Rule Engine
// ==========================================================================

const OFFLINE_KNOWLEDGE_BASE = [
  {
    category: 'greetings',
    keywords: ['salam', 'assalam', 'slaam', 'kaise ho', 'kese ho', 'kya haal', 'kya hal', 'hal chal', 'theek ho', 'thik ho', 'hello', 'hi'],
    generateResponse: () => `وعلیکم السلام ورحمۃ اللہ وبرکاتہ!

الحمدللہ، میں بخیر و عافیت ہوں اور آپ کا ذاتی آف لائن رہنما ہوں۔

فرمائیے، آج آپ کی کیا مدد کر سکتا ہوں؟ زندگی کے مسائل، تعلیم، کیریئر، ذہنی سکون یا کسی بھی الجھن کے متعلق بلا جھجھک رومن اردو میں لکھیے، میں آپ کی رہنمائی کے لیے ہمہ وقت حاضر ہوں۔`
  },
  {
    category: 'stress_anxiety',
    keywords: ['tension', 'stress', 'depression', 'anxiety', 'pareshan', 'pareshani', 'ghabrahat', 'sukoon', 'udas', 'udasi', 'darr', 'khauf', 'rona'],
    generateResponse: () => `السلام علیکم ورحمۃ اللہ،

میں آپ کے دل کی کیفیت کو بخوبی سمجھ سکتا ہوں۔ پریشانی اور گھبراہٹ انسانی زندگی کا ایک فطری حصہ ہیں، لیکن یاد رکھیے کہ کوئی بھی مشکل مستقل نہیں ہوتی۔

ذہنی سکون اور پریشانی پر قابو پانے کے لیے درج ذیل باتوں پر عمل کیجیے:

۱. گہرے سانس لیجیے (Deep Breathing):
جب بھی گھبراہٹ ہو، سیدھے بیٹھ کر ۳ سیکنڈ ناک سے گہرا سانس اندر کھینچیں اور ۵ سیکنڈ میں منہ سے آہستہ آہستہ باہر نکالیں۔ اس سے دل کی دھڑکن اور اعصاب فوراً پرسکون ہوتے ہیں۔

۲. حال پر توجہ دیجیے (Focus on Today):
مستقبل کے اندیشوں میں الجھنے کے بجائے صرف ان باتوں پر توجہ دیں جو اس وقت آپ کے قابو میں ہیں۔

۳. ذکر اور روحانی تسکین:
قرآن پاک میں ارشاد باری تعالیٰ ہے: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ" (خبردار! اللہ کے ذکر ہی سے دلوں کو اطمینان ملتا ہے)۔ کثرت سے استغفار اور درود شریف پڑھیں۔

۴. پانی پیجیے اور ہلکی واک کیجیے:
تازہ ہوا میں ۵ سے ۱۰ منٹ کی چہل قدمی آپ کے دماغ کو منفی سوچوں کے دائرے سے باہر نکال دیتی ہے۔

آپ اکیلے نہیں ہیں۔ اللہ پر بھروسہ رکھیں، سب بہتر ہوگا۔ اگر کسی مخصوص بات کی فکر ہے تو کھل کر بتائیے۔`
  },
  {
    category: 'exams_study',
    keywords: ['exam', 'paper', 'parhai', 'study', 'focus', 'yaad nahi rehta', 'marks', 'concentrate', 'concentration', 'fail', 'board', 'test'],
    generateResponse: () => `السلام علیکم،

امتحانات اور پڑھائی کی فکر ہر محنتی طالب علم کو ہوتی ہے، لیکن خوف کو کبھی اپنی صلاحیتوں پر غالب نہ آنے دیں۔ پڑھائی میں اعلیٰ کارکردگی اور فوکس کے لیے یہ سنہری اصول اپنائیں:

۱. پومودورو تکنیک (Pomodoro Technique):
مسلسل کئی گھنٹے بیٹھنے کے بجائے ۲۵ منٹ مکمل یکسوئی سے پڑھیں، پھر ۵ منٹ کا وقفہ لیں۔ اس سے ذہن تھکتا نہیں اور یادداشت تیز رہتی ہے۔

۲. موبائل فون اور خلفشار کو دور رکھیں:
پڑھائی کے دوران موبائل کو دوسرے کمرے میں رکھیں یا فلائٹ موڈ پر ڈال دیں۔ سوشل میڈیا آپ کے فوکس کا سب سے بڑا دشمن ہے۔

۳. لکھ کر یاد کرنے کی عادت:
صرف پڑھنے کے بجائے اہم نکات کو اپنے الفاظ میں مختصر نوٹ بنا کر لکھیے۔ جو بات لکھی جائے وہ دماغ کے طویل مدتی خانے میں محفوظ ہو جاتی ہے۔

۴. پچھلے سالوں کے پرچے (Past Papers):
گزشتہ ۵ سال کے سوالات حل کریں، اس سے امتحان کا ڈر ختم ہوگا اور وقت کی تقسیم سمجھ میں آئے گی۔

۵. نیند اور مناسب خوراک:
امتحان سے ایک رات پہلے کم از کم ۶ سے ۷ گھنٹے کی پرسکون نیند لیں۔ بے خوابی میں پڑھا ہوا بھی بھول جاتا ہے۔

ہمت نہ ہاریں، اپنی طرف سے پوری کوشش کریں اور نتیجہ اللہ پر چھوڑ دیں۔ کامیابی آپ کے قدم چومے گی، ان شاء اللہ!`
  },
  {
    category: 'career_success',
    keywords: ['career', 'kamyabi', 'success', 'job', 'mulazmat', 'interview', 'paisa', 'ameer', 'rozgar', 'business', 'karobar', 'future'],
    generateResponse: () => `السلام علیکم،

کامیابی کوئی اتفاقی چیز نہیں بلکہ یہ مستقل مزاجی، ہنر اور سچی لگن کا نتیجہ ہوتی ہے۔ ایک کامیاب کیریئر اور مستحکم مستقبل کے لیے ان رہنما اصولوں کو یاد رکھیں:

۱. جدید ہنر (High-Income Skill) سیکھیں:
آج کے دور میں صرف ڈگری کافی نہیں ہے۔ ڈیجیٹل اسکلز، کمیونیکیشن، پرابلم سالونگ اور فنی مہارت حاصل کریں جس کی مارکیٹ میں طلب ہو۔

۲. مستقل مزاجی (Consistency):
روزانہ تھوڑا سا کام کرنا مہینے میں ایک بار لمبی چھلانگ لگانے سے ہزار گنا بہتر ہے۔ قطرہ قطرہ ہی دریا بنتا ہے۔

۳. نیٹ ورکنگ اور اچھے اخلاق:
اپنے شعبے کے ماہرین اور مثبت سوچ رکھنے والے لوگوں سے رابطہ رکھیں۔ اخلاق اور دیانت داری آپ کی سب سے بڑی مارکیٹنگ ہے۔

۴. ناکامی سے مت گھبرائیں:
دنیا کا ہر کامیاب انسان کئی بار ناکام ہوا ہے۔ غلطی کو سیکھنے کا ذریعہ بنائیں، رکاوٹ نہیں۔

۵. وقت کی پابندی اور ایمانداری:
اپنے کام کو عبادت سمجھ کر امانت داری سے کیجیے۔ رزقِ حلال میں برکت اور دل میں سکون ہوتا ہے۔

اللہ تعالیٰ پر مکمل بھروسہ رکھ کر پہلا قدم اٹھائیے۔ اللہ محنت کرنے والوں کا اجر کبھی ضائع نہیں کرتا۔`
  },
  {
    category: 'early_morning',
    keywords: ['subah', 'jaldi uthna', 'aadat', 'habit', 'morning', 'susti', 'lazy', 'neend', 'fresh', 'routine', 'waqt'],
    generateResponse: () => `السلام علیکم،

صبح سویرے جاگنا تمام کامیاب اور صحت مند انسانوں کا مشترکہ راز ہے۔ صبح کے وقت میں اللہ نے خاص برکت اور تازگی رکھی ہے۔

صبح جلدی اٹھنے کی عادت بنانے کے عملی طریقے:

۱. رات کو وقت پر سونے کا فیصلہ:
جلدی اٹھنے کا راز رات کو جلدی سونے میں چھپا ہے۔ سونے سے ایک گھنٹہ پہلے تمام اسکرینز (موبائل، ٹی وی) بند کر دیں۔

۲. الارم کلاک کو بستر سے دور رکھیں:
الارم کو اپنے ہاتھ کی پہنچ سے دور کسی میز پر رکھیں تاکہ اسے بند کرنے کے لیے آپ کو بستر چھوڑ کر چلنا پڑے۔

۳. بستر چھوڑتے ہی پانی پئیں اور وضو کریں:
اٹھتے ہی ایک گلاس تازہ پانی پینا جسمانی میٹابولزم کو بیدار کرتا ہے، اور ٹھنڈے پانی سے وضو کرنے سے سستی اور نیند کا اثر فوراً ختم ہو جاتا ہے۔

۴. صبح کے وقت کا مقصد طے کریں:
رات کو ہی طے کر لیں کہ صبح اٹھ کر آپ نے نماز، تلاوت، چہل قدمی یا کون سا اہم کام کرنا ہے۔ بے مقصد اٹھنے سے انسان دوبارہ سو جاتا ہے۔

۵. ۳ ہفتے کا صبر:
کسی بھی نئی عادت کو پختہ ہونے میں ۲۱ دن لگتے ہیں۔ چند دن مشکل لگے گی مگر بعد میں یہ آپ کی قدرتی روٹین بن جائے گی۔

صبح کا وقت آپ کو پوری دنیا پر سبقت اور دلی سکون دیتا ہے۔ آج رات ہی سے آغاز کیجیے!`
  },
  {
    category: 'relationships',
    keywords: ['dost', 'dosti', 'walidain', 'rishta', 'rishte', 'shadi', 'naraz', 'narazgi', 'ghalat fehmi', 'jhagda', 'larai', 'muhabbat', 'pyar'],
    generateResponse: () => `السلام علیکم،

رشتے اور تعلقات زندگی کا سب سے قیمتی سرمایہ ہوتے ہیں، لیکن انسان ہونے کے ناطے کبھی کبھار غلط فہمیاں اور ناراضگیاں جنم لے لیتی ہیں۔

تعلقات کو خوبصورت اور مضبوط بنانے کے لیے یہ سنہری اصول مدنظر رکھیے:

۱. پہل کرنے والا بڑا ہوتا ہے:
انا (Ego) کو ایک طرف رکھ کر صلح اور بات چیت میں خود پہل کیجیے۔ معافی مانگنے سے انسان چھوٹا نہیں ہوتا بلکہ اس کا وقار بڑھتا ہے۔

۲. آمنے سامنے گفتگو (Clear Communication):
پیغامات یا واٹس ایپ پر لڑنے کے بجائے آمنے سامنے بیٹھ کر نرم لہجے میں غلط فہمی دور کریں۔ تحریر میں جذبات کا غلط مطلب نکل سکتا ہے۔

۳. دوسرے کے نکتہ نظر کو سمجھیں:
ہمیشہ یہ سوچیے کہ شاید دوسرا شخص کسی پریشانی یا دباؤ کا شکار تھا۔ ہمدردی کا مظاہرہ رشتے بچا لیتا ہے۔

۴. والدین کا احترام اور خدمت:
والدین کے سامنے اپنی آواز ہمیشہ پست رکھیں۔ ان کی خوشی میں دنیا اور آخرت دونوں کی کامیابی ہے۔

۵. احسان فراموشی اور طعنے سے پرہیز:
ماضی کی تلخ باتوں اور پرانی غلطیوں کو بار بار مت دہرائیں۔ جو گزر گیا اسے دفن کر دیجیے۔

مخلص دوست اور مخلص رشتے بار بار نہیں ملتے۔ دل بڑا کیجیے اور محبتیں بانٹیے۔`
  }
];

function generateBuiltinUrduResponse(userPrompt) {
  const cleanPrompt = userPrompt.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, ' ');
  const words = cleanPrompt.split(/\s+/).filter(Boolean);

  let bestMatch = null;
  let maxScore = 0;

  for (const item of OFFLINE_KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of item.keywords) {
      if (cleanPrompt.includes(kw)) score += kw.split(' ').length * 2.5;
      for (const w of words) {
        if (w === kw) score += 2;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && maxScore >= 2) {
    return bestMatch.generateResponse();
  }

  return `السلام علیکم،

آپ کی بات اور احساسات کو میں نے غور سے سمجھا ہے۔ 

زندگی میں ہر انسان مختلف مراحل اور سوالات سے گزرتا ہے۔ آپ کے سوال کے تناظر میں میری مخلصانہ نصیحت یہ ہے:

۱. سب سے پہلے اپنے دل اور ذہن کو پرسکون رکھیے۔ جلد بازی یا جذباتی دباؤ میں کوئی بھی رائے قائم مت کیجیے۔
۲. مسئلے کو چھوٹے چھوٹے حصوں میں تقسیم کریں اور یہ دیکھیں کہ آج کے دن آپ کون سا مثبت قدم اٹھا سکتے ہیں۔
۳. اپنے قریبی اور خیرخواہ افراد سے مشاورت کیجیے اور اللہ تعالیٰ سے خیر کی دعا مانگیے۔
۴. مثبت سوچ اور محنت کو اپنا ہتھیار بنائیں؛ ہر مشکل اپنے ساتھ آسانی اور تجربہ لے کر آتی ہے۔

اگر آپ اس معاملے کے متعلق مزید تفصیل یا پس منظر بتانا چاہیں تو ضرور لکھیے، میں ہر ممکن رہنمائی کے لیے حاضر ہوں۔`;
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
  const selectedModel = modelSelect?.value || 'SmolLM2-135M-Instruct-q0f32-MLC';

  if (selectedModel === 'builtin-offline') {
    showToast('Built-in Engine selected. No download needed!');
    updateModelStatusUI(true, 'Built-in Engine Active (100% Offline)');
    return;
  }

  if (!hasWebGPU) {
    showToast('Notice: WebGPU is disabled on this browser. Using Built-in Fast Engine.');
    updateModelStatusUI(true, 'Built-in Neural Engine Active');
    return;
  }

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

    isModelReady = true;
    isModelDownloading = false;
    modelStatusIcon?.classList.remove('downloading');
    modelStatusIcon?.classList.add('ready');
    if (downloadModelBtn) downloadModelBtn.disabled = false;
    if (downloadBtnText) downloadBtnText.textContent = 'Model Cached & Ready';
    
    updateModelStatusUI(true, 'Local AI Model Installed & 100% Offline Ready');
    showToast('Success! AI Model installed locally on your phone.');
    updateDiagnosticUI();

    setTimeout(() => toggleManagerCollapse(true), 2500);
  } catch (err) {
    console.warn('Local WebLLM download issue:', err);
    isModelDownloading = false;
    if (downloadModelBtn) downloadModelBtn.disabled = false;
    if (downloadBtnText) downloadBtnText.textContent = 'Retry Download';
    modelStatusIcon?.classList.remove('downloading');
    showToast('WebGPU download paused. Built-in Offline Engine active.');
    updateModelStatusUI(true, 'Built-in Fast Engine Active (Zero RAM)');
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
          if (k.startsWith('webllm')) await caches.delete(k);
        }
      }
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
    // PRIORITY 2: Live Internet Search (if explicitly active or requested)
    // -------------------------------------------------------------
    const isOnline = navigator.onLine;
    const wantsLiveSearch = isLiveSearchActive || (currentSettings.onlineFallback && isLiveSearchQuery(text));

    if (wantsLiveSearch && isOnline) {
      setTypingText('انٹرنیٹ پر تازہ معلومات تلاش کی جا رہی ہیں...');
      const liveResult = await fetchLiveInternetLookup(text);
      if (liveResult && liveResult.text) {
        aiMsg.sourceType = 'live_internet';
        await streamStaticUrduResponse(liveResult.text, aiMsg, '🌐 لائیو انٹرنیٹ تلاش (Live Web Search)');
        return;
      }
    }

    // -------------------------------------------------------------
    // PRIORITY 3: In-Browser Local Model (WebLLM)
    // -------------------------------------------------------------
    const enginePref = currentSettings.engineMode;
    const canUseWebLLM = (enginePref === 'force-local' || enginePref === 'auto') && isModelReady && mlcEngine;

    if (canUseWebLLM) {
      setTypingText('مقامی آف لائن ماڈل سوچ رہا ہے...');
      await generateWithWebLLM(text, aiMsg);
      return;
    }

    // -------------------------------------------------------------
    // PRIORITY 4: Built-in Offline Fast Engine (Instant)
    // -------------------------------------------------------------
    setTypingText('رہبر غور کر رہا ہے...');
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
 * Stream static Urdu text with natural token animation
 */
async function streamStaticUrduResponse(fullReply, aiMsg, sourceLabel = '') {
  await new Promise(r => setTimeout(r, 450));
  showTypingIndicator(false);

  aiMsg.sourceLabel = sourceLabel;
  const bubbleElement = renderMessageBubble(aiMsg, true);
  const textElement = bubbleElement.querySelector('.urdu-response-text');

  let currentLength = 0;
  const totalLength = fullReply.length;
  const step = Math.max(3, Math.floor(totalLength / 50));

  return new Promise((resolve) => {
    function streamStep() {
      currentLength += step;
      if (currentLength >= totalLength) {
        currentLength = totalLength;
        aiMsg.content = fullReply;
        if (textElement) textElement.textContent = fullReply;
        scrollToBottom();
        resolve();
      } else {
        aiMsg.content = fullReply.slice(0, currentLength);
        if (textElement) textElement.textContent = aiMsg.content;
        scrollToBottom();
        setTimeout(streamStep, 18);
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
    if (textElement) textElement.textContent = fullReply;
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
      sourceBadgeHtml = `<span class="brain-badge">🧠 یادداشت (Trained Memory)</span>`;
    } else if (msg.sourceType === 'live_internet') {
      sourceBadgeHtml = `<span class="source-badge">🌐 لائیو تلاش (Live Search)</span>`;
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
          <div class="urdu-response-text" dir="rtl">${escapeHTML(msg.content)}</div>
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

// ==========================================================================
// 13. PWA & Service Worker
// ==========================================================================

function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('[PWA] Service Worker registered:', reg.scope))
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
