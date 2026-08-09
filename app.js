// ==================== КОНСТАНТЫ И СОСТОЯНИЕ ====================
const STORAGE_KEY = 'dva_hvosta_data';
const WELCOME_KEY = 'dva_hvosta_welcomed';
const THEME_KEY = 'dva_hvosta_theme';
const EMOJIS = ['🐱', '🐶', '🐰', '🐹', '🐦', '🐊', '🐢', '🐸', '🐎', '🐵'];
const DAYS_MAP = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' };
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const TABS = ['today', 'pets', 'meds', 'appointments'];

const themeColors = {
    default: '#4f46e5',
    green: '#059669',
    pink: '#db2777',
    amber: '#d97706'
};

let state = { pets: [], meds: [], completions: {}, appointments: [] };
let selectedDate = new Date();
let currentPetAvatar = '🐾';
let currentPetPhoto = null;
let activeTabIdx = 0;
let firedAlerts = new Set();
let currentDiaryPetId = null; 
let deferredPrompt = null; 
let audioCtx = null; 

// ==================== БЕЗОПАСНОСТЬ: Экранирование HTML ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== ВАЛИДАЦИЯ ДАННЫХ ====================
function validatePetData(data) {
    const errors = [];
    if (!data.name || data.name.trim().length === 0) {
        errors.push('Имя питомца обязательно');
    }
    if (data.name && data.name.length > 50) {
        errors.push('Имя слишком длинное (макс. 50 символов)');
    }
    return errors;
}

function validateMedData(data) {
    const errors = [];
    if (!data.name || data.name.trim().length === 0) {
        errors.push('Название препарата обязательно');
    }
    if (!data.dosage || data.dosage.trim().length === 0) {
        errors.push('Дозировка обязательна');
    }
    if (!data.time) {
        errors.push('Время приема обязательно');
    }
    if (!data.days || data.days.length === 0) {
        errors.push('Выберите хотя бы один день');
    }
    return errors;
}

// ==================== УПРАВЛЕНИЕ СОСТОЯНИЕМ (Reactive Store) ====================
const store = {
    listeners: [],
    
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    },
    
    notify() {
        this.listeners.forEach(callback => callback(state));
    },
    
    setState(newState) {
        state = { ...state, ...newState };
        this.notify();
        saveData();
        updateAppBadge();
    },
    
    addPet(pet) {
        const errors = validatePetData(pet);
        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
        state.pets.push(pet);
        this.notify();
        saveData();
    },
    
    updatePet(id, updates) {
        const idx = state.pets.findIndex(p => p.id === id);
        if (idx === -1) throw new Error('Питомец не найден');
        const updatedPet = { ...state.pets[idx], ...updates };
        const errors = validatePetData(updatedPet);
        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
        state.pets[idx] = updatedPet;
        this.notify();
        saveData();
    },
    
    deletePet(id) {
        state.pets = state.pets.filter(p => p.id !== id);
        state.meds = state.meds.filter(m => m.petId !== id);
        this.notify();
        saveData();
    },
    
    addMed(med) {
        const errors = validateMedData(med);
        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
        state.meds.push(med);
        this.notify();
        saveData();
    },
    
    updateMed(id, updates) {
        const idx = state.meds.findIndex(m => m.id === id);
        if (idx === -1) throw new Error('Лекарство не найдено');
        const updatedMed = { ...state.meds[idx], ...updates };
        const errors = validateMedData(updatedMed);
        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
        state.meds[idx] = updatedMed;
        this.notify();
        saveData();
    },
    
    deleteMed(id) {
        state.meds = state.meds.filter(m => m.id !== id);
        this.notify();
        saveData();
    },
    
    toggleCompletion(dateStr, medId) {
        if (!state.completions[dateStr]) {
            state.completions[dateStr] = {};
        }
        state.completions[dateStr][medId] = !state.completions[dateStr][medId];
        if (!state.completions[dateStr][medId]) {
            delete state.completions[dateStr][medId];
            if (Object.keys(state.completions[dateStr]).length === 0) {
                delete state.completions[dateStr];
            }
        }
        this.notify();
        saveData();
        updateAppBadge();
    }
};

// ==================== ОБРАБОТКА ОШИБОК ====================
window.addEventListener('error', (event) => {
    console.error('Global error:', event.message, event.filename, event.lineno);
    showToast('Ошибка', 'Произошла непредвиденная ошибка. Перезагрузите страницу.', 'alert-circle');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('Ошибка', 'Произошла ошибка при загрузке данных.', 'alert-circle');
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadData();
    initEmojiSelector();
    renderCalendar();
    renderAll();
    setupSmartScroll();
    setupSwipeGestures();
    updateNotifButtonUI();
    checkFirstVisit();
    lucide.createIcons();
    updateAppBadge();
    registerSW();
    
    // Подписка store на обновления UI
    store.subscribe(() => {
        renderAll();
    });
    
    const unlockAudio = () => {
        if (!audioCtx) { 
            try { 
                audioCtx = new (window.AudioContext || window.webkitAudioContext)(); 
            } catch(e) { 
                console.warn('AudioContext not supported');
            } 
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(e => console.warn('Audio resume failed', e));
        }
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
});

function loadData() { 
    try { 
        const r = localStorage.getItem(STORAGE_KEY); 
        if (r) {
            const parsed = JSON.parse(r);
            // Валидация структуры данных
            if (!parsed.pets || !Array.isArray(parsed.pets)) parsed.pets = [];
            if (!parsed.meds || !Array.isArray(parsed.meds)) parsed.meds = [];
            if (!parsed.completions || typeof parsed.completions !== 'object') parsed.completions = {};
            if (!parsed.appointments || !Array.isArray(parsed.appointments)) parsed.appointments = [];
            state = parsed;
        }
    } catch(e) {
        console.error('Error loading data:', e);
        showToast('Ошибка', 'Не удалось загрузить данные. Начинаем с чистого листа.', 'alert-circle');
    } 
}

function saveData() { 
    try { 
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); 
    } catch(e) {
        console.error('Error saving data:', e);
        if (e.name === 'QuotaExceededError') {
            showToast('Память заполнена', 'Удалите фото питомцев или старые записи.', 'alert-circle');
        } else {
            showToast('Ошибка сохранения', 'Проверьте настройки браузера.', 'alert-circle');
        }
    } 
}

// ==================== БЕЙДЖ ИКОНКИ ПРИЛОЖЕНИЯ ====================
function updateAppBadge() {
    if ('setAppBadge' in navigator) {
        const todayTasks = getTasksForDate(new Date());
        const pending = todayTasks.filter(t => !t.isCompleted).length;
        if (pending > 0) {
            navigator.setAppBadge(pending).catch(e => console.log('Badge set failed', e));
        } else {
            navigator.clearAppBadge().catch(e => console.log('Badge clear failed', e));
        }
    }
}

// ==================== УСТАНОВКА PWA ====================
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
    }
    showToast('Приложение готово к установке!', 'Нажмите кнопку "Установить" в приветственном окне.', 'download');
});

function triggerPwaInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showToast('Установка началась', 'Ищите иконку на главном экране!', 'check-circle');
                closeWelcomeModal();
            } else {
                showToast('Установка отменена', 'Вы можете установить приложение позже через меню браузера.', 'info');
            }
            deferredPrompt = null;
            const installBtn = document.getElementById('installAppBtn');
            if (installBtn) {
                installBtn.classList.add('hidden');
            }
        });
    } else {
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isChrome = /Chrome/i.test(navigator.userAgent);
        if (isAndroid && isChrome) {
            showToast('Ручная установка', 'Нажмите на три точки в правом верхнем углу Chrome и выберите "Установить приложение".', 'info');
        } else {
            showToast('Как установить', 'Откройте меню браузера и выберите "Добавить на главный экран".', 'info');
        }
    }
}

// ==================== ТЕМЫ ОФОРМЛЕНИЯ ====================
function loadTheme() { 
    const savedTheme = localStorage.getItem(THEME_KEY) || 'default'; 
    applyTheme(savedTheme); 
}

function setTheme(themeName) { 
    localStorage.setItem(THEME_KEY, themeName); 
    applyTheme(themeName); 
    showToast('Тема изменена', 'Приложение обновлено', 'palette'); 
}

function applyTheme(themeName) {
    document.body.classList.remove('theme-default', 'theme-green', 'theme-pink', 'theme-amber');
    document.body.classList.add('theme-' + themeName);
    const themeEl = document.getElementById('meta-theme-color');
    if (themeEl) {
        themeEl.setAttribute('content', themeColors[themeName]);
    }
    document.querySelectorAll('.theme-option').forEach(el => {
        if (el.dataset.theme === themeName) { 
            el.classList.add('border-slate-800', 'scale-105'); 
            el.classList.remove('border-transparent'); 
        } else { 
            el.classList.remove('border-slate-800', 'scale-105'); 
            el.classList.add('border-transparent'); 
        }
    });
}

