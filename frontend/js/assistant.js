/**
 * NEXA AI Intelligence Assistant
 * Context-aware hostel intelligence with rich conversation UI, typing effects,
 * quick chips, and message history across all portals.
 */

(function() {
    'use strict';

    const QUICK_CHIPS = [
        { label: 'Outpass Rules', q: 'What are the outpass and movement rules for students?' },
        { label: 'Check My Pass', q: 'How do I check my current outpass status?' },
        { label: 'Why Flagged?', q: 'Why was my outpass flagged by the risk engine?' },
        { label: 'Gate Timings', q: 'What are the evening gate closing times and late return grace periods?' },
        { label: 'View Fines', q: 'How are late return fines calculated and applied?' },
        { label: 'Guardian Alerts', q: 'When are guardian notifications sent automatically?' }
    ];

    const FALLBACK_RESPONSES = [
        'I was unable to retrieve data at this moment. Please verify the server is running and try again.',
        'Connection to the intelligence engine failed. Your hostel administrator may need to check the backend service.',
        'Temporarily offline. NEXA AI will resume when server connectivity is restored.'
    ];

    let messageHistory = [];
    let isOpen = false;

    function createAssistantUI() {
        if (document.getElementById('nexa-assistant-root')) return;

        const root = document.createElement('div');
        root.id = 'nexa-assistant-root';
        root.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;font-family:Inter,sans-serif;';

        root.innerHTML = `
        <!-- Trigger Button -->
        <button id="nexa-trigger" aria-label="Open NEXA AI Assistant" style="
            display:flex;align-items:center;gap:0.5rem;
            background:linear-gradient(135deg,#1e3a5f 0%,#1e40af 50%,#1d4ed8 100%);
            color:white;border:1px solid rgba(59,130,246,0.4);
            padding:0.65rem 1.1rem;border-radius:9999px;
            box-shadow:0 8px 32px rgba(59,130,246,0.35),0 2px 8px rgba(0,0,0,0.4);
            cursor:pointer;font-size:0.8125rem;font-weight:700;
            transition:transform 0.2s,box-shadow 0.2s;
            letter-spacing:0.02em;position:relative;overflow:hidden;
        " onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 12px 40px rgba(59,130,246,0.45),0 4px 12px rgba(0,0,0,0.4)'"
           onmouseleave="this.style.transform='translateY(0)';this.style.boxShadow='0 8px 32px rgba(59,130,246,0.35),0 2px 8px rgba(0,0,0,0.4)'">
            <span style="position:absolute;top:-1px;right:-1px;display:flex;width:10px;height:10px;">
                <span style="position:absolute;display:inline-flex;width:100%;height:100%;border-radius:50%;background:#34d399;opacity:0.75;animation:nexaPing 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>
                <span style="position:relative;display:inline-flex;border-radius:50%;width:10px;height:10px;background:#10b981;"></span>
            </span>
            <svg style="width:16px;height:16px;flex-shrink:0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <span id="nexa-trigger-label">NEXA AI</span>
        </button>

        <!-- Chat Window -->
        <div id="nexa-modal" role="dialog" aria-label="NEXA AI Assistant" style="
            display:none;
            position:absolute;bottom:calc(100% + 12px);right:0;
            width:380px;max-width:calc(100vw - 2rem);
            background:rgba(10,15,30,0.97);
            border:1px solid rgba(30,41,59,0.9);
            border-radius:1.25rem;
            box-shadow:0 24px 64px rgba(0,0,0,0.6),0 0 0 1px rgba(59,130,246,0.08);
            backdrop-filter:blur(20px);
            overflow:hidden;
            display:none;
            flex-direction:column;
            height:500px;
        ">
            <!-- Header -->
            <div style="
                background:linear-gradient(135deg,rgba(15,23,42,1) 0%,rgba(17,24,39,1) 100%);
                border-bottom:1px solid rgba(30,41,59,0.8);
                padding:1rem 1rem 0.875rem;
                display:flex;align-items:center;justify-content:space-between;
                flex-shrink:0;
            ">
                <div style="display:flex;align-items:center;gap:0.625rem;">
                    <div style="
                        width:2.25rem;height:2.25rem;border-radius:0.625rem;
                        background:linear-gradient(135deg,rgba(37,99,235,0.25),rgba(99,102,241,0.2));
                        border:1px solid rgba(59,130,246,0.3);
                        display:flex;align-items:center;justify-content:center;
                    ">
                        <svg style="width:1rem;height:1rem;color:#60a5fa" fill="none" stroke="#60a5fa" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    </div>
                    <div>
                        <div style="font-size:0.875rem;font-weight:800;color:white;line-height:1.2;letter-spacing:-0.01em;">NEXA AI</div>
                        <div style="font-size:0.6875rem;color:#34d399;font-weight:600;display:flex;align-items:center;gap:0.3rem;">
                            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;"></span>
                            Hostel Intelligence Online
                        </div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <button id="nexa-clear" title="Clear conversation" style="
                        background:rgba(30,41,59,0.6);border:1px solid rgba(51,65,85,0.6);
                        color:#94a3b8;border-radius:0.5rem;padding:0.375rem;cursor:pointer;
                        display:flex;align-items:center;justify-content:center;transition:all 0.2s;
                    " onmouseenter="this.style.color='#e2e8f0';this.style.borderColor='rgba(100,116,139,0.6)'"
                       onmouseleave="this.style.color='#94a3b8';this.style.borderColor='rgba(51,65,85,0.6)'">
                        <svg style="width:0.875rem;height:0.875rem" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                    <button id="nexa-close" title="Close assistant" style="
                        background:rgba(30,41,59,0.6);border:1px solid rgba(51,65,85,0.6);
                        color:#94a3b8;border-radius:0.5rem;padding:0.375rem;cursor:pointer;
                        display:flex;align-items:center;justify-content:center;transition:all 0.2s;
                    " onmouseenter="this.style.color='#e2e8f0';this.style.borderColor='rgba(100,116,139,0.6)'"
                       onmouseleave="this.style.color='#94a3b8';this.style.borderColor='rgba(51,65,85,0.6)'">
                        <svg style="width:0.875rem;height:0.875rem" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>

            <!-- Quick Chips -->
            <div id="nexa-chips" style="
                background:rgba(10,15,30,0.6);
                border-bottom:1px solid rgba(30,41,59,0.5);
                padding:0.5rem;
                display:flex;gap:0.375rem;overflow-x:auto;flex-shrink:0;
                scrollbar-width:none;
            "></div>

            <!-- Messages -->
            <div id="nexa-messages" style="
                flex:1;overflow-y:auto;padding:1rem;
                display:flex;flex-direction:column;gap:0.75rem;
                scrollbar-width:thin;scrollbar-color:rgba(51,65,85,0.5) transparent;
            "></div>

            <!-- Input Bar -->
            <div style="
                background:rgba(10,15,30,0.8);
                border-top:1px solid rgba(30,41,59,0.7);
                padding:0.75rem;flex-shrink:0;
                display:flex;gap:0.5rem;align-items:center;
            ">
                <input id="nexa-input" type="text" placeholder="Ask about outpasses, gate timings, rules..." autocomplete="off" style="
                    flex:1;background:rgba(15,23,42,0.8);
                    border:1px solid rgba(30,41,59,0.9);border-radius:0.75rem;
                    padding:0.5625rem 0.875rem;font-size:0.8rem;color:white;outline:none;
                    font-family:Inter,sans-serif;transition:border-color 0.2s,box-shadow 0.2s;
                " onfocus="this.style.borderColor='rgba(59,130,246,0.6)';this.style.boxShadow='0 0 0 3px rgba(59,130,246,0.1)'"
                   onblur="this.style.borderColor='rgba(30,41,59,0.9)';this.style.boxShadow='none'">
                <button id="nexa-send" style="
                    background:linear-gradient(135deg,#2563eb,#4f46e5);
                    border:none;border-radius:0.75rem;
                    width:2.25rem;height:2.25rem;
                    display:flex;align-items:center;justify-content:center;
                    cursor:pointer;flex-shrink:0;
                    box-shadow:0 4px 12px rgba(37,99,235,0.3);
                    transition:transform 0.15s,box-shadow 0.15s;
                " onmouseenter="this.style.transform='scale(1.05)'"
                   onmouseleave="this.style.transform='scale(1)'">
                    <svg style="width:0.875rem;height:0.875rem;color:white" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </button>
            </div>
        </div>

        <style>
            @keyframes nexaPing { 75%,100% { transform:scale(2); opacity:0; } }
            @keyframes nexaFadeIn { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
            @keyframes nexaSlideIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
            #nexa-messages::-webkit-scrollbar { width:4px; }
            #nexa-messages::-webkit-scrollbar-track { background:transparent; }
            #nexa-messages::-webkit-scrollbar-thumb { background:rgba(51,65,85,0.5); border-radius:2px; }
            #nexa-chips::-webkit-scrollbar { display:none; }
            @keyframes nexaDot { 0%,80%,100% { transform:scale(0.6); opacity:0.4; } 40% { transform:scale(1); opacity:1; } }
        </style>
        `;

        document.body.appendChild(root);

        const trigger = root.querySelector('#nexa-trigger');
        const modal = root.querySelector('#nexa-modal');
        const closeBtn = root.querySelector('#nexa-close');
        const clearBtn = root.querySelector('#nexa-clear');
        const input = root.querySelector('#nexa-input');
        const sendBtn = root.querySelector('#nexa-send');
        const messages = root.querySelector('#nexa-messages');
        const chipsContainer = root.querySelector('#nexa-chips');

        // Build chips
        QUICK_CHIPS.forEach(function(chip) {
            var btn = document.createElement('button');
            btn.textContent = chip.label;
            btn.title = chip.q;
            btn.style.cssText = 'white-space:nowrap;padding:0.25rem 0.625rem;font-size:0.6875rem;font-weight:600;color:#94a3b8;background:rgba(30,41,59,0.6);border:1px solid rgba(51,65,85,0.6);border-radius:9999px;cursor:pointer;font-family:Inter,sans-serif;transition:all 0.2s;flex-shrink:0;';
            btn.addEventListener('mouseenter', function() { this.style.color = '#e2e8f0'; this.style.borderColor = 'rgba(59,130,246,0.5)'; this.style.background = 'rgba(37,99,235,0.15)'; });
            btn.addEventListener('mouseleave', function() { this.style.color = '#94a3b8'; this.style.borderColor = 'rgba(51,65,85,0.6)'; this.style.background = 'rgba(30,41,59,0.6)'; });
            btn.addEventListener('click', function() { sendMessage(chip.q); });
            chipsContainer.appendChild(btn);
        });

        // Welcome message
        addAIMessage("Hello! I'm **NEXA AI**, your institutional hostel intelligence assistant.\n\nI can help with outpass rules, movement policies, risk score explanations, gate closing schedules, and more. Use the quick chips above or type your question below.");

        // Toggle open/close
        trigger.addEventListener('click', function() {
            isOpen = !isOpen;
            if (isOpen) {
                modal.style.display = 'flex';
                modal.style.animation = 'nexaFadeIn 0.25s ease-out';
                input.focus();
            } else {
                modal.style.display = 'none';
            }
        });

        closeBtn.addEventListener('click', function() {
            isOpen = false;
            modal.style.display = 'none';
        });

        clearBtn.addEventListener('click', function() {
            messages.innerHTML = '';
            messageHistory = [];
            addAIMessage("Conversation cleared. How can I assist you?");
        });

        sendBtn.addEventListener('click', function() { sendMessage(input.value); });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); }
        });

        function addUserMessage(text) {
            var el = document.createElement('div');
            el.style.cssText = 'display:flex;justify-content:flex-end;animation:nexaSlideIn 0.2s ease-out;';
            el.innerHTML = '<div style="max-width:82%;background:linear-gradient(135deg,#1d4ed8,#4338ca);color:white;border-radius:1rem 1rem 0.25rem 1rem;padding:0.625rem 0.875rem;font-size:0.8125rem;line-height:1.55;font-family:Inter,sans-serif;">' + escapeHtml(text) + '</div>';
            messages.appendChild(el);
            messages.scrollTop = messages.scrollHeight;
        }

        function addAIMessage(text) {
            var el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:flex-start;gap:0.5rem;animation:nexaSlideIn 0.2s ease-out;';
            var avatar = '<div style="width:1.75rem;height:1.75rem;border-radius:0.5rem;background:linear-gradient(135deg,rgba(37,99,235,0.3),rgba(99,102,241,0.2));border:1px solid rgba(59,130,246,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;"><svg style="width:0.875rem;height:0.875rem" fill="none" stroke="#60a5fa" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></div>';
            var bubble = '<div style="max-width:86%;background:rgba(15,23,42,0.8);border:1px solid rgba(30,41,59,0.8);color:#cbd5e1;border-radius:0.25rem 1rem 1rem 1rem;padding:0.625rem 0.875rem;font-size:0.8125rem;line-height:1.6;font-family:Inter,sans-serif;">' + formatMarkdown(text) + '</div>';
            el.innerHTML = avatar + bubble;
            messages.appendChild(el);
            messages.scrollTop = messages.scrollHeight;
        }

        function addTypingIndicator() {
            var el = document.createElement('div');
            el.id = 'nexa-typing';
            el.style.cssText = 'display:flex;align-items:flex-start;gap:0.5rem;animation:nexaSlideIn 0.2s ease-out;';
            el.innerHTML = '<div style="width:1.75rem;height:1.75rem;border-radius:0.5rem;background:linear-gradient(135deg,rgba(37,99,235,0.3),rgba(99,102,241,0.2));border:1px solid rgba(59,130,246,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;"><svg style="width:0.875rem;height:0.875rem" fill="none" stroke="#60a5fa" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></div>'
                + '<div style="background:rgba(15,23,42,0.8);border:1px solid rgba(30,41,59,0.8);border-radius:0.25rem 1rem 1rem 1rem;padding:0.625rem 0.875rem;display:flex;align-items:center;gap:4px;">'
                + '<span style="width:6px;height:6px;background:#60a5fa;border-radius:50%;animation:nexaDot 1.4s infinite ease-in-out;"></span>'
                + '<span style="width:6px;height:6px;background:#60a5fa;border-radius:50%;animation:nexaDot 1.4s infinite ease-in-out 0.2s;"></span>'
                + '<span style="width:6px;height:6px;background:#60a5fa;border-radius:50%;animation:nexaDot 1.4s infinite ease-in-out 0.4s;"></span>'
                + '</div>';
            messages.appendChild(el);
            messages.scrollTop = messages.scrollHeight;
            return el;
        }

        async function sendMessage(text) {
            if (!text || !text.trim()) return;
            var q = text.trim();
            input.value = '';
            addUserMessage(q);
            messageHistory.push({ role: 'user', content: q });

            var typingEl = addTypingIndicator();

            try {
                var res = await API.askAssistant(q);
                typingEl.remove();
                var reply = (res && res.response) ? res.response : FALLBACK_RESPONSES[0];
                addAIMessage(reply);
                messageHistory.push({ role: 'assistant', content: reply });
            } catch(err) {
                typingEl.remove();
                var errMsg = FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
                addAIMessage(errMsg);
            }

            // Limit history
            if (messageHistory.length > 40) messageHistory = messageHistory.slice(-40);
        }

        function escapeHtml(str) {
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        function formatMarkdown(text) {
            // Bold
            text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0;font-weight:700;">$1</strong>');
            // Inline code
            text = text.replace(/`(.+?)`/g, '<code style="background:rgba(30,41,59,0.8);color:#93c5fd;padding:0.1em 0.3em;border-radius:0.25rem;font-size:0.85em;font-family:monospace;">$1</code>');
            // Bullet points
            text = text.replace(/^[-•]\s(.+)$/gm, '<li style="margin:0.2rem 0 0.2rem 0.75rem;list-style-type:disc;color:#cbd5e1;">$1</li>');
            text = text.replace(/(<li.+<\/li>)/s, '<ul style="margin:0.25rem 0;padding:0;">$1</ul>');
            // Line breaks
            text = text.replace(/\n/g, '<br>');
            return text;
        }
    }

    // Auto-initialize on authenticated pages
    document.addEventListener('DOMContentLoaded', function() {
        if (localStorage.getItem('nexaguard_token')) {
            createAssistantUI();
        }
    });

    // Also expose globally for manual init
    window.initNexaAssistant = createAssistantUI;

})();
