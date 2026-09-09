let passwords = JSON.parse(localStorage.getItem('myPasswords')) || [];
let useEncryption = localStorage.getItem('useEncryption') !== 'false';

// Chave da sessão
let activeDeviceKey = null; 
let hasSecretKeyConfigured = !!localStorage.getItem('secretKeyHash');

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('encrypt-toggle').checked = useEncryption;
    document.getElementById('encrypt-toggle').addEventListener('change', (e) => {
        useEncryption = e.target.checked;
        localStorage.setItem('useEncryption', useEncryption);
    });

    await initializeSecurity();
});

async function hashString(str) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKeyFromPassword(password, salt) {
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), {name: "PBKDF2"}, false, ["deriveBits", "deriveKey"]);
    return await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 600000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

async function initializeSecurity() {
    const oldPlainSecret = localStorage.getItem('appSecretKey');
    const storedDeviceKey = localStorage.getItem('deviceCryptoKey');
    
    if (oldPlainSecret && storedDeviceKey && !localStorage.getItem('secretKeyHash')) {
        await fortifySecurity(oldPlainSecret, storedDeviceKey);
    } 

    hasSecretKeyConfigured = !!localStorage.getItem('secretKeyHash');
    updateSecretKeyUI();

    if (hasSecretKeyConfigured) {
        document.getElementById('auth-modal').style.display = 'flex';
    } else {
        if (!storedDeviceKey) {
            activeDeviceKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('deviceCryptoKey', activeDeviceKey);
        } else {
            activeDeviceKey = storedDeviceKey;
        }
        
        renderPasswords();
        checkSecurityBanner();
    }
}

function checkSecurityBanner() {
    const hideBanner = localStorage.getItem('hideSecurityBanner') === 'true';
    let banner = document.getElementById('security-banner');

    if (hasSecretKeyConfigured || hideBanner) {
        if (banner) banner.remove();
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'security-banner';
        banner.innerHTML = `
            <div class="NoSecretKeyCreated">
                <span><i class="ri-shield-keyhole-fill" style="color: #ffeb3b; margin-right: 5px;"></i> Para deixar suas senhas mais seguras, cadastre uma <strong>Chave secreta</strong>.</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button class="createSecretKeyBtn" onclick="openSecretKeyModal()">Definir uma chave secreta</button>
                    <button class="noThanksKeyBtn" onclick="dismissSecurityBanner()">Não exibir novamente</button>
                </div>
            </div>
        `;
        
        // Injeta no topo do body
        document.body.prepend(banner);
    }
}

function dismissSecurityBanner() {
    localStorage.setItem('hideSecurityBanner', 'true');
    const banner = document.getElementById('security-banner');
    if (banner) banner.remove();
}

async function fortifySecurity(masterPassword, devKey) {
    const salt = Math.random().toString(36).substring(2, 15);
    const hash = await hashString(masterPassword);
    
    const kek = await deriveKeyFromPassword(masterPassword, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const cipherBuffer = await crypto.subtle.encrypt({name: "AES-GCM", iv: iv}, kek, new TextEncoder().encode(devKey));
    
    localStorage.setItem('secretKeyHash', hash);
    localStorage.setItem('cryptoSalt', salt);
    localStorage.setItem('cryptoIv', btoa(String.fromCharCode(...iv)));
    localStorage.setItem('encryptedDeviceKey', btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))));
    
    localStorage.removeItem('appSecretKey');
    localStorage.removeItem('deviceCryptoKey');
}

let currentConfirmCallback = null;

function showCustomConfirm(title, message, confirmText, type, onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    
    const okBtn = document.getElementById('confirm-ok-btn');
    const icon = document.getElementById('confirm-icon');
    
    okBtn.innerText = confirmText;
    
    if(type === 'danger') {
        okBtn.style.backgroundColor = 'var(--danger-color)';
        icon.innerHTML = '<i class="ri-alert-fill" style="color: var(--danger-color);"></i>';
    } else {
        okBtn.style.backgroundColor = 'var(--primary-color)';
        icon.innerHTML = '<i class="ri-question-fill" style="color: var(--primary-color);"></i>';
    }

    currentConfirmCallback = onConfirm;
    
    okBtn.onclick = () => {
        closeModal('custom-confirm-modal');
        if(currentConfirmCallback) currentConfirmCallback();
    };
    
    document.getElementById('custom-confirm-modal').style.display = 'flex';
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = type === 'error' ? 'fa-times-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-check-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hide'); toast.addEventListener('animationend', () => toast.remove()); }, 3000);
}