// ==================== ПРИВЕТСТВЕННОЕ ОКНО ====================
function checkFirstVisit() {
    if (!localStorage.getItem(WELCOME_KEY)) {
        openModal('welcomeModal');
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isStandalone) return;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            const iosHint = document.getElementById('iosInstallHint');
            if (iosHint) iosHint.classList.remove('hidden');
        } else if (deferredPrompt) {
            const installBtn = document.getElementById('installAppBtn');
            if (installBtn) installBtn.classList.remove('hidden');
        }
    }
}

function closeWelcomeModal() { 
    closeModal('welcomeModal'); 
    localStorage.setItem(WELCOME_KEY, 'true'); 
}

// ==================== СВАЙПЫ И ЖЕСТЫ ====================
function setupSwipeGestures() {
    const container = document.getElementById('swipe-container');
    let touchStartX = 0;
    let touchEndX = 0;
    
    container.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    container.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe(touchStartX, touchEndX);
    }, { passive: true });
}

function handleSwipe(startX, endX) {
    const diff = startX - endX;
    if (Math.abs(diff) < 80) return;
    if (diff > 0 && activeTabIdx < TABS.length - 1) {
        switchTab(TABS[activeTabIdx + 1], activeTabIdx + 1);
    } else if (diff < 0 && activeTabIdx > 0) {
        switchTab(TABS[activeTabIdx - 1], activeTabIdx - 1);
    }
}

// ==================== УВЕДОМЛЕНИЯ ====================
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert("Ваш браузер не поддерживает уведомления");
        return;
    }
    if (Notification.permission === 'granted') {
        alert("Уведомления уже разрешены!");
        updateNotifButtonUI();
        scheduleAllNotifications();
        return;
    }
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            alert("Уведомления разрешены! Теперь вы будете получать напоминания.");
            updateNotifButtonUI();
            registerSW(); 
            scheduleAllNotifications();
        }
    } else {
        alert("Уведомления заблокированы. Разрешите их в настройках браузера.");
    }
}

function updateNotifButtonUI() {
    const btn = document.getElementById('notif-perm-btn');
    if (!btn) return;
    if ('Notification' in window && Notification.permission === 'granted') {
        btn.innerHTML = '<i data-lucide="bell-check" class="w-4 h-4"></i> Уведомления включены ✓';
        btn.classList.remove('bg-amber-50', 'text-amber-700', 'hover:bg-amber-100');
        btn.classList.add('bg-green-50', 'text-green-700', 'hover:bg-green-100');
        btn.disabled = true;
        lucide.createIcons();
    }
}

function startNotificationChecker() {
    // Проверяем каждое лекарство раз в минуту
    setInterval(() => {
        const now = new Date();
        const currentTimeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const dateStr = getDateStr(now);
        const tasks = getTasksForDate(now);

        tasks.forEach(task => {
            const alertId = `${dateStr}_${task.id}`;
            if (task.time === currentTimeStr && !task.isCompleted && !firedAlerts.has(alertId)) {
                firedAlerts.add(alertId);
                const msg = `${escapeHtml(task.petName)}: ${escapeHtml(task.name)} (${escapeHtml(task.dosage)})`;
                showToast('Пора дать лекарство! 🕒', msg, 'alarm-clock');
                playCompletionSound();
                sendSystemNotification(task);
            }
        });
        updateAppBadge();
    }, 60000); // Проверка каждую минуту
}

// Планирование уведомлений через Notification API (работает даже при заблокированном экране)
function scheduleAllNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    // Очищаем все предыдущие запланированные уведомления (если браузер поддерживает)
    if ('getNotifications' in Notification) {
        Notification.getNotifications().then(notifications => {
            notifications.forEach(n => n.close());
        });
    }

    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    state.meds.forEach(med => {
        // Проверяем каждый день на следующей неделе
        for (let d = new Date(today); d <= nextWeek; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay(); // Преобразуем в формат 1-7 (Пн-Вс)
            
            if (med.days.includes(dayOfWeek)) {
                const medTime = med.time.split(':');
                const notifyTime = new Date(d);
                notifyTime.setHours(parseInt(medTime[0]), parseInt(medTime[1]), 0, 0);

                // Если время уже прошло сегодня, пропускаем
                if (notifyTime <= new Date()) continue;

                const pet = state.pets.find(p => p.id === med.petId);
                const petName = pet ? pet.name : 'Питомец';

                // Создаем уведомление с отложенным временем
                const title = `💊 Время лекарства: ${med.name}`;
                const body = `Для ${petName}: ${med.dosage || ''} ${med.notes ? '(' + med.notes + ')' : ''}`;
                
                // Вычисляем задержку в миллисекундах
                const delay = notifyTime.getTime() - new Date().getTime();
                
                // Используем setTimeout для отложенной отправки (до 1 часа вперед)
                // Для более длительных периодов нужны Push-уведомления с сервером
                if (delay <= 3600000) { // Максимум 1 час для setTimeout
                    setTimeout(() => {
                        sendSystemNotification({
                            id: med.id,
                            name: med.name,
                            petName: petName,
                            dosage: med.dosage,
                            notes: med.notes
                        });
                    }, delay);
                    
                    console.log(`Запланировано уведомление: ${title} через ${Math.round(delay/1000)} сек`);
                }
            }
        }
    });
}

function sendSystemNotification(task) {
    const title = `💊 Время лекарства: ${task.name}`;
    const body = `Для ${task.petName}: ${task.dosage || ''} ${task.notes ? '(' + task.notes + ')' : ''}`;

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: title,
            body: body,
            icon: 'icon-192.png',
            tag: 'med-' + task.id
        });
    } else {
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: 'icon-192.png',
                tag: 'med-' + task.id
            });
        }
    }
}

async function registerSW() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('SW registered:', registration.scope);
            
            if (Notification.permission === 'granted') {
                startNotificationChecker();
                scheduleAllNotifications();
                
                // Отправляем данные о лекарствах в Service Worker для фоновой работы
                if (registration.active) {
                    registration.active.postMessage({
                        type: 'SYNC_MEDS',
                        meds: state.meds,
                        pets: state.pets
                    });
                }
                
                // Пытаемся зарегистрировать периодическую синхронизацию (если поддерживается)
                if ('periodicSync' in registration) {
                    try {
                        await registration.periodicSync.register('med-check', {
                            minInterval: 15 * 60 * 1000 // 15 минут
                        });
                        console.log('Periodic Sync registered');
                    } catch (e) {
                        console.log('Periodic Sync not supported or failed:', e);
                    }
                }
            }
        } catch (error) {
            console.error('SW registration failed:', error);
        }
    }
}

function showToast(title, body, icon = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast-enter bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3 w-full max-w-sm pointer-events-auto cursor-pointer';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    toast.onclick = () => removeToast(toast);
    toast.innerHTML = `<div class="bg-indigo-100 text-indigo-600 p-2 rounded-xl flex-shrink-0" aria-hidden="true"><i data-lucide="${icon}" class="w-5 h-5"></i></div><div class="flex-grow"><h4 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h4><p class="text-xs text-slate-500 mt-0.5">${escapeHtml(body)}</p></div>`;
    container.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => removeToast(toast), 5000);
}

function removeToast(toastElement) {
    if (!toastElement.parentNode) return;
    toastElement.classList.remove('toast-enter');
    toastElement.classList.add('toast-exit');
    setTimeout(() => toastElement.remove(), 300);
}

function playCompletionSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1000, audioCtx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
        console.warn('Sound playback failed', e);
    }
}

// ==================== НАВИГАЦИЯ ====================
function switchTab(tabName, idx = null) {
    if (idx !== null) activeTabIdx = idx;
    else activeTabIdx = TABS.indexOf(tabName);
    
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.remove('text-indigo-600', 'bg-indigo-50/70');
        btn.classList.add('text-slate-500');
        if (i === activeTabIdx) {
            btn.classList.add('text-indigo-600', 'bg-indigo-50/70');
            btn.classList.remove('text-slate-500');
        }
    });
    
    document.querySelectorAll('main > div').forEach(div => {
        div.classList.add('hidden');
        div.classList.remove('fade-in');
    });
    
    const target = document.getElementById(`content-${tabName}`);
    if (target) {
        target.classList.remove('hidden');
        void target.offsetWidth;
        target.classList.add('fade-in');
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    lucide.createIcons();
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        lucide.createIcons();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }
}

function setupSmartScroll() {
    let lastY = window.scrollY;
    const calendar = document.getElementById('calendar-wrapper');
    if (!calendar) return;
    
    window.addEventListener('scroll', () => {
        const currentY = window.scrollY;
        if (currentY > lastY && currentY > 150) {
            calendar.classList.add('calendar-hidden');
        } else {
            calendar.classList.remove('calendar-hidden');
        }
        lastY = currentY;
    }, { passive: true });
}

