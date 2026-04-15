// Initialization of Markdown parser
marked.setOptions({
  highlight: function(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-'
});

let currentSessionId = "session_" + Date.now();
let chatSessions = JSON.parse(localStorage.getItem("chatSessions")) || {};
let chatTitles = JSON.parse(localStorage.getItem("chatTitles")) || {};

// Function to save everything
function saveData() {
    localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    localStorage.setItem("chatTitles", JSON.stringify(chatTitles));
}

// On page load, populate sidebar
window.onload = () => {
    populateSidebar();
    startNewChat(false); // start a new screen, but keep history in sidebar
};

function populateSidebar() {
    const chatList = document.getElementById("chat-list");
    chatList.innerHTML = "";
    Object.keys(chatTitles).reverse().forEach(sessionId => {
        const title = chatTitles[sessionId];
        const el = document.createElement("div");
        el.className = "chat-history-item " + (sessionId === currentSessionId ? "active" : "");
        el.id = "btn-" + sessionId;
        el.innerText = title;
        el.onclick = () => loadChat(sessionId);
        
        const delBtn = document.createElement("button");
        delBtn.className = "delete-chat-btn";
        delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        delBtn.onclick = (e) => {
            e.stopPropagation(); // so it doesn't trigger loadChat
            deleteChat(sessionId);
        };
        el.appendChild(delBtn);

        chatList.appendChild(el);
    });
}

function deleteChat(id) {
    if(confirm("Bu sohbeti çevrimdışı önbellekten kalıcı olarak silmek istediğinize emin misiniz?")) {
        delete chatSessions[id];
        delete chatTitles[id];
        saveData();
        if(currentSessionId === id) {
            startNewChat();
        } else {
            populateSidebar();
        }
    }
}

function filterChats() {
    const term = document.getElementById("chat-search").value.toLowerCase();
    const items = document.querySelectorAll(".chat-history-item");
    items.forEach(item => {
        const sessionId = item.id.replace("btn-", ""); // btn-session_...
        let isMatch = item.innerText.toLowerCase().includes(term);

        // Eğer başlıkta yoksa, sohbetin kendi mesaj içeriklerinde ara
        if (!isMatch && chatSessions[sessionId]) {
            for (let i = 0; i < chatSessions[sessionId].length; i++) {
                if (chatSessions[sessionId][i].role !== "system" && chatSessions[sessionId][i].content.toLowerCase().includes(term)) {
                    isMatch = true;
                    break;
                }
            }
        }

        if (isMatch) {
            item.style.display = "block";
        } else {
            item.style.display = "none";
        }
    });
}

function startNewChat(generateNewId = true) {
    if (generateNewId) {
        currentSessionId = "session_" + Date.now();
    }
    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML = `
        <div class="message-wrapper bot">
            <div class="message">Yeni bir sohbete başladık. Dinliyorum!</div>
        </div>
    `;
    populateSidebar();
}

function loadChat(sessionId) {
    currentSessionId = sessionId;
    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML = ""; // Ekranı temizle
    
    // Load old messages
    if (chatSessions[sessionId]) {
        chatSessions[sessionId].forEach(msg => {
            if (msg.role === "system") return; // sistem komutunu uide gösterme
            
            const wrapper = document.createElement('div');
            wrapper.className = `message-wrapper ${msg.role === 'user' ? 'user' : 'bot'}`;
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message';
            
            if (msg.role === 'user') {
                let text = msg.content;
                if (Array.isArray(msg.content)) {
                    text = msg.content[0].text; // Resim varsa yazıyı al
                }
                // Strip the hidden prompt from UI if it was appended
                if (text.includes("[SİSTEM BİLGİSİ:")) {
                    text = text.split("[SİSTEM BİLGİSİ:")[0].trim();
                }
                if (text.includes("(SYSTEM TARGET:")) { // Eksi hackleri temizlemek için
                    text = text.split("(SYSTEM TARGET:")[0].trim();
                }
                
                messageDiv.innerText = text;
            } else {
                let parsedContent = msg.content;
                parsedContent = formatCustomTags(parsedContent);
                messageDiv.innerHTML = marked.parse(parsedContent);
                processCodeBlocks(messageDiv);
            }
            
            wrapper.appendChild(messageDiv);
            chatBox.appendChild(wrapper);
        });
    }

    populateSidebar(); 
    setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 50);
}

function updateSidebar(firstMessage) {
    if (!chatTitles[currentSessionId]) {
        let title = firstMessage.length > 25 ? firstMessage.substring(0, 25) + "..." : firstMessage;
        chatTitles[currentSessionId] = title;
        saveData();
        populateSidebar();
    }
}