function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('show'); }

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).classList.add('active');
    document.getElementById(`nav-${tabId}`).classList.add('active');
    if (tabId === 'home') renderPasswords();
}

function getSiteIcon(siteName) {
    const s = siteName.toLowerCase();
    const margin = '8px';
    
    if (s.includes('instagram')) return `<i class="fa-brands fa-instagram" style="color: #E1306C; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('facebook')) return `<i class="fa-brands fa-facebook" style="color: #1877F2; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('google') || s.includes('gmail')) return `<i class="fa-brands fa-google" style="color: #DB4437; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('github')) return `<i class="fa-brands fa-github" style="color: #ffffff; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('twitter') || s.includes(' x ') || s === 'x') return `<i class="fa-brands fa-x-twitter" style="color: #ffffff; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('linkedin')) return `<i class="fa-brands fa-linkedin" style="color: #0A66C2; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('netflix')) return `<i class="fa-solid fa-n" style="color: #E50914; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('amazon')) return `<i class="fa-brands fa-amazon" style="color: #FF9900; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('apple')) return `<i class="fa-brands fa-apple" style="color: #ffffff; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('spotify')) return `<i class="fa-brands fa-spotify" style="color: #1DB954; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('discord')) return `<i class="fa-brands fa-discord" style="color: #5865F2; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('microsoft') || s.includes('outlook') || s.includes('hotmail')) return `<i class="fa-brands fa-microsoft" style="color: #00A4EF; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('steam')) return `<i class="fa-brands fa-steam" style="color: #171a21; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('tiktok')) return `<i class="fa-brands fa-tiktok" style="color: #ff0050; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('twitch')) return `<i class="fa-brands fa-twitch" style="color: #9146FF; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('reddit')) return `<i class="fa-brands fa-reddit" style="color: #FF4500; margin-right: ${margin}; font-size: 18px;"></i>`;
    if (s.includes('paypal')) return `<i class="fa-brands fa-paypal" style="color: #00457C; margin-right: ${margin}; font-size: 18px;"></i>`;

    return `<i class="fas fa-key" style="color: var(--primary-color); margin-right: ${margin}; font-size: 18px;"></i>`;
}

async function getAesKey(rawKey) {
    let dataSalt = localStorage.getItem('dataCryptoSalt');
    if (!dataSalt) {
        dataSalt = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('dataCryptoSalt', dataSalt);
    }

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(rawKey), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
    return await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode(dataSalt), iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

async function encryptData(text) {
    if (!useEncryption || !text) return text;
    try {
        const key = await getAesKey(activeDeviceKey);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(text));

        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0); combined.set(new Uint8Array(ciphertext), iv.length);
        return btoa(String.fromCharCode(...combined));
    } catch (e) { return text; }
}

async function decryptData(base64Text) {
    if (!useEncryption || !base64Text) return base64Text;
    try {
        const combined = new Uint8Array(atob(base64Text).split('').map(c => c.charCodeAt(0)));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        const key = await getAesKey(activeDeviceKey);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Falha ao descriptografar", e);
        return "⚠️ Erro de Descriptografia"; 
    }
}

function changeCryptoKey() {
    showCustomConfirm("Rotacionar Criptografia", "Alterar o código impedirá a leitura das senhas atuais se não exportadas! Continuar mesmo assim?", "Rotacionar", "danger", () => {
        const newKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        activeDeviceKey = newKey;
        
        if(hasSecretKeyConfigured) {
            localStorage.removeItem('secretKeyHash'); 
            hasSecretKeyConfigured = false;
            updateSecretKeyUI();
            showToast("Código alterado! A chave secreta foi desativada temporariamente. Refaça-a agora.", "warning");
            openSecretKeyModal();
        } else {
            localStorage.setItem('deviceCryptoKey', activeDeviceKey);
            showToast("Código rotacionado com sucesso!", "success");
        }
    });
}