// ==================== КАЛЕНДАРЬ ====================
function renderCalendar() {
    const strip = document.getElementById('calendar-strip');
    if (!strip) return;
    
    strip.innerHTML = '';
    const today = new Date();
    
    for (let i = -3; i <= 3; i++) {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + i);
        const isToday = d.toDateString() === today.toDateString();
        const isSelected = d.toDateString() === selectedDate.toDateString();
        
        const btn = document.createElement('button');
        btn.onclick = () => {
            selectedDate = d;
            renderCalendar();
            renderSchedule();
        };
        btn.setAttribute('aria-label', `Выбрать дату: ${d.getDate()} ${MONTHS[d.getMonth()]}`);
        btn.setAttribute('aria-pressed', isSelected);
        btn.className = `flex flex-col items-center p-1.5 rounded-xl transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-md scale-105' : 'hover:bg-slate-100 text-slate-600'}`;
        
        btn.innerHTML = `<span class="text-[10px] font-medium ${isSelected ? 'text-indigo-200' : 'text-slate-400'}">${DAYS_MAP[getJsDayToEuDay(d.getDay())]}</span><span class="text-lg font-bold ${isToday && !isSelected ? 'text-indigo-600' : ''}">${d.getDate()}</span>${isToday && !isSelected ? '<div class="w-1 h-1 bg-indigo-600 rounded-full mt-0.5"></div>' : ''}`;
        strip.appendChild(btn);
    }
}

function getJsDayToEuDay(d) {
    return d === 0 ? 7 : d;
}

function getDateStr(d) {
    return d.toISOString().split('T')[0];
}

// ==================== ПИТОМЦЫ ====================
function initEmojiSelector() {
    const container = document.getElementById('emoji-selector');
    if (!container) return;
    
    EMOJIS.forEach(e => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-2xl p-2 rounded-lg hover:bg-slate-100 transition-colors border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500';
        btn.setAttribute('aria-label', `Выбрать аватар: ${e}`);
        btn.textContent = e;
        btn.onclick = () => {
            currentPetAvatar = e;
            currentPetPhoto = null;
            updateAvatarPreview();
            document.getElementById('clear-photo-btn').classList.add('hidden');
        };
        container.appendChild(btn);
    });
}

function updateAvatarPreview() {
    const preview = document.getElementById('avatar-preview');
    if (!preview) return;
    
    if (currentPetPhoto) {
        preview.style.backgroundImage = `url(${currentPetPhoto})`;
        preview.textContent = '';
        document.getElementById('clear-photo-btn').classList.remove('hidden');
    } else {
        preview.style.backgroundImage = 'none';
        preview.textContent = currentPetAvatar;
        document.getElementById('clear-photo-btn').classList.add('hidden');
    }
}

function handlePhotoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width, height = img.height;
            
            if (width > height) {
                if (width > 200) {
                    height *= 200 / width;
                    width = 200;
                }
            } else {
                if (height > 200) {
                    width *= 200 / height;
                    height = 200;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            currentPetPhoto = canvas.toDataURL('image/jpeg', 0.7);
            currentPetAvatar = '';
            updateAvatarPreview();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function clearSelectedPhoto() {
    currentPetPhoto = null;
    currentPetAvatar = '🐾';
    updateAvatarPreview();
    document.getElementById('petPhotoInput').value = '';
}

function openAddPetModal(petId = null) {
    const form = document.getElementById('petForm');
    const title = document.getElementById('petModalTitle');
    if (!form || !title) return;
    
    form.reset();
    document.getElementById('editPetId').value = '';
    title.innerHTML = '<i data-lucide="cat" class="text-indigo-600 w-5 h-5"></i> Новый питомец';
    currentPetPhoto = null;
    currentPetAvatar = '🐾';
    updateAvatarPreview();
    
    if (petId) {
        const pet = state.pets.find(p => p.id === petId);
        if (pet) {
            document.getElementById('editPetId').value = pet.id;
            document.getElementById('petName').value = pet.name;
            document.getElementById('petAge').value = pet.age || '';
            document.getElementById('petBreed').value = pet.breed || '';
            document.getElementById('petRegNumber').value = pet.regNumber || '';
            document.getElementById('petChronic').value = pet.chronic || '';
            document.getElementById('petNotes').value = pet.notes || '';
            title.innerHTML = '<i data-lucide="cat" class="text-indigo-600 w-5 h-5"></i> Редактирование';
            if (pet.photo) {
                currentPetPhoto = pet.photo;
                currentPetAvatar = '';
            } else {
                currentPetAvatar = pet.avatar;
                currentPetPhoto = null;
            }
            updateAvatarPreview();
        }
    }
    openModal('addPetModal');
}

function savePet(e) {
    e.preventDefault();
    const id = document.getElementById('editPetId').value || 'pet_' + Date.now();
    const existing = state.pets.find(p => p.id === id);
    
    const petData = {
        id,
        name: document.getElementById('petName').value.trim(),
        age: document.getElementById('petAge').value.trim(),
        breed: document.getElementById('petBreed').value.trim(),
        regNumber: document.getElementById('petRegNumber').value.trim(),
        chronic: document.getElementById('petChronic').value.trim(),
        notes: document.getElementById('petNotes').value.trim(),
        avatar: currentPetAvatar,
        photo: currentPetPhoto,
        diary: existing && existing.diary ? existing.diary : []
    };
    
    try {
        const errors = validatePetData(petData);
        if (errors.length > 0) {
            alert(errors.join(', '));
            return;
        }
        
        const idx = state.pets.findIndex(p => p.id === id);
        if (idx > -1) {
            state.pets[idx] = petData;
        } else {
            state.pets.push(petData);
        }
        
        saveData();
        renderAll();
        closeModal('addPetModal');
        showToast('Питомец сохранен', petData.name, 'check-circle');
    } catch (error) {
        console.error('Error saving pet:', error);
        alert('Ошибка при сохранении: ' + error.message);
    }
}

function deletePet(id) {
    if (!confirm('Удалить питомца и все его назначения?')) return;
    try {
        store.deletePet(id);
        renderAll();
        showToast('Питомец удален', '', 'trash-2');
    } catch (error) {
        console.error('Error deleting pet:', error);
        alert('Ошибка при удалении');
    }
}

function renderPets() {
    const container = document.getElementById('pets-list-container');
    if (!container) return;
    
    if (!state.pets.length) {
        container.innerHTML = '<div class="text-center py-10 text-slate-400" role="status"><p class="text-4xl mb-2">🐾</p><p>Добавьте первого питомца!</p></div>';
        return;
    }
    
    container.innerHTML = state.pets.map(p => {
        const medsCount = state.meds.filter(m => m.petId === p.id).length;
        const avatar = p.photo
            ? `<div class="w-12 h-12 rounded-xl bg-cover bg-center shadow-inner" style="background-image:url(${escapeHtml(p.photo)})" aria-label="Фото питомца"></div>`
            : `<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-2xl" aria-label="Аватар: ${escapeHtml(p.avatar)}">${escapeHtml(p.avatar)}</div>`;
        
        let subtitleParts = [];
        if (p.age) subtitleParts.push(escapeHtml(p.age));
        if (p.breed) subtitleParts.push(escapeHtml(p.breed));
        if (!subtitleParts.length) subtitleParts.push('Без описания');
        if (p.regNumber) subtitleParts.push(`№${escapeHtml(p.regNumber)}`);
        subtitleParts.push(`${medsCount} назнач.`);
        const subtitle = subtitleParts.join(' • ');

        let chronicBadge = '';
        if (p.chronic) {
            chronicBadge = `<div class="mt-1.5 inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-[10px] border border-amber-100 font-medium">
                <i data-lucide="alert-triangle" class="w-3 h-3" aria-hidden="true"></i> ${escapeHtml(p.chronic)}
            </div>`;
        }

        return `<article class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4" aria-label="Питомец: ${escapeHtml(p.name)}">
            ${avatar}
            <div class="flex-grow overflow-hidden">
                <h4 class="font-bold text-slate-900 truncate">${escapeHtml(p.name)}</h4>
                <p class="text-xs text-slate-500 truncate">${subtitle}</p>
                ${chronicBadge}
            </div>
            <div class="flex gap-1 flex-shrink-0" role="group" aria-label="Действия с питомцем">
                <button onclick="openPetDiary('${escapeHtml(p.id)}')" class="text-slate-400 hover:text-indigo-600 p-1" title="Дневник" aria-label="Открыть дневник">
                    <i data-lucide="notebook-pen" class="w-5 h-5"></i>
                </button>
                <button onclick="openAddPetModal('${escapeHtml(p.id)}')" class="text-slate-400 hover:text-indigo-600 p-1" title="Редактировать" aria-label="Редактировать питомца">
                    <i data-lucide="pencil" class="w-4 h-4"></i>
                </button>
                <button onclick="deletePet('${escapeHtml(p.id)}')" class="text-slate-400 hover:text-red-500 p-1" title="Удалить" aria-label="Удалить питомца">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </article>`;
    }).join('');
    lucide.createIcons();
}

// ==================== ДНЕВНИК ПИТОМЦА ====================
function openPetDiary(petId) {
    currentDiaryPetId = petId;
    const pet = state.pets.find(x => x.id === petId);
    if (!pet) return;
    
    const diaryPetName = document.getElementById('diaryPetName');
    if (diaryPetName) diaryPetName.textContent = pet.name;
    
    const diaryInput = document.getElementById('diaryInput');
    if (diaryInput) diaryInput.value = '';
    
    renderDiaryEntries(petId);
    openModal('petDiaryModal');
}

function addDiaryEntry() {
    const text = document.getElementById('diaryInput').value.trim();
    if (!text) return;
    
    const pet = state.pets.find(x => x.id === currentDiaryPetId);
    if (!pet) return;
    
    if (!pet.diary) pet.diary = [];
    const now = new Date();
    const dateStr = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}, ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    pet.diary.unshift({
        id: 'note_' + Date.now(),
        date: dateStr,
        text: text
    });
    
    saveData();
    document.getElementById('diaryInput').value = '';
    renderDiaryEntries(currentDiaryPetId);
    showToast('Запись добавлена', 'Дневник обновлен', 'notebook-pen');
}

function deleteDiaryEntry(petId, noteId) {
    const pet = state.pets.find(x => x.id === petId);
    if (pet && pet.diary) {
        pet.diary = pet.diary.filter(n => n.id !== noteId);
        saveData();
        renderDiaryEntries(petId);
    }
}

function renderDiaryEntries(petId) {
    const pet = state.pets.find(x => x.id === petId);
    const container = document.getElementById('diaryList');
    if (!container) return;
    
    if (!pet || !pet.diary || !pet.diary.length) {
        container.innerHTML = '<p class="text-center text-slate-400 text-sm py-6">Пока нет записей.<br>Начните вести дневник здоровья!</p>';
        return;
    }
    
    container.innerHTML = pet.diary.map(n => `
        <article class="bg-slate-50 p-3 rounded-xl border border-slate-100 relative" aria-label="Запись от ${escapeHtml(n.date)}">
            <p class="text-xs text-indigo-600 font-semibold mb-1">${escapeHtml(n.date)}</p>
            <p class="text-sm text-slate-700 whitespace-pre-wrap break-words pr-6">${escapeHtml(n.text)}</p>
            <button onclick="deleteDiaryEntry('${escapeHtml(petId)}', '${escapeHtml(n.id)}')" class="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1" aria-label="Удалить запись">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
        </article>
    `).join('');
    lucide.createIcons();
}

// ==================== ЛЕКАРСТВА ====================
function openAddMedModal(medId = null) {
    const form = document.getElementById('medForm');
    const title = document.getElementById('medModalTitle');
    if (!form || !title) return;
    
    form.reset();
    document.getElementById('editMedId').value = '';
    title.innerHTML = '<i data-lucide="pill" class="text-indigo-600 w-5 h-5"></i> Новое назначение';
    
    const select = document.getElementById('medPetId');
    if (select) {
        select.innerHTML = !state.pets.length
            ? '<option value="" disabled selected>Сначала добавьте питомца</option>'
            : state.pets.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    }
    
    if (medId) {
        const med = state.meds.find(x => x.id === medId);
        if (med) {
            document.getElementById('editMedId').value = med.id;
            if (select) select.value = med.petId;
            document.getElementById('medName').value = med.name;
            document.getElementById('medDosage').value = med.dosage;
            document.getElementById('medTime').value = med.time;
            document.getElementById('medNotes').value = med.notes || '';
            const typeRadio = document.querySelector(`input[name="medType"][value="${med.type}"]`);
            if (typeRadio) typeRadio.checked = true;
            document.querySelectorAll('input[name="medDays"]').forEach(cb => {
                cb.checked = med.days.includes(parseInt(cb.value));
            });
            title.innerHTML = '<i data-lucide="pill" class="text-indigo-600 w-5 h-5"></i> Редактирование';
        }
    }
    openModal('addMedModal');
}

function selectAllDays(select) {
    document.querySelectorAll('input[name="medDays"]').forEach(cb => cb.checked = select);
}

function saveMedication(e) {
    e.preventDefault();
    const selectedDays = Array.from(document.querySelectorAll('input[name="medDays"]:checked')).map(cb => parseInt(cb.value));
    
    if (!selectedDays.length) {
        alert("Выберите хотя бы один день!");
        return;
    }
    if (!state.pets.length) {
        alert("Сначала добавьте питомца!");
        return;
    }
    
    const id = document.getElementById('editMedId').value || 'med_' + Date.now();
    const medData = {
        id,
        petId: document.getElementById('medPetId').value,
        name: document.getElementById('medName').value.trim(),
        type: document.querySelector('input[name="medType"]:checked').value,
        dosage: document.getElementById('medDosage').value.trim(),
        time: document.getElementById('medTime').value,
        notes: document.getElementById('medNotes').value.trim(),
        days: selectedDays
    };
    
    try {
        const errors = validateMedData(medData);
        if (errors.length > 0) {
            alert(errors.join(', '));
            return;
        }
        
        const idx = state.meds.findIndex(m => m.id === id);
        if (idx > -1) {
            state.meds[idx] = medData;
        } else {
            state.meds.push(medData);
        }
        
        saveData();
        renderAll();
        closeModal('addMedModal');
        showToast('Назначение сохранено', medData.name, 'check-circle');
    } catch (error) {
        console.error('Error saving medication:', error);
        alert('Ошибка при сохранении: ' + error.message);
    }
}

function deleteMed(id) {
    if (!confirm('Отменить назначение?')) return;
    try {
        store.deleteMed(id);
        renderAll();
        showToast('Назначение отменено', '', 'trash-2');
    } catch (error) {
        console.error('Error deleting medication:', error);
        alert('Ошибка при удалении');
    }
}

function renderMeds() {
    const container = document.getElementById('meds-list-container');
    if (!container) return;
    
    if (!state.meds.length) {
        container.innerHTML = '<div class="text-center py-10 text-slate-400" role="status"><p class="text-4xl mb-2">💊</p><p>Нет назначений.</p></div>';
        return;
    }
    
    const typeIcons = { injection: '💉', pill: '💊', liquid: '🧪', ointment: '🧴' };
    
    container.innerHTML = state.meds.map(m => {
        const pet = state.pets.find(x => x.id === m.petId);
        const petName = pet ? escapeHtml(pet.name) : '<span class="text-red-400 line-through">Удален</span>';
        const daysStr = m.days.map(d => DAYS_MAP[d]).join(', ');
        const typeIcon = typeIcons[m.type] || '💊';
        
        return `<article class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100" aria-label="Лекарство: ${escapeHtml(m.name)}">
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-slate-900">${typeIcon} ${escapeHtml(m.name)}</h4>
                    <p class="text-xs text-slate-500 mt-1">Для: ${petName}</p>
                </div>
                <div class="flex gap-2" role="group" aria-label="Действия">
                    <button onclick="openAddMedModal('${escapeHtml(m.id)}')" class="text-slate-400 hover:text-indigo-600 p-1" aria-label="Редактировать">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteMed('${escapeHtml(m.id)}')" class="text-slate-400 hover:text-red-500 p-1" aria-label="Удалить">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium">${escapeHtml(m.dosage)}</span>
                <span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-medium">🕐 ${escapeHtml(m.time)}</span>
                <span class="bg-slate-50 text-slate-500 px-2 py-1 rounded-md border border-dashed border-slate-200">${escapeHtml(daysStr)}</span>
            </div>
            ${m.notes ? `<div class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg flex gap-2" role="note">
                <span aria-hidden="true">💡</span><span>${escapeHtml(m.notes)}</span>
            </div>` : ''}
        </article>`;
    }).join('');
    lucide.createIcons();
}

// ==================== РАСПИСАНИЕ И ПРОГРЕСС ====================
function getTasksForDate(date) {
    const dateStr = getDateStr(date);
    const euDay = getJsDayToEuDay(date.getDay());
    
    return state.meds
        .filter(m => m.days.includes(euDay))
        .map(m => {
            const pet = state.pets.find(x => x.id === m.petId);
            return {
                ...m,
                petName: pet ? pet.name : 'Удален',
                petAvatar: pet?.avatar || '❓',
                isCompleted: state.completions[dateStr]?.[m.id] === true
            };
        })
        .sort((a, b) => a.time.localeCompare(b.time));
}

function renderSchedule() {
    const dateStr = getDateStr(selectedDate);
    const tasks = getTasksForDate(selectedDate);
    const container = document.getElementById('today-tasks-container');
    if (!container) return;
    
    const isToday = getDateStr(new Date()) === dateStr;
    const progressTitle = document.getElementById('progress-title');
    if (progressTitle) {
        progressTitle.textContent = isToday ? 'План на сегодня' : `План на ${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]}`;
    }
    
    const completedCount = tasks.filter(t => t.isCompleted).length;
    const totalCount = tasks.length;
    const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
    
    const progressText = document.getElementById('treatment-progress-text');
    if (progressText) {
        progressText.textContent = totalCount === 0 ? 'Нет процедур' : `Выполнено ${completedCount} из ${totalCount}`;
    }
    
    const progressPercent = document.getElementById('progress-percent');
    const progressBar = document.getElementById('progress-bar');
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
    
    if (!tasks.length) {
        container.innerHTML = '<div class="text-center py-8 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200" role="status"><p class="text-3xl mb-2">😎</p><p>Свободный день!</p></div>';
        return;
    }
    
    const typeIcons = { injection: '💉', pill: '💊', liquid: '🧪', ointment: '🧴' };
    
    container.innerHTML = tasks.map(t => {
        const typeIcon = typeIcons[t.type] || '💊';
        const isChecked = t.isCompleted;
        
        return `<article class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-start gap-4 transition-all ${isChecked ? 'opacity-60 bg-slate-50' : ''}" aria-label="Процедура: ${escapeHtml(t.name)}">
            <button onclick="toggleTask('${dateStr}','${escapeHtml(t.id)}')" 
                class="w-8 h-8 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-indigo-400'}"
                aria-pressed="${isChecked}"
                aria-label="${isChecked ? 'Отметить как невыполненное' : 'Отметить как выполненное'}">
                ${isChecked ? '<i data-lucide="check" class="w-4 h-4"></i>' : ''}
            </button>
            <div class="flex-grow ${isChecked ? 'line-through text-slate-500' : ''}">
                <div class="font-semibold text-sm text-slate-900">
                    ${typeIcon} ${escapeHtml(t.name)} <span class="text-xs font-normal text-slate-500">(${escapeHtml(t.dosage)})</span>
                </div>
                <div class="text-xs text-slate-500 mt-0.5">
                    ${escapeHtml(t.petAvatar)} ${escapeHtml(t.petName)} • 🕐 ${escapeHtml(t.time)}
                </div>
                ${t.notes ? `<div class="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-md mt-2 flex gap-1.5" role="note">
                    <span aria-hidden="true">💡</span><span>${escapeHtml(t.notes)}</span>
                </div>` : ''}
            </div>
        </article>`;
    }).join('');
    lucide.createIcons();
}

function toggleTask(dateStr, medId) {
    try {
        if (!state.completions[dateStr]) {
            state.completions[dateStr] = {};
        }
        const willBeDone = !state.completions[dateStr][medId];
        state.completions[dateStr][medId] = willBeDone;
        
        if (willBeDone) {
            playCompletionSound();
        } else {
            delete state.completions[dateStr][medId];
            if (!Object.keys(state.completions[dateStr]).length) {
                delete state.completions[dateStr];
            }
        }
        
        saveData();
        renderSchedule();
        updateStats();
        updateAppBadge();
    } catch (error) {
        console.error('Error toggling task:', error);
        alert('Ошибка при обновлении статуса');
    }
}

function resetDayCompletions() {
    const dateStr = getDateStr(selectedDate);
    if (state.completions[dateStr] && confirm('Сбросить все выполненные процедуры за этот день?')) {
        delete state.completions[dateStr];
        saveData();
        renderSchedule();
        updateStats();
        updateAppBadge();
    }
}

function updateStats() {
    const petsCount = document.getElementById('stat-pets-count');
    const medsCount = document.getElementById('stat-active-meds');
    const completedToday = document.getElementById('stat-completed-today');
    
    if (petsCount) petsCount.textContent = state.pets.length;
    if (medsCount) medsCount.textContent = state.meds.length;
    if (completedToday) completedToday.textContent = getTasksForDate(new Date()).filter(t => t.isCompleted).length;
}

// ==================== НАСТРОЙКИ ====================
function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dva_hvosta_${getDateStr(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Данные экспортированы', 'Файл загружен', 'download');
}

function importData(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.pets && Array.isArray(imported.pets) && imported.meds && Array.isArray(imported.meds)) {
                state = imported;
                saveData();
                renderAll();
                closeModal('settingsModal');
                showToast('Данные импортированы', 'Все данные восстановлены', 'upload');
            } else {
                alert("Ошибка формата: файл должен содержать pets и meds");
            }
        } catch (err) {
            console.error('Import error:', err);
            alert("Ошибка чтения файла: неверный формат JSON");
        }
    };
    reader.readAsText(file);
    ev.target.value = '';
}

