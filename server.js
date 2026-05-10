/* ═══════════════════════════════════════════════════════════
   BOGG BAG DEMO — Server with n8n Webhook Integration
   • Reverse-proxies boggbag.com for the iframe
   • Serves the chatbot frontend
   • Forwards chat messages to n8n as Intercom-format payloads
   • Receives bot replies from n8n via /api/bot-reply
   ═══════════════════════════════════════════════════════════ */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
// Automatically use Render's provided URL if deployed there, otherwise use FRONTEND_URL, otherwise fallback to localhost
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// n8n webhook URL — same as chatbot-frontend
const N8N_WEBHOOK_URL = 'https://ravibhai.app.n8n.cloud/webhook/chatbot';

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// In-memory store
let messages = [];
let conversationId = 'conv_' + Date.now();

// ===== BUILD INTERCOM-FORMAT PAYLOAD =====
function buildIntercomPayload(message) {
  const now = Math.floor(Date.now() / 1000);
  return {
    type: 'notification_event',
    app_id: 'app_987654',
    data: {
      type: 'notification_event_data',
      item: {
        type: 'conversation',
        id: conversationId,
        created_at: now,
        updated_at: now,
        waiting_since: now,
        snoozed_until: null,
        source: {
          type: 'conversation',
          id: 'src_' + message.id,
          delivered_as: 'customer_initiated',
          subject: '',
          body: '<p>' + (message.text || '') + '</p>',
          author: {
            type: 'user',
            id: 'user_123',
            name: message.author || 'Customer',
            email: 'customer@example.com'
          },
          attachments: (message.attachments || []).map(a => ({
            name: a.name || 'file',
            url: a.url.startsWith('http') ? a.url : FRONTEND_URL + a.url,
            content_type: a.content_type || 'image/jpeg',
            filesize: a.filesize || 0
          })),
          url: 'https://app.intercom.com/conversations/' + conversationId,
          redacted: false
        },
        contacts: {
          type: 'contact.list',
          contacts: [{ type: 'contact', id: 'contact_456', external_id: 'ext_789' }]
        },
        first_contact_reply: {
          created_at: now,
          type: 'conversation',
          url: 'https://app.intercom.com/conversations/' + conversationId
        },
        admin_assignee_id: null,
        team_assignee_id: 101,
        open: true,
        state: 'open',
        read: true,
        tags: { type: 'tag.list', tags: [{ id: 'tag_1', name: 'customer_message' }] },
        priority: 'not_priority',
        sla_applied: null,
        statistics: {
          type: 'conversation_statistics',
          time_to_assignment: null,
          time_to_admin_reply: null,
          time_to_first_close: null,
          time_to_last_close: null,
          median_time_to_reply: null,
          first_contact_reply_at: new Date().toISOString(),
          first_assignment_at: new Date().toISOString(),
          first_admin_reply_at: null,
          first_close_at: null,
          last_assignment_at: new Date().toISOString(),
          last_assignment_admin_reply_at: null,
          last_contact_reply_at: new Date().toISOString(),
          last_admin_reply_at: null,
          last_close_at: null,
          last_closed_by_id: null,
          count_reopens: 0,
          count_assignments: 0,
          count_conversation_parts: messages.length,
          handling_time: null
        },
        conversation_rating: null,
        teammates: { type: 'admin.list', admins: [] },
        title: null,
        custom_attributes: {
          'Has attachments': !!(message.attachments && message.attachments.length),
          'Imported via standalone': false,
          'Auto-translated': false,
          'Brand': 'BOGG BAG',
          'Language': 'English'
        },
        topics: { type: 'topic.list', topics: [], total_count: 0 },
        ticket: null,
        linked_objects: { type: 'list', data: [], total_count: 0, has_more: false },
        ai_agent: null,
        ai_agent_participated: false,
        conversation_parts: {
          type: 'conversation_part.list',
          conversation_parts: [{
            type: 'conversation_part',
            id: message.id,
            part_type: 'comment',
            body: '<p>' + (message.text || '') + '</p>',
            created_at: now,
            updated_at: now,
            notified_at: now,
            author: {
              id: 'user_123',
              type: 'user',
              name: message.author || 'Customer',
              email: 'customer@example.com',
              from_ai_agent: false,
              is_ai_answer: false
            },
            attachments: (message.attachments || []).map(a => ({
              name: a.name || 'file',
              url: a.url.startsWith('http') ? a.url : FRONTEND_URL + a.url,
              content_type: a.content_type || 'image/jpeg'
            })),
            external_id: null,
            redacted: false,
            metadata: {},
            state: 'open',
            tags: []
          }],
          total_count: 1
        }
      }
    },
    links: {},
    id: 'notif_' + Date.now(),
    topic: 'conversation.user.replied',
    delivery_status: 'pending',
    delivery_attempts: 1,
    delivered_at: 0,
    first_sent_at: now,
    created_at: now,
    self: null
  };
}

// ===== FORWARD TO N8N =====
async function forwardToN8N(message) {
  const payload = buildIntercomPayload(message);
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Intercom/Parrot 1.0',
        'Accept': 'application/json',
        'Intercom-Version': '2.10',
        'X-Hub-Signature': 'sha1=mock_signature'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await res.text();
    console.log(`📤 Forwarded to n8n: ${res.status}`);

    // Try to parse n8n response and return it
    try {
      return JSON.parse(responseData);
    } catch {
      return { reply: responseData };
    }
  } catch (err) {
    console.error(`⚠️  n8n forward failed:`, err.message);
    return null;
  }
}