async function checkSecretKey() {
    const input = document.getElementById('auth-secret-input').value;
    const inputHash = await hashString(input);
    const storedHash = localStorage.getItem('secretKeyHash');

    if (inputHash === storedHash) {
        try {
            const salt = localStorage.getItem('cryptoSalt');
            const ivBase64 = localStorage.getItem('cryptoIv');
            const encKeyBase64 = localStorage.getItem('encryptedDeviceKey');
            
            const kek = await deriveKeyFromPassword(input, salt);
            const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
            const encData = new Uint8Array(atob(encKeyBase64).split('').map(c => c.charCodeAt(0)));
            
            const decryptedBuffer = await crypto.subtle.decrypt({name: "AES-GCM", iv: iv}, kek, encData);
            activeDeviceKey = new TextDecoder().decode(decryptedBuffer); 
            
            document.getElementById('auth-modal').style.display = 'none';
            document.getElementById('auth-secret-input').value = '';
            renderPasswords();
            checkSecurityBanner();
            showToast('Acesso liberado!', 'success');
        } catch (e) {
            showToast('Erro interno de decriptação.', 'error');
        }
    } else {
        showToast('Chave secreta incorreta.', 'error');
    }
}

function handleAuthKeyPress(event) { if (event.key === 'Enter') checkSecretKey(); }

function updateSecretKeyUI() {
    const btnDel = document.getElementById('btn-delete-secret'); 
    const btnSet = document.getElementById('secret-btn-text');
    
    if (hasSecretKeyConfigured) { 
        if (btnDel) btnDel.style.display = 'flex';
        if (btnSet) btnSet.innerText = "Alterar chave secreta"; 
    } else { 
        if (btnDel) btnDel.style.display = 'none'; 
        if (btnSet) btnSet.innerText = "Adicionar chave secreta"; 
    }
}

function openSecretKeyModal() { 
    document.getElementById('new-secret-input').value = ''; 
    document.getElementById('new-secret-input').type = 'password'; 
    document.getElementById('secret-key-modal').style.display = 'flex'; 
    
    const closeBtn = document.querySelector('#secret-key-modal .close-btn');
    if (closeBtn) closeBtn.style.display = 'block';
}