function clearAllData() {
    if (confirm("⚠️ Вы уверены? Это удалит ВСЕ данные без возможности восстановления!")) {
        localStorage.removeItem(STORAGE_KEY);
        state = { pets: [], meds: [], completions: {} };
        renderAll();
        closeModal('settingsModal');
        updateAppBadge();
        showToast('Данные удалены', 'Приложение сброшено', 'trash-2');
    }
}

// ==================== ОБЩИЙ РЕНДЕР ====================
function renderAll() {
    renderPets();
    renderMeds();
    renderSchedule();
    updateStats();
    lucide.createIcons();
    updateAppBadge();
}

// ==================== БЕЙДЖ ИКОНКИ ПРИЛОЖЕНИЯ ====================
function updateAppBadge() {
    if ('setAppBadge' in navigator) {
        const todayTasks = getTasksForDate(new Date());
        const pending = todayTasks.filter(t => !t.isCompleted).length;
        if (pending > 0) navigator.setAppBadge(pending).catch(e => console.log('Badge set failed', e));
        else navigator.clearAppBadge().catch(e => console.log('Badge clear failed', e));
    }
}

// ==================== УСТАНОВКА PWA ====================
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installAppBtn').classList.remove('hidden');
    showToast('Приложение готово к установке!', 'Нажмите кнопку "Установить" в приветственном окне.', 'download');
});

function triggerPwaInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showToast('Установка началась', 'Ищите иконку на главном экране!', 'check-circle');
                closeWelcomeModal();
            } else {
                showToast('Установка отменена', 'Вы можете установить приложение позже через меню браузера.', 'info');
            }
            deferredPrompt = null;
            document.getElementById('installAppBtn').classList.add('hidden');
        });
    } else {
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isChrome = /Chrome/i.test(navigator.userAgent);
        if (isAndroid && isChrome) {
            showToast('Ручная установка', 'Нажмите на три точки в правом верхнем углу Chrome и выберите "Установить приложение" или "Добавить на главный экран".', 'info');
        } else {
            showToast('Как установить', 'Откройте меню браузера и выберите "Добавить на главный экран".', 'info');
        }
    }
}

// ==================== ТЕМЫ ОФОРМЛЕНИЯ ====================
function loadTheme() { const savedTheme = localStorage.getItem(THEME_KEY) || 'default'; applyTheme(savedTheme); }
function setTheme(themeName) { localStorage.setItem(THEME_KEY, themeName); applyTheme(themeName); showToast('Тема изменена', 'Приложение обновлено', 'palette'); }
function applyTheme(themeName) {
    document.body.classList.remove('theme-default', 'theme-green', 'theme-pink', 'theme-amber');
    document.body.classList.add('theme-' + themeName);
    document.getElementById('meta-theme-color').setAttribute('content', themeColors[themeName]);
    document.querySelectorAll('.theme-option').forEach(el => {
        if (el.dataset.theme === themeName) { el.classList.add('border-slate-800', 'scale-105'); el.classList.remove('border-transparent'); } 
        else { el.classList.remove('border-slate-800', 'scale-105'); el.classList.add('border-transparent'); }
    });
}

// ==================== ПРИВЕТСТВЕННОЕ ОКНО ====================
function checkFirstVisit() {
    if (!localStorage.getItem(WELCOME_KEY)) {
        openModal('welcomeModal');
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isStandalone) return;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) document.getElementById('iosInstallHint').classList.remove('hidden');
        else if (deferredPrompt) document.getElementById('installAppBtn').classList.remove('hidden');
    }
}
function closeWelcomeModal() { closeModal('welcomeModal'); localStorage.setItem(WELCOME_KEY, 'true'); }

// ==================== СВАЙПЫ И ЖЕСТЫ ====================
function setupSwipeGestures() {
    const container = document.getElementById('swipe-container'); let touchStartX = 0; let touchEndX = 0;
    container.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    container.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; handleSwipe(touchStartX, touchEndX); }, { passive: true });
}
function handleSwipe(startX, endX) {
    const diff = startX - endX; if (Math.abs(diff) < 80) return;
    if (diff > 0 && activeTabIdx < TABS.length - 1) switchTab(TABS[activeTabIdx + 1], activeTabIdx + 1);
    else if (diff < 0 && activeTabIdx > 0) switchTab(TABS[activeTabIdx - 1], activeTabIdx - 1);
}

// ==================== УВЕДОМЛЕНИЯ ====================

