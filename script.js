/* ═══════════════════════════════════════════════════════════
   BOGG BAG DEMO — Chatbot Widget Logic
   • Sends messages to backend API → n8n webhook
   • Polls for bot replies from n8n
   • Typing indicator animation before bot reply
   • Smooth open/close with CSS transitions
   • Quick-reply chips & product cards for UX
   ═══════════════════════════════════════════════════════════ */

;(function () {
  'use strict';

  // ───── DOM References ─────
  const launcher    = document.getElementById('chat-launcher');
  const chatWindow  = document.getElementById('chat-window');
  const closeBtn    = document.getElementById('chat-close-btn');
  const messagesEl  = document.getElementById('chat-messages');
  const form        = document.getElementById('chat-form');
  const input       = document.getElementById('chat-input');
  const sendBtn     = document.getElementById('chat-send-btn');
  const fileInput   = document.getElementById('chat-file-upload');
  const attachmentPreview = document.getElementById('chat-attachment-preview');
  const previewImg  = document.getElementById('chat-preview-img');
  const removeAttachmentBtn = document.getElementById('chat-remove-attachment');

  // ───── State ─────
  let isOpen = false;
  let isBotTyping = false;
  let currentAttachment = null;
  let currentAttachmentFile = null;
  let lastPoll = 0;
  let pollInterval = null;

  // ═══════════════════════════════════════════════════════════
  // OPEN / CLOSE
  // ═══════════════════════════════════════════════════════════

  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.classList.toggle('open', isOpen);
    chatWindow.setAttribute('aria-hidden', String(!isOpen));
    launcher.classList.toggle('open', isOpen);

    if (isOpen) {
      // Clear previous history on server + reset frontend
      fetch('/api/messages/clear', { method: 'POST' }).catch(() => {});
      messagesEl.innerHTML = '';
      lastPoll = 0;
      showWelcome();
      startPolling();
      setTimeout(() => input.focus(), 400);
    } else {
      stopPolling();
    }
  }

  launcher.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) toggleChat();
  });

  // ═══════════════════════════════════════════════════════════
  // LOAD MESSAGES & WELCOME
  // ═══════════════════════════════════════════════════════════

  async function loadMessages() {
    try {
      const res = await fetch('/api/messages/poll?since=0');
      const data = await res.json();
      if (data.success && data.messages.length > 0) {
        messagesEl.innerHTML = '';
        data.messages.forEach(msg => {
          appendMessage(msg.role === 'bot' ? 'bot' : 'user', msg.text, null, false);
        });
        lastPoll = Math.max(...data.messages.map(m => m.timestamp));
        scrollToBottom();
      } else {
        showWelcome();
      }
    } catch (e) {
      console.error(e);
      showWelcome();
    }
  }

  function showWelcome() {
    if (messagesEl.querySelector('.chat-msg.bot')) return; // already shown
    const welcomeText = "Hey there! 👋 Welcome to BOGG BAG. I'm Bea, here to help you find the perfect bag or answer any questions. How can I help you today?";
    appendMessage('bot', welcomeText, null, false);

    // Show quick-reply chips after a brief delay
    setTimeout(() => {
      const chips = [
        'What sizes are available?',
        'Best sellers',
        'Bags under $80',
        'Shipping info',
      ];
      showQuickReplies(chips);
    }, 500);
  }

  // ═══════════════════════════════════════════════════════════
  // POLLING FOR BOT REPLIES
  // ═══════════════════════════════════════════════════════════

  function startPolling() {
    stopPolling();
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/messages/poll?since=' + lastPoll);
        const data = await res.json();
        if (data.messages && data.messages.length) {
          data.messages.forEach(m => {
            if (m.role === 'bot') {
              removeTyping();
              isBotTyping = false;
              appendMessage('bot', m.text, null, true);
            }
          });
          lastPoll = Math.max(...data.messages.map(m => m.timestamp));
        }
      } catch (e) { /* ignore */ }
    }, 2000);
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  // ═══════════════════════════════════════════════════════════
  // MESSAGES
  // ═══════════════════════════════════════════════════════════

  // Local product images pool
  const BAG_IMAGES = ['/demo/Bag1.jpeg','/demo/bag2.jpeg','/demo/bag3.jpeg','/demo/bag4.jpeg','/demo/bag5.jpeg','/demo/bag6.jpeg','/demo/bag7.jpeg'];
  let bagImgIndex = 0;
  function getNextBagImage() {
    const img = BAG_IMAGES[bagImgIndex % BAG_IMAGES.length];
    bagImgIndex++;
    return img;
  }

  function appendMessage(role, text, imgSrc = null, doScroll = true) {
    const msg = document.createElement('div');
    msg.classList.add('chat-msg', role);
    
    if (imgSrc) {
      const img = document.createElement('img');
      img.src = imgSrc;
      img.classList.add('chat-user-img');
      msg.appendChild(img);
    }
    
    if (text && role === 'bot') {
      // Detect product URLs and order IDs in the agent's conversational text
      const productUrls = extractProductUrls(text);
      const orderIds = extractOrderIds(text);
      const prices = extractPrices(text);
      const hasProducts = productUrls.length > 0;
      const hasOrders = orderIds.length > 0;
      
      // Clean the text: remove URLs, format nicely
      let displayText = cleanBotResponse(text);
      const textSpan = document.createElement('div');
      textSpan.innerHTML = formatBotHtml(displayText);
      msg.appendChild(textSpan);
      messagesEl.appendChild(msg);
      
      // Render interactive tiles BELOW the message bubble
      if (hasProducts) {
        renderProductTiles(productUrls, prices);
      }
      if (hasOrders) {
        renderOrderTiles(orderIds, text);
      }
    } else if (text) {
      const textSpan = document.createElement('div');
      textSpan.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
      msg.appendChild(textSpan);
      messagesEl.appendChild(msg);
    } else {
      messagesEl.appendChild(msg);
    }

    // Decorative icons on bot messages
    if (role === 'bot') {
      const lastBot = messagesEl.querySelector('.chat-msg.bot:last-of-type');
      if (lastBot && !lastBot.querySelector('.chat-msg-icon, .chat-msg-icon-left')) {
        const icon = document.createElement('div');
        const isStarfish = Math.random() > 0.5;
        icon.classList.add(isStarfish ? 'chat-msg-icon' : 'chat-msg-icon-left');
        icon.textContent = isStarfish ? '🌺' : '🐚';
        lastBot.appendChild(icon);
      }
    }
    
    if (doScroll) scrollToBottom();
  }

  // ═══════════════════════════════════════════════════════════
  // SMART EXTRACTORS — work on the agent's conversational text
  // ═══════════════════════════════════════════════════════════

  function extractProductUrls(text) {
    const urls = [];
    // Match boggbag.com product URLs anywhere in text
    const urlRegex = /https?:\/\/boggbag\.com\/products\/([a-z0-9\-]+)/gi;
    let m;
    while ((m = urlRegex.exec(text)) !== null) {
      urls.push({ fullUrl: m[0], slug: m[1] });
    }
    // Deduplicate by slug
    const seen = new Set();
    return urls.filter(u => { if (seen.has(u.slug)) return false; seen.add(u.slug); return true; });
  }

  function extractOrderIds(text) {
    const ids = [];
    const idRegex = /BOGG[\s\-]*\d{4}/gi;
    let m;
    while ((m = idRegex.exec(text)) !== null) {
      const normalized = m[0].replace(/\s+/g, '-').toUpperCase();
      if (!ids.includes(normalized)) ids.push(normalized);
    }
    return ids;
  }

  function extractPrices(text) {
    const prices = [];
    const priceRegex = /\$(\d+(?:\.\d{2})?)/g;
    let m;
    while ((m = priceRegex.exec(text)) !== null) {
      prices.push(m[1]);
    }
    return prices;
  }

  // ═══════════════════════════════════════════════════════════
  // TEXT CLEANING — format bot text for display
  // ═══════════════════════════════════════════════════════════

  function cleanBotResponse(text) {
    // Remove asterisks (markdown bold/italic)
    let clean = text.replace(/\*+/g, '');
    // Remove raw URLs (they'll be in the cards)
    clean = clean.replace(/https?:\/\/boggbag\.com\/products\/[a-z0-9\-]+/gi, '');
    clean = clean.replace(/https?:\/\/track\.boggbag\.com\/[A-Z0-9]+/gi, '');
    // Remove [API RESPONSE: ...] tags
    clean = clean.replace(/\[API RESPONSE[^\]]*\]/gi, '');
    // Clean up leftover artifacts
    clean = clean.replace(/\(\s*\)/g, ''); // empty parens
    clean = clean.replace(/:\s*\n/g, ':\n');
    clean = clean.replace(/\n{3,}/g, '\n\n');
    return clean.trim();
  }

  function formatBotHtml(text) {
    let html = escapeHtml(text);
    // Convert newlines to <br>
    html = html.replace(/\n/g, '<br>');
    // Bold text between colons pattern (e.g., "Status: Shipped")
    return html;
  }

  // ═══════════════════════════════════════════════════════════
  // INTERACTIVE PRODUCT TILES
  // ═══════════════════════════════════════════════════════════

  function renderProductTiles(productUrls, prices) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('product-tiles-wrapper');

    productUrls.forEach((product, index) => {
      const tile = document.createElement('a');
      tile.href = product.fullUrl;
      tile.target = '_blank';
      tile.rel = 'noopener';
      tile.classList.add('product-tile');
      tile.style.animationDelay = `${index * 0.1}s`;

      // Pretty name from slug
      const prettyName = product.slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      const price = prices[index] || null;
      const imgSrc = getNextBagImage();

      tile.innerHTML = `
        <div class="ptile-img-wrap">
          <img src="${imgSrc}" alt="${escapeHtml(prettyName)}" class="ptile-img" />
          <div class="ptile-overlay">
            <span class="ptile-view-btn">View Product</span>
          </div>
        </div>
        <div class="ptile-info">
          <div class="ptile-name">${escapeHtml(prettyName)}</div>
          ${price ? `<div class="ptile-price">$${price}</div>` : ''}
        </div>
        <div class="ptile-link-row">
          <span class="ptile-shop-link">Shop Now</span>
          <span class="ptile-arrow">→</span>
        </div>
      `;

      wrapper.appendChild(tile);
    });

    messagesEl.appendChild(wrapper);
    scrollToBottom();
  }

  // ═══════════════════════════════════════════════════════════
  // INTERACTIVE ORDER TILES
  // ═══════════════════════════════════════════════════════════

  function renderOrderTiles(orderIds, fullText) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('order-tiles-wrapper');

    orderIds.forEach((orderId, index) => {
      const tile = document.createElement('div');
      tile.classList.add('order-tile');
      tile.style.animationDelay = `${index * 0.1}s`;

      // Try to extract status, item, tracking near this order ID
      const status = extractNearField(fullText, orderId, /status[:\s]+([^\n,]+)/i) || 'Processing';
      const item = extractNearField(fullText, orderId, /(?:item|product)[:\s]+([^\n,]+)/i) || '';
      const tracking = extractNearField(fullText, orderId, /(?:tracking|track)[:\s#]+([A-Z0-9]+)/i) || '';
      const trackingLink = fullText.match(/https?:\/\/track\.boggbag\.com\/[A-Z0-9]+/i);
      const amount = extractNearField(fullText, orderId, /\$(\d+(?:\.\d{2})?)/);

      const statusLower = status.toLowerCase();
      const statusClass = statusLower.includes('deliver') ? 'delivered' :
                           statusLower.includes('ship') || statusLower.includes('delivery') || statusLower.includes('out for') ? 'shipped' :
                           'processing';
      const statusIcon = statusClass === 'delivered' ? '✅' : statusClass === 'shipped' ? '🚚' : '⏳';

      tile.innerHTML = `
        <div class="otile-header">
          <div class="otile-id-wrap">
            <span class="otile-icon">📋</span>
            <span class="otile-id">${escapeHtml(orderId)}</span>
          </div>
          <span class="otile-status ${statusClass}">${statusIcon} ${escapeHtml(status)}</span>
        </div>
        <div class="otile-body">
          ${item ? `<div class="otile-row"><span class="otile-label">📦 Item</span><span class="otile-value">${escapeHtml(item)}</span></div>` : ''}
          ${amount ? `<div class="otile-row"><span class="otile-label">💰 Amount</span><span class="otile-value">$${amount}</span></div>` : ''}
          ${tracking ? `
            <a href="${trackingLink ? trackingLink[0] : '#'}" target="_blank" class="otile-track-btn" ${trackingLink ? '' : 'onclick="return false"'}>
              🚚 Track Shipment: ${escapeHtml(tracking)}
            </a>
          ` : ''}
        </div>
      `;

      wrapper.appendChild(tile);
    });

    messagesEl.appendChild(wrapper);
    scrollToBottom();
  }

  // Extract a field value near an order ID in the text
  function extractNearField(text, orderId, regex) {
    // Try to find the value near the order ID mention
    const idx = text.indexOf(orderId);
    if (idx === -1) {
      const match = text.match(regex);
      return match ? match[1].trim() : null;
    }
    // Search in a window around the order ID
    const window = text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 500));
    const match = window.match(regex);
    return match ? match[1].trim() : null;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // ───── Typing Indicator ─────

  function showTyping() {
    removeTyping(); // ensure only one
    const indicator = document.createElement('div');
    indicator.classList.add('typing-indicator');
    indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    messagesEl.appendChild(indicator);
    scrollToBottom();
    isBotTyping = true;
  }

  function removeTyping() {
    document.querySelectorAll('.typing-indicator').forEach(el => el.remove());
    isBotTyping = false;
  }

  // ───── Quick Reply Chips ─────

  function showQuickReplies(chips) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('quick-replies');
    chips.forEach(label => {
      const chip = document.createElement('button');
      chip.classList.add('quick-reply-chip');
      chip.textContent = label;
      chip.addEventListener('click', () => {
        // Remove all quick-reply containers
        document.querySelectorAll('.quick-replies').forEach(el => el.remove());
        handleUserMessage(label);
      });
      wrapper.appendChild(chip);
    });
    messagesEl.appendChild(wrapper);
    scrollToBottom();
  }

  function showProductCards(cards) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '10px';
    wrapper.style.alignSelf = 'flex-start';

    cards.forEach((card, index) => {
      const cardEl = document.createElement('a');
      cardEl.href = card.url;
      cardEl.target = '_blank';
      cardEl.classList.add('chat-product-card');
      cardEl.style.animationDelay = `${index * 0.15}s`;

      cardEl.innerHTML = `
        <div class="chat-product-tag">TOP PICK ♥</div>
        <img src="${card.img}" alt="${card.title}" class="chat-product-img">
        <div class="chat-product-info">
          <div class="chat-product-title">${card.title}</div>
          <div class="chat-product-arrow">→</div>
        </div>
      `;
      wrapper.appendChild(cardEl);
    });
    
    messagesEl.appendChild(wrapper);
    scrollToBottom();
  }

  // ═══════════════════════════════════════════════════════════
  // ATTACHMENT HANDLING
  // ═══════════════════════════════════════════════════════════

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      currentAttachmentFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        currentAttachment = e.target.result;
        previewImg.src = currentAttachment;
        attachmentPreview.classList.add('active');
        sendBtn.disabled = false; // allow sending just image
      };
      reader.readAsDataURL(file);
    }
  });

  removeAttachmentBtn.addEventListener('click', () => {
    currentAttachment = null;
    currentAttachmentFile = null;
    fileInput.value = '';
    attachmentPreview.classList.remove('active');
    if (input.value.trim().length === 0) {
      sendBtn.disabled = true;
    }
  });

  // ═══════════════════════════════════════════════════════════
  // USER INPUT HANDLING
  // ═══════════════════════════════════════════════════════════

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text && !currentAttachment) return;
    
    input.value = '';
    
    const attachmentToSend = currentAttachment;
    const fileToSend = currentAttachmentFile;
    
    // Clear attachment state
    currentAttachment = null;
    currentAttachmentFile = null;
    fileInput.value = '';
    attachmentPreview.classList.remove('active');
    
    handleUserMessage(text, attachmentToSend, fileToSend);
  });

  input.addEventListener('input', () => {
    // Keep send button always usable — never disable it
  });

  async function handleUserMessage(text, attachmentStr, attachmentFile) {
    // Remove any lingering quick-reply chips
    document.querySelectorAll('.quick-replies').forEach(el => el.remove());

    let attachments = [];

    // Upload image if there's a file
    if (attachmentFile) {
      try {
        const formData = new FormData();
        formData.append('image', attachmentFile);
        const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const upData = await upRes.json();
        if (upData.success) {
          attachments.push(upData.attachment);
        }
      } catch (e) {
        console.error('Upload failed:', e);
      }
    }

    // Show user message
    appendMessage('user', text, attachmentStr, true);

    // Update lastPoll before sending
    lastPoll = Date.now();

    // Show typing indicator
    showTyping();

    // Safety timeout — clear typing if bot never responds (45s)
    setTimeout(() => {
      if (isBotTyping) {
        removeTyping();
      }
    }, 45000);

    // Send to API → n8n
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text || '',
          author: 'Customer',
          attachments: attachments
        })
      });
    } catch (e) {
      console.error('Send failed:', e);
      removeTyping();
    }
  }

})();