// ═════════════════════════════════════════════════════
// API ROUTES (must be registered BEFORE the proxy)
// ═════════════════════════════════════════════════════

// ───── Serve demo page (static files) ─────
app.use('/demo', express.static(__dirname, { index: 'index.html' }));

// ───── Serve uploaded files ─────
app.use('/uploads', express.static(uploadsDir));

// Get chat history
app.get('/api/messages', (req, res) => {
  res.json({ success: true, messages });
});

// Send a message + forward to n8n
app.post('/api/messages', async (req, res) => {
  const { text, author, attachments } = req.body;
  if (!text && (!attachments || !attachments.length)) {
    return res.status(400).json({ success: false, error: 'Empty message' });
  }

  const msg = {
    id: 'msg_' + Date.now(),
    text: text || '',
    author: author || 'You',
    role: 'user',
    attachments: attachments || [],
    timestamp: Date.now()
  };
  messages.push(msg);
  console.log(`💬 User: ${msg.text}`);

  // Forward to n8n and get response
  const n8nResponse = forwardToN8N(msg);

  res.json({ success: true, message: msg, n8nResponse: null });

  // Handle n8n response asynchronously
  n8nResponse.then(resp => {
    if (resp && resp.reply) {
      const botMsg = {
        id: 'msg_' + Date.now(),
        text: resp.reply,
        author: 'Assistant',
        role: 'bot',
        attachments: [],
        timestamp: Date.now()
      };
      messages.push(botMsg);
      console.log(`🤖 Bot: ${botMsg.text}`);
    }
  });
});

// Upload image
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file' });
  res.json({
    success: true,
    attachment: {
      name: req.file.originalname,
      url: '/uploads/' + req.file.filename,
      content_type: req.file.mimetype,
      filesize: req.file.size
    }
  });
});

// ===== BOT REPLY ENDPOINT (n8n posts here) =====
app.post('/api/bot-reply', (req, res) => {
  const { reply, message, text, output } = req.body;
  const botText = reply || message || text || output || '';

  if (!botText) {
    return res.status(400).json({ success: false, error: 'No reply text provided. Send as { "reply": "your message" }' });
  }

  const botMsg = {
    id: 'msg_' + Date.now(),
    text: botText,
    author: 'Assistant',
    role: 'bot',
    attachments: [],
    timestamp: Date.now()
  };
  messages.push(botMsg);
  console.log(`🤖 Bot reply received from n8n: ${botText}`);

  res.json({ success: true, message: botMsg });
});

// Poll for new messages (simple polling for bot responses)
app.get('/api/messages/poll', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const newMsgs = messages.filter(m => m.timestamp > since);
  res.json({ success: true, messages: newMsgs });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), messageCount: messages.length });
});

// Clear chat history (reset session)
app.post('/api/messages/clear', (req, res) => {
  messages = [];
  conversationId = 'conv_' + Date.now();
  console.log('🗑️  Chat history cleared, new session: ' + conversationId);
  res.json({ success: true });
});

// ===== PRODUCT IMAGE PROXY (for chatbot product cards) =====
const imageCache = {};
app.get('/api/product-image', async (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.json({ image: null });

  // Check cache first
  if (imageCache[slug]) return res.json({ image: imageCache[slug] });

  try {
    const apiUrl = `https://boggbag.com/products/${slug}.json`;
    const resp = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (!resp.ok) return res.json({ image: null });
    const data = await resp.json();
    const imgSrc = data.product?.image?.src || data.product?.images?.[0]?.src || null;
    if (imgSrc) imageCache[slug] = imgSrc;
    res.json({ image: imgSrc });
  } catch (e) {
    res.json({ image: null });
  }
});

// ═════════════════════════════════════════════════════
// ROOT → Redirect to demo page
// ═════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.redirect('/demo/');
});

// ═════════════════════════════════════════════════════
// REVERSE PROXY — Catches everything else and proxies
// to boggbag.com (MUST be last)
// ═════════════════════════════════════════════════════
app.use('/', createProxyMiddleware({
  target: 'https://boggbag.com',
  changeOrigin: true,
  selfHandleResponse: false,
  on: {
    proxyRes: (proxyRes, req, res) => {
      // Remove frame-busting headers
      delete proxyRes.headers['x-frame-options'];
      delete proxyRes.headers['content-security-policy'];
      delete proxyRes.headers['content-security-policy-report-only'];
    }
  }
}));

app.listen(PORT, () => {
  console.log(`\n  🎒 BOGG BAG DEMO SERVER`);
  console.log(`  ──────────────────────────────────`);
  console.log(`  Demo page:     http://localhost:${PORT}/demo/`);
  console.log(`  Proxied site:  http://localhost:${PORT}/collections/shop-all`);
  console.log(`  Frontend URL:  ${FRONTEND_URL}`);
  console.log(`  n8n webhook:   ${N8N_WEBHOOK_URL}`);
  console.log(`  ──────────────────────────────────`);
  console.log(`\n  📥 n8n should POST replies to: ${FRONTEND_URL}/api/bot-reply`);
  console.log(`     Body format: { "reply": "your response text" }\n`);
});
