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
      loadMessages();
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
      const textSpan = document.createElement('div');
      textSpan.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
      msg.appendChild(textSpan);
    }

    // Add decorative icons to bot messages
    if (role === 'bot') {
      const isStarfish = Math.random() > 0.5;
      const icon = document.createElement('div');
      icon.classList.add(isStarfish ? 'chat-msg-icon' : 'chat-msg-icon-left');
      icon.textContent = isStarfish ? '🌺' : '🐚';
      msg.appendChild(icon);
    }
    
    messagesEl.appendChild(msg);
    if (doScroll) scrollToBottom();
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
    if ((!text && !currentAttachment) || isBotTyping) return;
    
    input.value = '';
    
    const attachmentToSend = currentAttachment;
    const fileToSend = currentAttachmentFile;
    
    // Clear attachment state
    currentAttachment = null;
    currentAttachmentFile = null;
    fileInput.value = '';
    attachmentPreview.classList.remove('active');
    sendBtn.disabled = true;
    
    handleUserMessage(text, attachmentToSend, fileToSend);
  });

  input.addEventListener('input', () => {
    sendBtn.disabled = (input.value.trim().length === 0 && !currentAttachment);
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