async function saveSecretKey() {
    const newKey = document.getElementById('new-secret-input').value; 
    if (!newKey.trim()) { showToast('A senha não pode ser vazia.', 'error'); return; }

    if (!activeDeviceKey) {
        activeDeviceKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    await fortifySecurity(newKey, activeDeviceKey);
    hasSecretKeyConfigured = true;
    updateSecretKeyUI(); 
    checkSecurityBanner();
    closeModal('secret-key-modal'); 
    showToast('Segurança Mestra configurada!', 'success');
    
    renderPasswords();
}

function deleteSecretKey() { 
    showCustomConfirm("Remover Segurança", "A chave voltará a ser salva localmente. Isso é menos seguro se seus arquivos forem vazados. Continuar?", "Remover", "danger", () => {
        localStorage.setItem('deviceCryptoKey', activeDeviceKey);
        
        localStorage.removeItem('secretKeyHash'); 
        localStorage.removeItem('encryptedDeviceKey');
        localStorage.removeItem('cryptoSalt');
        localStorage.removeItem('cryptoIv');
        
        hasSecretKeyConfigured = false;
        updateSecretKeyUI(); 
        
        localStorage.removeItem('hideSecurityBanner');
        checkSecurityBanner();
        
        showToast('Chave secreta removida.', 'warning'); 
    });
}

function renderPasswords(filterQuery = '') {
    const list = document.getElementById('password-list'); const emptyState = document.getElementById('empty-state'); list.innerHTML = '';
    const filteredPasswords = passwords.filter(p => p.site.toLowerCase().includes(filterQuery) || (p.desc && p.desc.toLowerCase().includes(filterQuery)));

    if (filteredPasswords.length === 0) { emptyState.style.display = 'flex'; list.style.display = 'none'; return; }

    emptyState.style.display = 'none'; list.style.display = 'grid'; const now = new Date();

    filteredPasswords.forEach(pass => {
        let statusText = '';
        if (pass.expiry) {
            const expDate = new Date(pass.expiry);
            statusText = expDate < now ? `<p class="expired">Expirou: ${expDate.toLocaleDateString()}</p>` : `<p>Expira: ${expDate.toLocaleDateString()}</p>`;
        }
        
        const siteIcon = getSiteIcon(pass.site);

        const div = document.createElement('div'); div.className = 'password-card';
        div.innerHTML = `
            <div class="card-info">
                <h4 style="display: flex; align-items: center;">${siteIcon} ${pass.site}</h4>
                <p class="pwd-display" id="pwd-text-${pass.id}" data-visible="false">••••••••</p>
                ${statusText} ${pass.desc ? `<p>${pass.desc}</p>` : ''}
            </div>
            <div class="card-actions">
                <button onclick="toggleCardPassword('${pass.id}', this)"><i class="ri-eye-fill"></i></button>
                <button onclick="copyPassword('${pass.id}')"><i class="ri-file-copy-fill"></i></button>
                <button onclick="openModal('${pass.id}')"><i class="ri-pencil-fill"></i></button>
                <button onclick="deletePassword('${pass.id}')" class="delete-btn"><i class="ri-delete-bin-5-fill"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function savePassword() {
    const id = document.getElementById('edit-id').value;
    const site = document.getElementById('site-name').value;
    const rawPassword = document.getElementById('site-password').value;
    const willExpire = document.getElementById('will-expire').value;
    const expiry = willExpire === 'yes' ? document.getElementById('expiry-date').value : null;
    const desc = document.getElementById('site-desc').value;

    if (!site || !rawPassword) { showToast("Preencha nome e senha.", "warning"); return; }

    const newPass = {
        id: id || Date.now().toString(), site: sanitizeHTML(site),
        password: await encryptData(rawPassword),
        expiry, desc: sanitizeHTML(desc), createdAt: new Date().toISOString()
    };

    if (id) { passwords = passwords.map(p => p.id === id ? newPass : p); showToast("Atualizada!", "success"); }
    else { passwords.push(newPass); showToast("Salva!", "success"); }

    localStorage.setItem('myPasswords', JSON.stringify(passwords)); closeModal('password-modal'); filterPasswords();
}

function deletePassword(id) {
    showCustomConfirm("Apagar Senha", "Tem certeza que deseja excluir esta senha permanentemente?", "Apagar", "danger", () => {
        passwords = passwords.filter(p => p.id !== id); 
        localStorage.setItem('myPasswords', JSON.stringify(passwords)); 
        filterPasswords(); 
        showToast("Senha apagada.", "success");
    });
}

async function exportPasswords() {
    if (passwords.length === 0) { showToast("Não há senhas para exportar.", "warning"); return; }
    
    showCustomConfirm("Exportar Senhas", "ATENÇÃO: As senhas serão salvas e descriptografadas em um arquivo local JSON. NÃO COMPARTILHE ESSE ARQUIVO. Continuar?", "Exportar", "primary", async () => {
        const exportData = await Promise.all(passwords.map(async p => ({ ...p, password: await decryptData(p.password) })));
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        const d = new Date();
        const dateString = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`;

        downloadAnchorNode.setAttribute("href", dataStr); downloadAnchorNode.setAttribute("download", `minhasSenhas_${dateString}.json`);
        document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove();
        showToast("Download iniciado.", "success");
    });
}

async function openModal(id = null) {
    document.getElementById('password-modal').style.display = 'flex';
    document.getElementById('modal-title').innerText = id ? "Editar Senha" : "Nova Senha";
    document.getElementById('edit-id').value = id || '';
    document.getElementById('site-password').type = 'password';

    if (id) {
        const pass = passwords.find(p => p.id === id);
        document.getElementById('site-name').value = pass.site;
        document.getElementById('site-password').value = await decryptData(pass.password);
        document.getElementById('site-desc').value = pass.desc || '';
        document.getElementById('will-expire').value = pass.expiry ? 'yes' : 'no';
        document.getElementById('expiry-date').value = pass.expiry || '';
    } else {
        document.getElementById('site-name').value = ''; document.getElementById('site-password').value = '';
        document.getElementById('site-desc').value = ''; document.getElementById('will-expire').value = 'no';
        document.getElementById('expiry-date').value = '';
    }
    toggleExpiryField();
}

async function toggleCardPassword(id, btnElement) {
    const passSpan = document.getElementById(`pwd-text-${id}`);
    const icon = btnElement.querySelector('i');
    if (passSpan.dataset.visible === 'true') {
        passSpan.innerText = '••••••••'; passSpan.dataset.visible = 'false'; icon.classList.replace('ri-eye-off-fill', 'ri-eye-fill');
    } else {
        const pass = passwords.find(p => p.id === id);
        passSpan.innerText = await decryptData(pass.password); passSpan.dataset.visible = 'true'; icon.classList.replace('ri-eye-fill', 'ri-eye-off-fill');
    }
}

async function copyPassword(id) {
    const pass = passwords.find(p => p.id === id);
    navigator.clipboard.writeText(await decryptData(pass.password)).then(() => showToast("Copiado!", "success")).catch(() => showToast("Erro ao copiar.", "error"));
}

function focusSearch() { document.getElementById('search-input').focus(); }
function filterPasswords() { renderPasswords(document.getElementById('search-input').value.toLowerCase()); }
function toggleInputPassword(inputId, btn) {
    const input = document.getElementById(inputId); const icon = btn.querySelector('i');
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('ri-eye-fill', 'ri-eye-off-fill'); } 
    else { input.type = 'password'; icon.classList.replace('ri-eye-off-fill', 'ri-eye-fill'); }
}
function toggleExpiryField() { document.getElementById('expiry-group').style.display = document.getElementById('will-expire').value === 'yes' ? 'flex' : 'none'; }
function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }

function importPasswordsClick() { document.getElementById('import-file').click(); }
function sanitizeHTML(str) { if (!str) return ''; return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])); }

function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "application/json" && !file.name.endsWith(".json")) { showToast("Use apenas arquivos JSON.", "error"); return; }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) throw new Error("O JSON não contém uma lista válida.");
            let addedCount = 0;
            for (const item of importedData) {
                if (typeof item === 'object' && typeof item.site === 'string' && typeof item.password === 'string') {
                    const newPassId = item.id ? String(item.id).replace(/[^a-zA-Z0-9-]/g, '') : Date.now().toString();
                    const newPass = {
                        id: newPassId, site: sanitizeHTML(item.site),
                        password: await encryptData(item.password),
                        expiry: item.expiry ? sanitizeHTML(item.expiry) : null,
                        desc: item.desc ? sanitizeHTML(item.desc) : '',
                        createdAt: item.createdAt || new Date().toISOString()
                    };
                    const index = passwords.findIndex(p => p.id === newPassId);
                    if (index > -1) passwords[index] = newPass; else passwords.push(newPass);
                    addedCount++;
                }
            }
            if (addedCount === 0) throw new Error("Nenhuma senha válida encontrada.");
            localStorage.setItem('myPasswords', JSON.stringify(passwords)); renderPasswords(); showToast(`${addedCount} senhas importadas!`, "success");
        } catch (error) { showToast("Importação bloqueada.", "error"); }
    };
    reader.readAsText(file); event.target.value = '';
}

function confirmDeleteAll() { document.getElementById('confirm-delete-input').value = ''; document.getElementById('confirm-modal').style.display = 'flex'; }
function executeDeleteAll() {
    if (document.getElementById('confirm-delete-input').value === "EXCLUIR") { 
        passwords = []; localStorage.removeItem('myPasswords'); renderPasswords(); closeModal('confirm-modal'); showToast("Senhas apagadas.", "warning"); 
    } else showToast("Palavra incorreta.", "error");
}

function generatePassword() {
    let lengthValue = parseInt(document.getElementById('gen-length').value);
    if (isNaN(lengthValue) || lengthValue < 1) lengthValue = 16;
    if (lengthValue > 256) lengthValue = 256;

    const pool = Array.from(new Set(((document.getElementById('gen-lower').checked ? 'abcdefghijklmnopqrstuvwxyz' : '') + (document.getElementById('gen-upper').checked ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '') + (document.getElementById('gen-numbers').checked ? '0123456789' : '') + (document.getElementById('gen-symbols').checked ? '!@#$%^&*()_+~|}{[]:;?><,./-=' : '') + document.getElementById('gen-custom').value).split(''))).join('');

    const displayElement = document.getElementById('generated-password');
    if (!pool) { displayElement.value = 'Selecione uma opção'; return; }

    let pwd = '', attempts = 0; const cryptoObj = window.crypto || window.msCrypto;
    while (pwd.length < lengthValue && attempts < 5000) {
        let char = cryptoObj && cryptoObj.getRandomValues ? pool[cryptoObj.getRandomValues(new Uint32Array(1))[0] % pool.length] : pool[Math.floor(Math.random() * pool.length)];
        if (!document.getElementById('gen-repeat').checked && pwd.includes(char)) { attempts++; if (pwd.length >= pool.length) break; continue; }
        pwd += char;
    }
    displayElement.value = pwd;
}