function showToast(title, body, icon = 'info') {
    const container = document.getElementById('toast-container'); const toast = document.createElement('div');
    toast.className = 'toast-enter bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3 w-full max-w-sm pointer-events-auto cursor-pointer';
    toast.onclick = () => removeToast(toast);
    toast.innerHTML = `<div class="bg-indigo-100 text-indigo-600 p-2 rounded-xl flex-shrink-0"><i data-lucide="${icon}" class="w-5 h-5"></i></div><div class="flex-grow"><h4 class="font-bold text-sm text-slate-900">${title}</h4><p class="text-xs text-slate-500 mt-0.5">${body}</p></div>`;
    container.appendChild(toast); lucide.createIcons(); setTimeout(() => removeToast(toast), 5000);
}
function removeToast(toastElement) { if (!toastElement.parentNode) return; toastElement.classList.remove('toast-enter'); toastElement.classList.add('toast-exit'); setTimeout(() => toastElement.remove(), 300); }
function playCompletionSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination); osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime); gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1000, audioCtx.currentTime + 0.15); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
}

// ==================== НАВИГАЦИЯ ====================
function switchTab(tabName, idx = null) {
    if (idx !== null) activeTabIdx = idx; else activeTabIdx = TABS.indexOf(tabName);
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.remove('text-indigo-600', 'bg-indigo-50/70'); btn.classList.add('text-slate-500');
        if (i === activeTabIdx) { btn.classList.add('text-indigo-600', 'bg-indigo-50/70'); btn.classList.remove('text-slate-500'); }
    });
    document.querySelectorAll('main > div').forEach(div => { div.classList.add('hidden'); div.classList.remove('fade-in'); });
    const target = document.getElementById(`content-${tabName}`); target.classList.remove('hidden'); void target.offsetWidth; target.classList.add('fade-in');
    window.scrollTo({ top: 0, behavior: 'smooth' }); lucide.createIcons();
}
function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.body.classList.add('modal-open'); lucide.createIcons(); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); document.body.classList.remove('modal-open'); }
function setupSmartScroll() { let lY = window.scrollY; const c = document.getElementById('calendar-wrapper'); window.addEventListener('scroll', () => { const cY = window.scrollY; if(cY > lY && cY > 150) c.classList.add('calendar-hidden'); else c.classList.remove('calendar-hidden'); lY = cY; }, {passive:true}); }

// ==================== КАЛЕНДАРЬ ====================
function renderCalendar() {
    const s = document.getElementById('calendar-strip'); s.innerHTML = ''; const t = new Date();
    for(let i=-3; i<=3; i++) { const d=new Date(selectedDate); d.setDate(d.getDate()+i); const isT=d.toDateString()===t.toDateString(); const isS=d.toDateString()===selectedDate.toDateString();
    const b=document.createElement('button'); b.onclick=()=>{selectedDate=d; renderCalendar(); renderSchedule();};
    b.className=`flex flex-col items-center p-1.5 rounded-xl transition-all ${isS?'bg-indigo-600 text-white shadow-md scale-105':'hover:bg-slate-100 text-slate-600'}`;
    b.innerHTML=`<span class="text-[10px] font-medium ${isS?'text-indigo-200':'text-slate-400'}">${DAYS_MAP[getJsDayToEuDay(d.getDay())]}</span><span class="text-lg font-bold ${isT&&!isS?'text-indigo-600':''}">${d.getDate()}</span>${isT&&!isS?'<div class="w-1 h-1 bg-indigo-600 rounded-full mt-0.5"></div>':''}`;
    s.appendChild(b); }
}
function getJsDayToEuDay(d) { return d===0?7:d; }
function getDateStr(d) { return d.toISOString().split('T')[0]; }

// ==================== ПИТОМЦЫ ====================
function initEmojiSelector() { const c=document.getElementById('emoji-selector'); EMOJIS.forEach(e=>{ const b=document.createElement('button'); b.type='button'; b.className='text-2xl p-2 rounded-lg hover:bg-slate-100 transition-colors border-2 border-transparent focus:outline-none'; b.textContent=e; b.onclick=()=>{currentPetAvatar=e; currentPetPhoto=null; updateAvatarPreview(); document.getElementById('clear-photo-btn').classList.add('hidden');}; c.appendChild(b); }); }
function updateAvatarPreview() { const p=document.getElementById('avatar-preview'); if(currentPetPhoto){p.style.backgroundImage=`url(${currentPetPhoto})`;p.textContent='';document.getElementById('clear-photo-btn').classList.remove('hidden');}else{p.style.backgroundImage='none';p.textContent=currentPetAvatar;document.getElementById('clear-photo-btn').classList.add('hidden');} }
function handlePhotoUpload(input) { const f=input.files[0]; if(!f)return; const r=new FileReader(); r.onload=function(e){ const img=new Image(); img.onload=function(){ const c=document.createElement('canvas'); let w=img.width,h=img.height; if(w>h){if(w>200){h*=200/w;w=200;}}else{if(h>200){w*=200/h;h=200;}} c.width=w;c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); currentPetPhoto=c.toDataURL('image/jpeg',0.7); currentPetAvatar=''; updateAvatarPreview(); }; img.src=e.target.result; }; r.readAsDataURL(f); }
function clearSelectedPhoto() { currentPetPhoto=null; currentPetAvatar='🐾'; updateAvatarPreview(); document.getElementById('petPhotoInput').value=''; }

function openAddPetModal(petId=null) {
    document.getElementById('petForm').reset(); document.getElementById('editPetId').value=''; document.getElementById('petModalTitle').innerHTML='<i data-lucide="cat" class="text-indigo-600 w-5 h-5"></i> Новый питомец'; currentPetPhoto=null; currentPetAvatar='🐾'; updateAvatarPreview();
    if(petId){ 
        const p=state.pets.find(x=>x.id===petId); 
        if(p){ 
            document.getElementById('editPetId').value=p.id; 
            document.getElementById('petName').value=p.name; 
            document.getElementById('petAge').value = p.age || ''; 
            document.getElementById('petBreed').value=p.breed||''; 
            document.getElementById('petRegNumber').value = p.regNumber || '';
            document.getElementById('petChronic').value = p.chronic || '';
            document.getElementById('petNotes').value = p.notes || '';
            document.getElementById('petModalTitle').innerHTML='<i data-lucide="cat" class="text-indigo-600 w-5 h-5"></i> Редактирование'; 
            if(p.photo){currentPetPhoto=p.photo;currentPetAvatar='';}else{currentPetAvatar=p.avatar;currentPetPhoto=null;} 
            updateAvatarPreview(); 
        } 
    }
    openModal('addPetModal');
}
function savePet(e) { 
    e.preventDefault(); 
    const id=document.getElementById('editPetId').value||'pet_'+Date.now(); 
    const existing = state.pets.find(p => p.id === id);
    const d={
        id, 
        name:document.getElementById('petName').value.trim(), 
        age: document.getElementById('petAge').value.trim(), 
        breed:document.getElementById('petBreed').value.trim(), 
        regNumber: document.getElementById('petRegNumber').value.trim(), 
        chronic: document.getElementById('petChronic').value.trim(),   
        notes: document.getElementById('petNotes').value.trim(),       
        avatar:currentPetAvatar, 
        photo:currentPetPhoto,
        diary: existing && existing.diary ? existing.diary : [] 
    }; 
    const i=state.pets.findIndex(p=>p.id===id); 
    if(i>-1) state.pets[i]=d; 
    else state.pets.push(d); 
    saveData(); 
    renderAll(); 
    closeModal('addPetModal'); 
}
function deletePet(id) { if(!confirm('Удалить питомца и все его назначения?'))return; state.pets=state.pets.filter(p=>p.id!==id); state.meds=state.meds.filter(m=>m.petId!==id); saveData(); renderAll(); }

function renderPets() {
    const c=document.getElementById('pets-list-container');
    if(!state.pets.length){c.innerHTML='<div class="text-center py-10 text-slate-400"><p class="text-4xl mb-2">🐾</p><p>Добавьте первого питомца!</p></div>';return;}
    
    c.innerHTML=state.pets.map(p=>{
        const mc=state.meds.filter(m=>m.petId===p.id).length; 
        const a=p.photo?`<div class="w-12 h-12 rounded-xl bg-cover bg-center shadow-inner" style="background-image:url(${p.photo})"></div>`:`<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">${p.avatar}</div>`; 
        
        let subtitleParts = [];
        if (p.age) subtitleParts.push(p.age);
        if (p.breed) subtitleParts.push(p.breed);
        if (!subtitleParts.length) subtitleParts.push('Без описания');
        if (p.regNumber) subtitleParts.push(`№${p.regNumber}`);
        subtitleParts.push(`${mc} назнач.`);
        let subtitle = subtitleParts.join(' • ');

        let chronicBadge = '';
        if (p.chronic) {
            chronicBadge = `<div class="mt-1.5 inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-[10px] border border-amber-100 font-medium">
                <i data-lucide="alert-triangle" class="w-3 h-3"></i> ${p.chronic}
            </div>`;
        }

        return `<div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            ${a}
            <div class="flex-grow overflow-hidden">
                <h4 class="font-bold text-slate-900 truncate">${p.name}</h4>
                <p class="text-xs text-slate-500 truncate">${subtitle}</p>
                ${chronicBadge}
            </div>
            <div class="flex gap-1 flex-shrink-0">
                <button onclick="openPetDiary('${p.id}')" class="text-slate-400 hover:text-indigo-600 p-1" title="Дневник"><i data-lucide="notebook-pen" class="w-5 h-5"></i></button>
                <button onclick="openAddPetModal('${p.id}')" class="text-slate-400 hover:text-indigo-600 p-1" title="Редактировать"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deletePet('${p.id}')" class="text-slate-400 hover:text-red-500 p-1" title="Удалить"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>`; 
    }).join('');
    lucide.createIcons();
}

