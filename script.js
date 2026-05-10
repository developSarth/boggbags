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

  function appendMessage(role, text, imgSrc = null, doScroll = true) {
    const msg = document.createElement('div');
    msg.classList.add('chat-msg', role);
    
    if (imgSrc) {
      const img = document.createElement('img');
      img.src = imgSrc;
      img.classList.add('chat-user-img');
      msg.appendChild(img);
    }
    
    if (text) {
      // Check if bot response contains product data
      const products = (role === 'bot') ? parseProductsFromText(text) : [];
      const orders = (role === 'bot') ? parseOrdersFromText(text) : [];
      
      if (products.length > 0) {
        // Show a clean text summary without the raw data
        const cleanText = getCleanBotText(text);
        if (cleanText) {
          const textSpan = document.createElement('div');
          textSpan.innerHTML = escapeHtml(cleanText).replace(/\n/g, '<br>');
          msg.appendChild(textSpan);
        }
        messagesEl.appendChild(msg);
        // Render product cards below the message
        renderProductCards(products);
      } else if (orders.length > 0) {
        const cleanText = getCleanBotText(text);
        if (cleanText) {
          const textSpan = document.createElement('div');
          textSpan.innerHTML = escapeHtml(cleanText).replace(/\n/g, '<br>');
          msg.appendChild(textSpan);
        }
        messagesEl.appendChild(msg);
        // Render order cards
        renderOrderCards(orders);
      } else {
        const textSpan = document.createElement('div');
        textSpan.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
        msg.appendChild(textSpan);
        messagesEl.appendChild(msg);
      }
    } else {
      messagesEl.appendChild(msg);
    }

    // Add decorative icons to bot messages
    if (role === 'bot') {
      const lastBotMsg = messagesEl.querySelector('.chat-msg.bot:last-of-type');
      if (lastBotMsg && !lastBotMsg.querySelector('.chat-msg-icon, .chat-msg-icon-left')) {
        const isStarfish = Math.random() > 0.5;
        const icon = document.createElement('div');
        icon.classList.add(isStarfish ? 'chat-msg-icon' : 'chat-msg-icon-left');
        icon.textContent = isStarfish ? '🌺' : '🐚';
        lastBotMsg.appendChild(icon);
      }
    }
    
    if (doScroll) scrollToBottom();
  }

  // ───── Parse product data from bot text ─────
  function parseProductsFromText(text) {
    const products = [];
    // Match product blocks: "Product: Name - Variant\nSKU/ID: ...\nPrice: $XX\nURL: ...\nStock Status: ..."
    const blocks = text.split('---').filter(b => b.trim());
    blocks.forEach(block => {
      const nameMatch = block.match(/Product:\s*(.+?)(?:\n|$)/);
      const priceMatch = block.match(/Price:\s*\$?([\d.]+)/);
      const urlMatch = block.match(/URL:\s*(https?:\/\/[^\s\n]+)/);
      const stockMatch = block.match(/Stock(?:\s*Status)?:\s*(.+?)(?:\n|$)/);
      const skuMatch = block.match(/SKU(?:\/ID)?:\s*(.+?)(?:\n|$)/);
      
      if (nameMatch && urlMatch) {
        products.push({
          name: nameMatch[1].trim(),
          price: priceMatch ? priceMatch[1] : null,
          url: urlMatch[1].trim(),
          stock: stockMatch ? stockMatch[1].trim() : null,
          sku: skuMatch ? skuMatch[1].trim() : null,
          slug: urlMatch[1].trim().replace('https://boggbag.com/products/', '')
        });
      }
    });
    return products;
  }

  // ───── Parse order data from bot text ─────
  function parseOrdersFromText(text) {
    const orders = [];
    const blocks = text.split('---').filter(b => b.trim());
    blocks.forEach(block => {
      const orderIdMatch = block.match(/Order\s*ID:\s*(.+?)(?:\n|$)/);
      const customerMatch = block.match(/Customer:\s*(.+?)(?:\n|$)/);
      const itemMatch = block.match(/Item:\s*(.+?)(?:\n|$)/);
      const statusMatch = block.match(/Status:\s*(.+?)(?:\n|$)/);
      const trackingMatch = block.match(/Tracking:\s*(.+?)(?:\n|$)/);
      const linkMatch = block.match(/Link:\s*(https?:\/\/[^\s\n]+)/);
      const amountMatch = block.match(/Amount:\s*\$?([\d.]+)/);
      
      if (orderIdMatch && statusMatch) {
        orders.push({
          orderId: orderIdMatch[1].trim(),
          customer: customerMatch ? customerMatch[1].trim() : '',
          item: itemMatch ? itemMatch[1].trim() : '',
          status: statusMatch[1].trim(),
          tracking: trackingMatch ? trackingMatch[1].trim() : '',
          trackingLink: linkMatch ? linkMatch[1].trim() : '',
          amount: amountMatch ? amountMatch[1] : null
        });
      }
    });
    return orders;
  }

  // ───── Clean bot text (remove raw data blocks) ─────
  function getCleanBotText(text) {
    // Remove the raw structured data, keep only the conversational part
    // Remove lines that look like "Product: ...", "SKU: ...", etc.
    const lines = text.split('\n');
    const cleanLines = lines.filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (/^(Product|SKU|Price|URL|Stock|Tracking|Link|Order\s*ID|Customer|Email|Item|Qty|Date|Amount|---)/i.test(t)) return false;
      if (/^\[API RESPONSE/i.test(t)) return false;
      if (/^Found \d+ (product|order|matching)/i.test(t)) return true;
      return true;
    });
    return cleanLines.join('\n').trim();
  }

  // ───── Render Product Cards ─────
  function renderProductCards(products) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('product-cards-wrapper');

    products.forEach((product, index) => {
      const card = document.createElement('a');
      card.href = product.url;
      card.target = '_blank';
      card.rel = 'noopener';
      card.classList.add('chat-product-card-v2');
      card.style.animationDelay = `${index * 0.12}s`;

      // Stock badge
      const isInStock = product.stock && (product.stock.includes('IN STOCK') || product.stock.includes('✅'));
      const isLow = product.stock && product.stock.includes('LOW');
      const isOut = product.stock && (product.stock.includes('OUT') || product.stock.includes('❌'));
      const stockClass = isOut ? 'out' : isLow ? 'low' : 'in';
      const stockLabel = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';

      card.innerHTML = `
        <div class="pcv2-img-wrap">
          <div class="pcv2-img-placeholder">
            <div class="pcv2-spinner"></div>
          </div>
          <div class="pcv2-badge ${stockClass}">${stockLabel}</div>
        </div>
        <div class="pcv2-body">
          <div class="pcv2-name">${escapeHtml(product.name)}</div>
          <div class="pcv2-meta">
            ${product.price ? `<span class="pcv2-price">$${product.price}</span>` : ''}
            ${product.sku ? `<span class="pcv2-sku">${escapeHtml(product.sku)}</span>` : ''}
          </div>
          <div class="pcv2-cta">View Product <span>→</span></div>
        </div>
      `;

      wrapper.appendChild(card);

      // Fetch real product image asynchronously
      if (product.slug) {
        fetchProductImage(product.slug, card);
      }
    });

    messagesEl.appendChild(wrapper);
    scrollToBottom();
  }

  // ───── Fetch product image from server proxy ─────
  async function fetchProductImage(slug, cardEl) {
    try {
      const res = await fetch(`/api/product-image?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (data.image) {
        const imgWrap = cardEl.querySelector('.pcv2-img-wrap');
        const placeholder = imgWrap.querySelector('.pcv2-img-placeholder');
        const img = document.createElement('img');
        img.src = data.image;
        img.alt = 'Product';
        img.classList.add('pcv2-img');
        img.onload = () => {
          if (placeholder) placeholder.remove();
          imgWrap.prepend(img);
        };
        img.onerror = () => {
          // Keep placeholder with a bag emoji
          const ph = imgWrap.querySelector('.pcv2-img-placeholder');
          if (ph) ph.innerHTML = '<span style="font-size:40px">👜</span>';
        };
      } else {
        const ph = cardEl.querySelector('.pcv2-img-placeholder');
        if (ph) ph.innerHTML = '<span style="font-size:40px">👜</span>';
      }
    } catch (e) {
      const ph = cardEl.querySelector('.pcv2-img-placeholder');
      if (ph) ph.innerHTML = '<span style="font-size:40px">👜</span>';
    }
  }

  // ───── Render Order Cards ─────
  function renderOrderCards(orders) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('order-cards-wrapper');

    orders.forEach((order, index) => {
      const card = document.createElement('div');
      card.classList.add('chat-order-card');
      card.style.animationDelay = `${index * 0.12}s`;

      const statusClass = order.status.includes('Delivered') ? 'delivered' :
                           order.status.includes('Shipped') || order.status.includes('Delivery') ? 'shipped' :
                           'processing';

      card.innerHTML = `
        <div class="order-card-header">
          <span class="order-id">${escapeHtml(order.orderId)}</span>
          <span class="order-status ${statusClass}">${escapeHtml(order.status)}</span>
        </div>
        <div class="order-card-body">
          ${order.item ? `<div class="order-item">📦 ${escapeHtml(order.item)}</div>` : ''}
          ${order.customer ? `<div class="order-detail">👤 ${escapeHtml(order.customer)}</div>` : ''}
          ${order.amount ? `<div class="order-detail">💰 $${order.amount}</div>` : ''}
          ${order.tracking && order.tracking !== 'N/A' ? `
            <a href="${order.trackingLink || '#'}" target="_blank" class="order-tracking-btn">
              🚚 Track: ${escapeHtml(order.tracking)}
            </a>
          ` : ''}
        </div>
      `;

      wrapper.appendChild(card);
    });

    messagesEl.appendChild(wrapper);
    scrollToBottom();
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