function copyGeneratedPassword() {
    const pwd = document.getElementById('generated-password').value;
    if (pwd === 'Selecione uma opção' || !pwd) return;
    navigator.clipboard.writeText(pwd).then(() => showToast("Senha gerada copiada!", "success")).catch(() => showToast("Erro ao copiar.", "error"));
}

async function runCheckup() {
    if (passwords.length === 0) { showToast("Você não tem senhas salvas para analisar.", "warning"); return; }

    const container = document.querySelector('.checkup-container');
    const circle = document.getElementById('checkup-circle');
    const title = document.getElementById('checkup-title');
    const subtitle = document.getElementById('checkup-subtitle');
    const icon = document.getElementById('checkup-icon');
    const percent = document.getElementById('checkup-percent');
    const listContainer = document.getElementById('compromised-list');

    container.classList.remove('status-red', 'status-yellow', 'status-green', 'status-gray');
    listContainer.innerHTML = '';

    let weakPasswords = []; let seenPasswords = {};

    for (const p of passwords) {
        const plainPass = await decryptData(p.password);
        
        if (plainPass === "⚠️ Erro de Descriptografia") continue;

        let issues = [];
        if (plainPass.length < 8) issues.push("Muito curta (Mínimo 8)");
        if (!/[A-Z]/.test(plainPass)) issues.push("Sem letra maiúscula");
        if (!/[0-9]/.test(plainPass)) issues.push("Sem números");
        if (!/[^A-Za-z0-9]/.test(plainPass)) issues.push("Sem símbolos");

        if (seenPasswords[plainPass]) issues.push("Senha reutilizada");
        else seenPasswords[plainPass] = true;

        if (issues.length > 0) weakPasswords.push({ site: p.site, issues: issues.join(', ') });
    }

    const secureCount = passwords.length - weakPasswords.length;
    const scorePercentage = Math.round((secureCount / passwords.length) * 100);

    circle.style.strokeDasharray = `${scorePercentage}, 100`;

    if (weakPasswords.length > 0) {
        listContainer.style.display = 'block';
        weakPasswords.forEach(wp => {
            listContainer.innerHTML += `
                <div class="compromised-item" style="padding: 10px; background: #2a2a2a; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between;">
                    <div>
                        <h4 style="margin: 0; font-size: 15px;">${getSiteIcon(wp.site)} ${wp.site}</h4>
                        <p style="margin: 0; font-size: 12px; color: #f44336;">${wp.issues}</p>
                    </div>
                    <i class="fas fa-exclamation-triangle" style="color: #f44336; margin-top: 5px;"></i>
                </div>`;
        });
    } else { listContainer.style.display = 'none'; }

    if (scorePercentage < 70) {
        container.classList.add('status-red');
        icon.innerHTML = '<i class="ri-spam-fill" style="color: #f44336;"></i>';
        percent.innerHTML = `<span style="color: #f44336;">${100 - scorePercentage}%</span>`;
        title.innerText = `Suas senhas estão comprometidas. Altere-as.`;
        subtitle.innerText = "Senhas listadas abaixo não têm requisitos mínimos de segurança.";
    } else if (scorePercentage < 100) {
        container.classList.add('status-yellow');
        icon.innerHTML = '<i class="ri-alert-fill" style="color: #ffeb3b;"></i>';
        percent.innerHTML = `<span style="color: #ffeb3b;">${100 - scorePercentage}%</span>`;
        title.innerText = `Suas senhas precisam de atenção.`;
        subtitle.innerText = "Revise antes de usá-las.";
    } else {
        container.classList.add('status-green');
        icon.innerHTML = '<i class="ri-shield-check-fill" style="color: #4caf50;"></i>';
        percent.innerHTML = `<span style="color: #4caf50;">100%</span>`;
        title.innerText = "Todas as suas senhas estão seguras!";
        subtitle.innerText = "Que bom que esteja se protegendo.";
    }
}