// ==================== ДНЕВНИК ПИТОМЦА ====================
function openPetDiary(petId) {
    currentDiaryPetId = petId;
    const p = state.pets.find(x => x.id === petId);
    if (!p) return;
    document.getElementById('diaryPetName').textContent = p.name;
    document.getElementById('diaryInput').value = '';
    renderDiaryEntries(petId);
    openModal('petDiaryModal');
}
function addDiaryEntry() {
    const text = document.getElementById('diaryInput').value.trim();
    if (!text) return;
    const p = state.pets.find(x => x.id === currentDiaryPetId);
    if (!p) return;
    if (!p.diary) p.diary = [];
    const now = new Date();
    const dateStr = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}, ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    p.diary.unshift({ id: 'note_'+Date.now(), date: dateStr, text: text });
    saveData();
    document.getElementById('diaryInput').value = '';
    renderDiaryEntries(currentDiaryPetId);
    showToast('Запись добавлена', 'Дневник обновлен', 'notebook-pen');
}
function deleteDiaryEntry(petId, noteId) {
    const p = state.pets.find(x => x.id === petId);
    if (p && p.diary) { p.diary = p.diary.filter(n => n.id !== noteId); saveData(); renderDiaryEntries(petId); }
}
function renderDiaryEntries(petId) {
    const p = state.pets.find(x => x.id === petId);
    const c = document.getElementById('diaryList');
    if (!p || !p.diary || !p.diary.length) { c.innerHTML = '<p class="text-center text-slate-400 text-sm py-6">Пока нет записей.<br>Начните вести дневник здоровья!</p>'; return; }
    c.innerHTML = p.diary.map(n => `
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 relative">
            <p class="text-xs text-indigo-600 font-semibold mb-1">${n.date}</p>
            <p class="text-sm text-slate-700 whitespace-pre-wrap break-words pr-6">${n.text}</p>
            <button onclick="deleteDiaryEntry('${petId}', '${n.id}')" class="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
}

// ==================== ЛЕКАРСТВА ====================
function openAddMedModal(medId=null) {
    document.getElementById('medForm').reset(); document.getElementById('editMedId').value=''; document.getElementById('medModalTitle').innerHTML='<i data-lucide="pill" class="text-indigo-600 w-5 h-5"></i> Новое назначение';
    const s=document.getElementById('medPetId'); s.innerHTML=!state.pets.length?'<option value="" disabled selected>Сначала добавьте питомца</option>':state.pets.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    if(medId){ const m=state.meds.find(x=>x.id===medId); if(m){ document.getElementById('editMedId').value=m.id; s.value=m.petId; document.getElementById('medName').value=m.name; document.getElementById('medDosage').value=m.dosage; document.getElementById('medTime').value=m.time; document.getElementById('medNotes').value=m.notes||''; document.querySelector(`input[name="medType"][value="${m.type}"]`).checked=true; document.querySelectorAll('input[name="medDays"]').forEach(cb=>{cb.checked=m.days.includes(parseInt(cb.value));}); document.getElementById('medModalTitle').innerHTML='<i data-lucide="pill" class="text-indigo-600 w-5 h-5"></i> Редактирование'; } }
    openModal('addMedModal');
}
function selectAllDays(st) { document.querySelectorAll('input[name="medDays"]').forEach(cb=>cb.checked=st); }
function saveMedication(e) { e.preventDefault(); const sd=Array.from(document.querySelectorAll('input[name="medDays"]:checked')).map(cb=>parseInt(cb.value)); if(!sd.length){alert("Выберите день!");return;} if(!state.pets.length){alert("Добавьте питомца!");return;} const id=document.getElementById('editMedId').value||'med_'+Date.now(); const d={id, petId:document.getElementById('medPetId').value, name:document.getElementById('medName').value.trim(), type:document.querySelector('input[name="medType"]:checked').value, dosage:document.getElementById('medDosage').value.trim(), time:document.getElementById('medTime').value, notes:document.getElementById('medNotes').value.trim(), days:sd}; const i=state.meds.findIndex(m=>m.id===id); if(i>-1)state.meds[i]=d; else state.meds.push(d); saveData(); renderAll(); closeModal('addMedModal'); }
function deleteMed(id) { if(!confirm('Отменить назначение?'))return; state.meds=state.meds.filter(m=>m.id!==id); saveData(); renderAll(); }

function renderMeds() {
    const c=document.getElementById('meds-list-container');
    if(!state.meds.length){c.innerHTML='<div class="text-center py-10 text-slate-400"><p class="text-4xl mb-2">💊</p><p>Нет назначений.</p></div>';return;}
    c.innerHTML=state.meds.map(m=>{ const p=state.pets.find(x=>x.id===m.petId); const pn=p?p.name:'<span class="text-red-400 line-through">Удален</span>'; const ds=m.days.map(d=>DAYS_MAP[d]).join(', '); const ti={injection:'💉',pill:'💊',liquid:'🧪',ointment:'🧴'}[m.type]||'💊'; return `<div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100"><div class="flex justify-between items-start"><div><h4 class="font-bold text-slate-900">${ti} ${m.name}</h4><p class="text-xs text-slate-500 mt-1">Для: ${pn}</p></div><div class="flex gap-2"><button onclick="openAddMedModal('${m.id}')" class="text-slate-400 hover:text-indigo-600 p-1"><i data-lucide="pencil" class="w-4 h-4"></i></button><button onclick="deleteMed('${m.id}')" class="text-slate-400 hover:text-red-500 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div></div><div class="mt-3 flex flex-wrap gap-2 text-[11px]"><span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium">${m.dosage}</span><span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-medium">🕐 ${m.time}</span><span class="bg-slate-50 text-slate-500 px-2 py-1 rounded-md border border-dashed border-slate-200">${ds}</span></div>${m.notes?`<div class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg flex gap-2"><span>💡</span><span>${m.notes}</span></div>`:''}</div>`; }).join('');
    lucide.createIcons();
}

// ==================== РАСПИСАНИЕ И ПРОГРЕСС ====================
function getTasksForDate(date) {
    const ds=getDateStr(date); const ed=getJsDayToEuDay(date.getDay());
    return state.meds.filter(m=>m.days.includes(ed)).map(m=>{ const p=state.pets.find(x=>x.id===m.petId); return {...m, petName:p?p.name:'Удален', petAvatar:p?.avatar||'❓', isCompleted:state.completions[ds]?.[m.id]===true}; }).sort((a,b)=>a.time.localeCompare(b.time));
}
function renderSchedule() {
    const ds=getDateStr(selectedDate); const tasks=getTasksForDate(selectedDate); const c=document.getElementById('today-tasks-container');
    const isT=getDateStr(new Date())===ds; document.getElementById('progress-title').textContent=isT?'План на сегодня':`План на ${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]}`;
    const cc=tasks.filter(t=>t.isCompleted).length; const tc=tasks.length; const p=tc===0?0:Math.round((cc/tc)*100);
    document.getElementById('treatment-progress-text').textContent=tc===0?'Нет процедур':`Выполнено ${cc} из ${tc}`;
    document.getElementById('progress-percent').textContent=`${p}%`; document.getElementById('progress-bar').style.width=`${p}%`;
    if(!tc){c.innerHTML='<div class="text-center py-8 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200"><p class="text-3xl mb-2">😎</p><p>Свободный день!</p></div>';return;}
    c.innerHTML=tasks.map(t=>{ const ti={injection:'💉',pill:'💊',liquid:'🧪',ointment:'🧴'}[t.type]||'💊'; return `<div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-start gap-4 transition-all ${t.isCompleted?'opacity-60 bg-slate-50':''}"><button onclick="toggleTask('${ds}','${t.id}')" class="w-8 h-8 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${t.isCompleted?'bg-green-500 border-green-500 text-white':'border-slate-300 hover:border-indigo-400'}">${t.isCompleted?'<i data-lucide="check" class="w-4 h-4"></i>':''}</button><div class="flex-grow ${t.isCompleted?'line-through text-slate-500':''}"><div class="font-semibold text-sm text-slate-900">${ti} ${t.name} <span class="text-xs font-normal text-slate-500">(${t.dosage})</span></div><div class="text-xs text-slate-500 mt-0.5">${t.petAvatar} ${t.petName} • 🕐 ${t.time}</div>${t.notes?`<div class="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-md mt-2 flex gap-1.5"><span>💡</span><span>${t.notes}</span></div>`:''}</div></div>`; }).join('');
    lucide.createIcons();
}
function toggleTask(ds, mId) {
    if(!state.completions[ds]) state.completions[ds]={}; const willBeDone=!state.completions[ds][mId]; state.completions[ds][mId]=willBeDone;
    if(willBeDone) playCompletionSound();
    if(!willBeDone){delete state.completions[ds][mId]; if(!Object.keys(state.completions[ds]).length)delete state.completions[ds];}
    saveData(); renderSchedule(); updateStats(); updateAppBadge();
}
function resetDayCompletions() { const ds=getDateStr(selectedDate); if(state.completions[ds]&&confirm('Сбросить день?')){delete state.completions[ds]; saveData(); renderSchedule(); updateStats(); updateAppBadge();} }
function updateStats() { document.getElementById('stat-pets-count').textContent=state.pets.length; document.getElementById('stat-active-meds').textContent=state.meds.length; document.getElementById('stat-completed-today').textContent=getTasksForDate(new Date()).filter(t=>t.isCompleted).length; }