async function sendMessage() {
    const inputField = document.getElementById("user-input");
    const chatBox = document.getElementById("chat-box");
    const message = inputField.value.trim();
    const modelSelect = document.getElementById("model-select").value;
    const systemPrompt = document.getElementById("system-prompt").value.trim();

    if (!message) return;

    if (!chatSessions[currentSessionId]) {
        chatSessions[currentSessionId] = [];
    }

    // İlk mesajsa ve sistem komutu varsa en başa ekle
    if (chatSessions[currentSessionId].length === 0 && systemPrompt) {
        chatSessions[currentSessionId].push({ role: "system", content: systemPrompt });
    }

    // Fotoğraf Çizme Hilesi (Pollinations.ai)
    const imgKeywords = ["çiz", "fotoğraf", "resim", "üret", "oluştur", "draw", "image", "picture"];
    let isImageRequest = false;
    for (let word of imgKeywords) {
        if (message.toLowerCase().includes(word) && (message.toLowerCase().includes("bana") || message.toLowerCase().includes("bir") || message.toLowerCase().includes("foto") || message.toLowerCase().includes("resim"))) {
            isImageRequest = true;
            break;
        }
    }

    let finalMessageContent = message;
    if (isImageRequest) {
        finalMessageContent += "\n\n[SİSTEM BİLGİSİ: GİZLİ GÖREV. KULLANICI RESİM VEYA FOTOĞRAF İSTİYOR. Sadece şu formatta cevap ver, başka BİR ŞEY YAZMA: [IMAGE: {BURAYA İNGİLİZCE ÇOK DETAYLI BİR GÖRSEL TASVİRİ YAZ}]]";
    }

    // Arayüze Ekle
    chatBox.innerHTML += `
        <div class="message-wrapper user">
            <div class="message">${message}</div>
        </div>
    `;
    inputField.value = "";
    
    // Hafızaya Kaydet
    chatSessions[currentSessionId].push({ role: "user", content: finalMessageContent });
    saveData();
    updateSidebar(message);

    chatBox.scrollTop = chatBox.scrollHeight;

    const loadingId = "loading-" + Date.now();
    chatBox.innerHTML += `
        <div class="message-wrapper bot" id="${loadingId}">
            <div class="message">Yazılıyor... ✍️</div>
        </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                model: modelSelect,
                messages: chatSessions[currentSessionId]
            })
        });

        const data = await response.json();
        document.getElementById(loadingId).remove();
        
        if (response.ok) {
            const aiReply = data.reply;
            chatSessions[currentSessionId].push({ role: "assistant", content: aiReply });
            saveData();
            
            // Simüle Edilmiş Yazı Yazma Efekti (Streaming)
            simulateTyping(aiReply);
            
        } else {
            throw new Error();
        }

    } catch (error) {
        if(document.getElementById(loadingId)) document.getElementById(loadingId).remove();
        chatBox.innerHTML += `
            <div class="message-wrapper bot">
                <div class="message" style="color:#f87171">Bağlantı hatası oluştu. Lütfen tekrar deneyin.</div>
            </div>
        `;
    }
}

function formatCustomTags(text) {
    // [IMAGE: prompt] tag'ini yakala ve HTML'ye çevir (veya url encode yap)
    return text.replace(/\[IMAGE:([\s\S]*?)\]/gi, (match, prompt) => {
        const encodedPrompt = encodeURIComponent(prompt.trim().replace(/\n/g, ' '));
        return `\n\n<img src="https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=800&nologo=true" style="border-radius:12px; max-width:100%; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);" onload="document.getElementById('chat-box').scrollTop = document.getElementById('chat-box').scrollHeight;" alt="AI Üretimi Görsel">\n\n`;
    });
}

function simulateTyping(fullText) {
    const chatBox = document.getElementById("chat-box");
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper bot';
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    wrapper.appendChild(messageDiv);
    chatBox.appendChild(wrapper);

    let index = 0;
    const speed = fullText.length > 500 ? 5 : 2; 
    
    function typeChunk() {
        if (index < fullText.length) {
            index += speed;
            // Markdown yap, SONRA custom tag'leri (IMAGE) değiştir. 
            // Böylece yazı bitmeden resim kırık HTML olarak yüklenmeye çalışmaz!
            let partialText = fullText.substring(0, index) + (index < fullText.length ? '...' : '');
            let currentHTML = marked.parse(partialText);
            currentHTML = formatCustomTags(currentHTML);
            
            messageDiv.innerHTML = currentHTML;
            chatBox.scrollTop = chatBox.scrollHeight;
            requestAnimationFrame(typeChunk);
        } else {
            let finalHTML = marked.parse(fullText);
            messageDiv.innerHTML = formatCustomTags(finalHTML);
            processCodeBlocks(messageDiv);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }
    requestAnimationFrame(typeChunk);
}

function toggleDropdown() {
    document.getElementById("model-dropdown").classList.toggle("open");
    document.querySelector(".dropdown-selected").classList.toggle("is-active");
}

function selectModel(modelValue, event) {
    document.getElementById("model-select").value = modelValue;
    document.getElementById("selected-model-text").textContent = modelValue;
    
    // Aktif class'ı taşı
    document.querySelectorAll(".dropdown-option").forEach(el => el.classList.remove("active"));
    event.currentTarget.classList.add("active");
    
    toggleDropdown(); // Seçtikten sonra menüyü kapat
}

// Menü dışında bir yere tıklanınca kapat
document.addEventListener('click', (event) => {
    const dropdown = document.getElementById("model-dropdown");
    if (dropdown && !dropdown.contains(event.target) && dropdown.classList.contains("open")) {
        dropdown.classList.remove("open");
        document.querySelector(".dropdown-selected").classList.remove("is-active");
    }
});

function processCodeBlocks(messageDiv) {
    const preBlocks = messageDiv.querySelectorAll('pre');
    preBlocks.forEach(pre => {
        if (!pre.querySelector('.copy-btn')) {
            const btnGroup = document.createElement('div');
            btnGroup.style.position = 'absolute';
            btnGroup.style.top = '8px';
            btnGroup.style.right = '8px';
            btnGroup.style.display = 'flex';
            btnGroup.style.gap = '5px';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.style.position = 'relative';
            copyBtn.style.top = '0';
            copyBtn.style.right = '0';
            copyBtn.innerText = 'Kopyala';
            copyBtn.addEventListener('click', () => {
                const code = pre.querySelector('code').textContent;
                navigator.clipboard.writeText(code).then(() => {
                    copyBtn.innerText = 'Kopyalandı!';
                    setTimeout(() => copyBtn.innerText = 'Kopyala', 2000);
                });
            });

            const canvasBtn = document.createElement('button');
            canvasBtn.className = 'copy-btn';
            canvasBtn.style.position = 'relative';
            canvasBtn.style.top = '0';
            canvasBtn.style.right = '0';
            canvasBtn.style.background = 'rgba(99, 102, 241, 0.2)';
            canvasBtn.innerText = 'Canvas Aç';
            canvasBtn.addEventListener('click', () => {
                const codeNode = pre.querySelector('code');
                openCanvas(codeNode.textContent, codeNode.className);
            });

            btnGroup.appendChild(copyBtn);
            btnGroup.appendChild(canvasBtn);
            pre.appendChild(btnGroup);
        }
    });

    // Handle Pollinations AI image loading properly inside chats
    const images = messageDiv.querySelectorAll('img');
    images.forEach(img => {
        if(img.src.includes('pollinations')) {
            img.style.borderRadius = '12px';
            img.style.maxWidth = '100%';
            img.style.marginTop = '10px';
            img.onload = () => {
                const chatBox = document.getElementById("chat-box");
                chatBox.scrollTop = chatBox.scrollHeight;
            };
        }
    });
}

function openCanvas(code, className) {
    const panel = document.getElementById('canvas-panel');
    const codeBlock = document.getElementById('canvas-code');
    
    // Uygula ve renklendir
    codeBlock.className = className || 'language-plaintext';
    codeBlock.textContent = code;
    hljs.highlightElement(codeBlock);

    // Her açılışta Kod sekmesinde başla
    switchCanvasTab('code');

    panel.classList.add('active');
}

function closeCanvas() {
    const panel = document.getElementById('canvas-panel');
    panel.classList.remove('active');
}

function switchCanvasTab(tabName) {
    const pre = document.getElementById("canvas-pre");
    const iframe = document.getElementById("canvas-iframe");
    const tabCode = document.getElementById("tab-code");
    const tabPreview = document.getElementById("tab-preview");

    if (!pre || !iframe) return; // Prevent errors if DOM isn't updated yet

    if (tabName === 'code') {
        pre.style.display = "block";
        iframe.style.display = "none";
        tabCode.classList.add("active");
        tabPreview.classList.remove("active");
    } else {
        pre.style.display = "none";
        iframe.style.display = "block";
        tabCode.classList.remove("active");
        tabPreview.classList.add("active");
        
        // Kodu run et
        const code = document.getElementById("canvas-code").textContent;
        iframe.srcdoc = code;
    }
}

document.getElementById("user-input").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
});

function handleFileUpload(event) {}

function importGithub() {
    const modal = document.getElementById("github-modal");
    modal.classList.add("active");
    const input = document.getElementById("github-url-input");
    input.value = "";
    input.focus();
}

function closeGithubModal() {
    document.getElementById("github-modal").classList.remove("active");
}

async function submitGithubModal() {
    const url = document.getElementById("github-url-input").value.trim();
    if (!url) return;
    
    closeGithubModal();
    
    try {
        let fetchUrl = url;

        // URL parsing to prevent full repo import attempts
        const cleanUrl = url.replace("https://", "").replace("http://", "");
        const parts = cleanUrl.split("/");
        
        if (parts.length <= 3 && parts[0] === "github.com") {
            const chatBox = document.getElementById("chat-box");
            chatBox.innerHTML += `
                <div class="message-wrapper bot">
                    <div class="message" style="color:#ef4444; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); padding: 12px; border-radius: 8px;">⚠️ <b>GitHub Hata:</b> Tüm repo klasörünü yüklemeye çalıştınız. Lütfen şimdilik repo içerisinden belirli bir kod dosyasının (Örn: main.cpp) linkini girin.</div>
                </div>
            `;
            chatBox.scrollTop = chatBox.scrollHeight;
            return;
        }

        if (url.includes("github.com") && !url.includes("raw.githubusercontent.com")) {
            fetchUrl = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/").replace("/tree/", "/");
        }

        const response = await fetch(fetchUrl);
        if(!response.ok) throw new Error("Dosya bulunamadı");
        
        const code = await response.text();
        const inputField = document.getElementById("user-input");
        
        const filename = parts[parts.length - 1] || "kod_dosyasi";
        
        inputField.value += `\nLütfen şu **${filename}** dosyasını incele:\n\`\`\`\n${code}\n\`\`\`\n`;
        
        // Input box glow effect for positive feedback
        const inputBox = inputField.parentElement;
        const originalBorder = inputBox.style.borderColor;
        inputBox.style.borderColor = "#10b981";
        inputBox.style.boxShadow = "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(16, 185, 129, 0.4)";
        
        setTimeout(() => {
            inputBox.style.borderColor = originalBorder;
            inputBox.style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
        }, 1500);
        
    } catch(err) {
        const chatBox = document.getElementById("chat-box");
        chatBox.innerHTML += `
            <div class="message-wrapper bot">
                <div class="message" style="color:#ef4444; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); padding: 12px; border-radius: 8px;">⚠️ <b>GitHub Hata:</b> Dosya alınamadı. Linkin doğru olduğundan (gizli/private repo olmadığından) ve belirli bir koda ait olduğundan emin olun.</div>
            </div>
        `;
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function exportChat() {
    if (!chatSessions[currentSessionId] || chatSessions[currentSessionId].length === 0) {
        alert("İndirilecek bir konuşma bulunamadı.");
        return;
    }

    let markdown = `# ${chatTitles[currentSessionId] || 'Sohbet Geçmişi'}\n\n`;
    
    chatSessions[currentSessionId].forEach(msg => {
        if (msg.role === "system") return;
        
        let sender = msg.role === "user" ? "**Sen:**" : "**Yapay Zeka:**";
        let content = msg.content;
        
        // Gizli hack kodlarını temizle
        if (content.includes("[SİSTEM BİLGİSİ:")) {
            content = content.split("[SİSTEM BİLGİSİ:")[0].trim();
        }
        
        markdown += `${sender}\n${content}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chatTitles[currentSessionId] || 'Sohbet'}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function startVoiceInput() {
    const micBtn = document.getElementById("mic-btn");
    const inputField = document.getElementById("user-input");
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Tarayıcınız sesle yazdırma özelliğini desteklemiyor. Lütfen güncel Chrome kullanın.");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'tr-TR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    micBtn.style.color = "#ef4444"; // Kırmızı (dinliyor)

    recognition.start();

    recognition.onresult = function(event) {
        const speechResult = event.results[0][0].transcript;
        inputField.value = inputField.value ? inputField.value + " " + speechResult : speechResult;
    };

    recognition.onspeechend = function() {
        recognition.stop();
        micBtn.style.color = "var(--text-muted)";
    };

    recognition.onerror = function(event) {
        micBtn.style.color = "var(--text-muted)";
        console.error("Ses algılama hatası:", event.error);
    };
}

function clearAttachments() {}