// ==================== НАСТРОЙКИ ====================
function exportData() { const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`dva_hvosta_${getDateStr(new Date())}.json`; a.click(); URL.revokeObjectURL(u); }
function importData(ev) { const f=ev.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=function(e){try{const s=JSON.parse(e.target.result);if(s.pets&&s.meds){state=s;saveData();renderAll();closeModal('settingsModal');alert("Импортировано!");}else alert("Ошибка формата");}catch(e){alert("Ошибка чтения");}}; r.readAsText(f); ev.target.value=''; }
function clearAllData() { if(confirm("Удалить ВСЕ данные?")){localStorage.removeItem(STORAGE_KEY);state={pets:[],meds:[],completions:{},appointments:[]};renderAll();closeModal('settingsModal');updateAppBadge();} }

// ==================== ОБЩИЙ РЕНДЕР ====================
function renderAll() { renderPets(); renderMeds(); renderAppointments(); renderSchedule(); updateStats(); lucide.createIcons(); updateAppBadge(); }

// ==================== ПРИЕМЫ К ВРАЧУ ====================
function openAddAppointmentModal(appointmentId = null) {
    const form = document.getElementById('appointmentForm');
    const title = document.getElementById('appointmentModalTitle');
    if (!form || !title) return;
    
    form.reset();
    document.getElementById('editAppointmentId').value = '';
    title.innerHTML = '<i data-lucide="calendar-clock" class="text-indigo-600 w-5 h-5"></i> Запись на прием';
    
    const select = document.getElementById('appointmentPetId');
    if (select) {
        select.innerHTML = !state.pets.length
            ? '<option value="" disabled selected>Сначала добавьте питомца</option>'
            : state.pets.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    }
    
    if (appointmentId) {
        const appointment = state.appointments.find(x => x.id === appointmentId);
        if (appointment) {
            document.getElementById('editAppointmentId').value = appointment.id;
            if (select) select.value = appointment.petId;
            document.getElementById('appointmentDate').value = appointment.date;
            document.getElementById('appointmentTime').value = appointment.time;
            document.getElementById('appointmentClinic').value = appointment.clinic;
            document.getElementById('appointmentAddress').value = appointment.address || '';
            document.getElementById('appointmentDoctor').value = appointment.doctor;
            document.getElementById('appointmentDoctorTitle').value = appointment.doctorTitle || '';
            document.getElementById('appointmentNotes').value = appointment.notes || '';
            title.innerHTML = '<i data-lucide="calendar-clock" class="text-indigo-600 w-5 h-5"></i> Редактирование приема';
        }
    }
    openModal('addAppointmentModal');
}

function saveAppointment(e) {
    e.preventDefault();
    
    if (!state.pets.length) {
        alert("Сначала добавьте питомца!");
        return;
    }
    
    const id = document.getElementById('editAppointmentId').value || 'apt_' + Date.now();
    const appointmentData = {
        id,
        petId: document.getElementById('appointmentPetId').value,
        date: document.getElementById('appointmentDate').value,
        time: document.getElementById('appointmentTime').value,
        clinic: document.getElementById('appointmentClinic').value.trim(),
        address: document.getElementById('appointmentAddress').value.trim(),
        doctor: document.getElementById('appointmentDoctor').value.trim(),
        doctorTitle: document.getElementById('appointmentDoctorTitle').value.trim(),
        notes: document.getElementById('appointmentNotes').value.trim()
    };
    
    try {
        const idx = state.appointments.findIndex(a => a.id === id);
        if (idx > -1) {
            state.appointments[idx] = appointmentData;
        } else {
            state.appointments.push(appointmentData);
        }
        
        saveData();
        renderAppointments();
        closeModal('addAppointmentModal');
        showToast('Прием записан', `${appointmentData.clinic}, ${appointmentData.date}`, 'calendar-check');
    } catch (error) {
        console.error('Error saving appointment:', error);
        alert('Ошибка при сохранении: ' + error.message);
    }
}

function deleteAppointment(id) {
    if (!confirm('Отменить запись на прием?')) return;
    try {
        state.appointments = state.appointments.filter(a => a.id !== id);
        saveData();
        renderAppointments();
        showToast('Запись отменена', '', 'trash-2');
    } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Ошибка при удалении');
    }
}

function renderAppointments() {
    const container = document.getElementById('appointments-list-container');
    if (!container) return;
    
    // Сортируем приемы по дате и времени
    const sortedAppointments = [...state.appointments].sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA - dateB;
    });
    
    if (!sortedAppointments.length) {
        container.innerHTML = '<div class="text-center py-10 text-slate-400" role="status"><p class="text-4xl mb-2">🏥</p><p>Нет записей к врачу.</p></div>';
        return;
    }
    
    container.innerHTML = sortedAppointments.map(a => {
        const pet = state.pets.find(x => x.id === a.petId);
        const petName = pet ? escapeHtml(pet.name) : '<span class="text-red-400 line-through">Удален</span>';
        const petAvatar = pet ? pet.avatar : '❓';
        const isPast = new Date(`${a.date}T${a.time}`) < new Date();
        
        return `<article class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 ${isPast ? 'opacity-70 bg-slate-50' : ''}" aria-label="Прием: ${escapeHtml(a.clinic)}">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${petAvatar}</span>
                    <div>
                        <h4 class="font-bold text-slate-900">${escapeHtml(a.clinic)}</h4>
                        <p class="text-xs text-slate-500 mt-0.5">${petName}</p>
                    </div>
                </div>
                <div class="flex gap-2" role="group" aria-label="Действия">
                    <button onclick="openAddAppointmentModal('${escapeHtml(a.id)}')" class="text-slate-400 hover:text-indigo-600 p-1" aria-label="Редактировать">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteAppointment('${escapeHtml(a.id)}')" class="text-slate-400 hover:text-red-500 p-1" aria-label="Удалить">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            <div class="mt-3 space-y-2">
                <div class="flex flex-wrap gap-2 text-[11px]">
                    <span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-medium flex items-center gap-1">
                        <i data-lucide="calendar" class="w-3 h-3"></i> ${formatAppointmentDate(a.date)}
                    </span>
                    <span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium flex items-center gap-1">
                        <i data-lucide="clock" class="w-3 h-3"></i> ${escapeHtml(a.time)}
                    </span>
                </div>
                <div class="text-xs text-slate-600 flex items-center gap-1.5">
                    <i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i>
                    <span>${escapeHtml(a.address || 'Адрес не указан')}</span>
                </div>
                <div class="text-xs text-slate-600 flex items-center gap-1.5">
                    <i data-lucide="user" class="w-3 h-3 text-slate-400"></i>
                    <span>${escapeHtml(a.doctor)}${a.doctorTitle ? ` (${escapeHtml(a.doctorTitle)})` : ''}</span>
                </div>
                ${a.notes ? `<div class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg flex gap-2" role="note">
                    <span aria-hidden="true">💡</span><span>${escapeHtml(a.notes)}</span>
                </div>` : ''}
            </div>
        </article>`;
    }).join('');
    lucide.createIcons();
}

function formatAppointmentDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    const dayOfWeek = DAYS_MAP[getJsDayToEuDay(date.getDay())];
    return `${day} ${month} ${year}, ${dayOfWeek}`;
}

// Добавляем отображение ближайших приемов в расписание
function getUpcomingAppointments(limit = 3) {
    const now = new Date();
    return state.appointments
        .filter(a => new Date(`${a.date}T${a.time}`) >= now)
        .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
        .slice(0, limit);
}

