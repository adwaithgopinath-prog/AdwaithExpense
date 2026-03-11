const API_BASE = '/api/auth';
const EXPENSE_API_BASE = '/api/expenses';
const INCOME_API_BASE = '/api/income';
let authToken = localStorage.getItem('token') || null;

// Ensure token from OAuth flow in URL is captured
const urlParams = new URLSearchParams(window.location.search);
if(urlParams.get('token')) {
    authToken = urlParams.get('token');
    localStorage.setItem('token', authToken);
    window.history.replaceState({}, document.title, "/");
}

document.addEventListener('DOMContentLoaded', () => {
    // Check Auth State
    if(authToken) {
        fetchProfile();
    }

    // Tab switching — using inline display so there are no CSS class conflicts
    window.showAuthTab = (tab) => {
        document.getElementById('login-panel').style.display  = tab === 'login'    ? 'block' : 'none';
        document.getElementById('register-panel').style.display = tab === 'register' ? 'block' : 'none';
        document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
        document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    };

    // Dashboard Tabs logic
    const dashTabBtns = document.querySelectorAll('.dash-tab-btn');
    const dashContents = document.querySelectorAll('.dashboard-content');
    dashTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dashTabBtns.forEach(b => b.classList.remove('active'));
            dashContents.forEach(c => c.classList.add('hidden'));
            dashContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.target);
            target.classList.remove('hidden');
            setTimeout(() => target.classList.add('active'), 10);

            // Automatically fetch the report if the report tab was clicked
            if (btn.dataset.target === 'dash-report') {
                if(typeof window.fetchIncomeReport === 'function') window.fetchIncomeReport();
            }
        });
    });

    // Theme Toggle Logic
    const themeBtn = document.getElementById('theme-toggle-btn');
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        themeBtn.innerText = isLight ? '☀️' : '🌙';
    });




function calculateHealthScore(expenses, income, catData) {
    const scoreDisp = document.getElementById('health-score-disp');
    if (!scoreDisp) return;
    
    if (income === 0) {
        scoreDisp.innerText = "--/100";
        return;
    }

    let score = 100;
    const savingsRate = ((income - expenses) / income) * 100;

    // Deduction for low savings
    if (savingsRate < 0) score -= 40;
    else if (savingsRate < 20) score -= 20;

    // Deduction for high category concentration (Overspending on one thing)
    for (const amt of Object.values(catData)) {
        if (amt > (income * 0.5)) score -= 15;
    }

    // Normalize
    score = Math.max(0, Math.min(100, score));
    scoreDisp.innerText = `${Math.round(score)}/100`;
    
    const card = document.getElementById('health-score-card');
    if (score > 80) card.style.borderColor = 'var(--success)';
    else if (score < 50) card.style.borderColor = 'var(--danger)';
    else card.style.borderColor = 'var(--accent)';
}

window.filterTransactions = () => {
    const query = document.getElementById('search-expenses').value.toLowerCase();
    const category = document.getElementById('filter-cat-expense').value;
    const groups = document.querySelectorAll('#expenses-collapsible-container .report-month-card');

    groups.forEach(group => {
        const rows = group.querySelectorAll('tbody tr');
        let groupHasMatch = false;

        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            const cat = row.querySelector('td:nth-child(2)').innerText;
            
            const matchesSearch = text.includes(query);
            const matchesCat = category === 'All' || cat.includes(category);

            if (matchesSearch && matchesCat) {
                row.style.display = '';
                groupHasMatch = true;
            } else {
                row.style.display = 'none';
            }
        });

        // Hide the whole month if no rows inside match
        group.style.display = groupHasMatch ? '' : 'none';
        if (query || category !== 'All') group.open = groupHasMatch; // Auto-expand if searching
    });
};

window.exportData = (format, type) => {
    const rows = document.querySelectorAll(type === 'expenses' ? '#expenses-list tr' : '#income-list tr');
    const title = type.charAt(0).toUpperCase() + type.slice(1) + " Financial Report";
    
    if (format === 'csv') {
        let csv = "Date,Category,Description/Source,Amount\n";
        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            const line = Array.from(cols).slice(0, 4).map(c => c.innerText.replace(/\n/g, ' ')).join(",");
            csv += line + "\n";
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `${type}_report.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else if (format === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(title, 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
        
        const tableData = [];
        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            const rowData = Array.from(cols).slice(0, 4).map(c => c.innerText.replace(/\n/g, ' '));
            tableData.push(rowData);
        });
        
        doc.autoTable({
            head: [['Date', 'Category', 'Description/Source', 'Amount']],
            body: tableData,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [99, 102, 241] }
        });
        
        doc.save(`${type}_report.pdf`);
        showToast("PDF Report downloaded!", "success");
    }
};

window.simulateSMSOCR = (mode = 'expense') => {
    const sampleSMS = prompt(`Paste your bank SMS here (e.g., '${mode === 'income' ? 'Credited' : 'Debited'} ₹450 ${mode === 'income' ? 'to' : 'from'} card')`);
    if (!sampleSMS) return;
    
    showToast("AI is parsing SMS logic...", "success");
    
    const amountMatch = sampleSMS.match(/(?:[₹$])?\s?(\d+)/);
    if (amountMatch) {
        const amountField = mode === 'income' ? 'inc-amount' : 'exp-amount';
        const descField = mode === 'income' ? 'inc-desc' : 'exp-desc';
        
        document.getElementById(amountField).value = amountMatch[1];
        document.getElementById(descField).value = `Auto-parsed from SMS: ${sampleSMS.substring(0, 30)}...`;
        
        if (mode === 'expense') {
            const event = new Event('input', { bubbles: true });
            document.getElementById(descField).dispatchEvent(event);
        }
    }
};

    // Expenses logic
    const expenseModal = document.getElementById('expense-modal');
    document.getElementById('add-expense-btn').addEventListener('click', () => {
        document.getElementById('expense-modal-title').innerText = 'Add Expense';
        document.getElementById('expense-form').reset();
        document.getElementById('exp-id').value = '';
        document.getElementById('exp-date').valueAsDate = new Date();
        document.getElementById('custom-cat-group').classList.add('hidden');
        document.getElementById('recurring-interval-group').classList.add('hidden');
        document.getElementById('scan-status').style.display = 'none';
        expenseModal.classList.remove('hidden');
    });

    // Receipt Scanner AI OCR Logic
    const scanBtn = document.getElementById('scan-receipt-btn');
    const receiptInput = document.getElementById('receipt-upload');
    const scanStatus = document.getElementById('scan-status');

    if (scanBtn) {
        scanBtn.addEventListener('click', () => receiptInput.click());
    }

    if (receiptInput) {
        receiptInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            scanStatus.style.display = 'block';
            scanBtn.disabled = true;

            try {
                const worker = await Tesseract.createWorker('eng');
                const ret = await worker.recognize(file);
                const text = ret.data.text;
                await worker.terminate();

                parseReceiptText(text);
                showToast('Receipt scanned successfully!', 'success');
            } catch (err) {
                console.error('OCR Error:', err);
                showToast('AI failed to read receipt. Please try a clearer photo.', 'error');
            } finally {
                scanStatus.style.display = 'none';
                scanBtn.disabled = false;
                receiptInput.value = ''; // Reset for same file re-upload
            }
        });
    }

    function parseReceiptText(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // 1. Extract Amount
        // Look for currency patterns like $12.34 or simply 12.34
        const amountRegex = /(?:[\$\₹\£\€])?\s?(\d+[\\.,]\d{2})/g;
        const matches = text.matchAll(amountRegex);
        let topAmount = 0;
        
        for (const match of matches) {
            const val = parseFloat(match[1].replace(',', '.'));
            if (val > topAmount) topAmount = val;
        }

        if (topAmount > 0) {
            document.getElementById('exp-amount').value = topAmount;
        }

        // 2. Extract Date
        const dateRegex = /(\d{1,2})[\\/\\-](\d{1,2})[\\/\\-](\d{2,4})/;
        const dateMatch = text.match(dateRegex);
        if (dateMatch) {
            try {
                const d = new Date(dateMatch[0]);
                if (!isNaN(d)) document.getElementById('exp-date').valueAsDate = d;
            } catch(e) {}
        }

        // 3. Extract Merchant (Store Name)
        // Usually the first line of the receipt is the merchant
        if (lines.length > 0) {
            const merchant = lines[0].substring(0, 50); // Limit length
            document.getElementById('exp-desc').value = `Store: ${merchant}`;
            
            // Trigger Smart Categorization on the merchant name
            const event = new Event('input', { bubbles: true });
            document.getElementById('exp-desc').dispatchEvent(event);
        }
    }

    // Voice Expense Logging Logic
    const voiceBtn = document.getElementById('voice-log-btn');
    const voiceStatus = document.getElementById('voice-status');

    if (voiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
         recognition.continuous = false;
         recognition.interimResults = false;
         recognition.lang = 'en-US';

         voiceBtn.addEventListener('click', () => {
             recognition.start();
             voiceStatus.style.display = 'block';
             voiceBtn.disabled = true;
         });

         recognition.onresult = (event) => {
             const result = event.results[0][0].transcript;
             processVoiceInput(result);
             showToast(`Heard: "${result}"`, 'success');
         };

         recognition.onerror = (event) => {
             showToast('Speech recognition error. Please try again.', 'error');
         };

         recognition.onend = () => {
             voiceStatus.style.display = 'none';
             voiceBtn.disabled = false;
         };
    } else if (voiceBtn) {
        voiceBtn.title = "Speech recognition not supported in this browser.";
        voiceBtn.style.opacity = "0.5";
        voiceBtn.style.cursor = "not-allowed";
    }

    function processVoiceInput(text) {
        text = text.toLowerCase();
        
        // 1. Extract Amount (look for digits)
        const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
        if (amountMatch) {
            document.getElementById('exp-amount').value = parseFloat(amountMatch[1]);
        }

        // 2. Set Description
        document.getElementById('exp-desc').value = `Voice Log: ${text}`;

        // 3. Trigger Smart Categorization
        const event = new Event('input', { bubbles: true });
        document.getElementById('exp-desc').dispatchEvent(event);
    }

    // --- Income AI Features (OCR, Voice) ---
    const scanIncBtn = document.getElementById('scan-income-btn');
    const incomeUpload = document.getElementById('income-upload');
    const scanIncStatus = document.getElementById('scan-status-income');

    if (scanIncBtn) scanIncBtn.addEventListener('click', () => incomeUpload.click());
    if (incomeUpload) {
        incomeUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            scanIncStatus.style.display = 'block';
            try {
                const worker = await Tesseract.createWorker('eng');
                const ret = await worker.recognize(file);
                const text = ret.data.text;
                await worker.terminate();
                
                // Extract amount for income
                const amountMatch = text.match(/(?:[\$\₹\£\€])?\s?(\d+[\\.,]\d{2})/);
                if (amountMatch) document.getElementById('inc-amount').value = parseFloat(amountMatch[1].replace(',', '.'));
                document.getElementById('inc-desc').value = `Deposit Scan: ${text.substring(0, 30)}...`;
                showToast('Income proof scanned!', 'success');
            } catch (err) { showToast('Scan failed', 'error'); }
            finally { scanIncStatus.style.display = 'none'; }
        });
    }

    const voiceIncBtn = document.getElementById('voice-log-income-btn');
    const voiceIncStatus = document.getElementById('voice-status-income');

    if (voiceIncBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recInc = new SpeechRecognition();
        voiceIncBtn.addEventListener('click', () => {
            recInc.start();
            voiceIncStatus.style.display = 'block';
            voiceIncBtn.disabled = true;
        });
        recInc.onresult = (event) => {
            const text = event.results[0][0].transcript.toLowerCase();
            const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
            if (amountMatch) document.getElementById('inc-amount').value = parseFloat(amountMatch[1]);
            document.getElementById('inc-desc').value = `Voice Income: ${text}`;
            showToast('Income recognized!', 'success');
        };
        recInc.onend = () => {
            voiceIncStatus.style.display = 'none';
            voiceIncBtn.disabled = false;
        };
    }

    document.querySelector('.close-modal').addEventListener('click', () => {
        expenseModal.classList.add('hidden');
    });
    
    document.getElementById('exp-category').addEventListener('change', (e) => {
        if(e.target.value === 'Custom') {
            document.getElementById('custom-cat-group').classList.remove('hidden');
            document.getElementById('exp-custom-cat').required = true;
        } else {
            document.getElementById('custom-cat-group').classList.add('hidden');
            document.getElementById('exp-custom-cat').required = false;
        }
    });

    document.getElementById('exp-recurring').addEventListener('change', (e) => {
        if(e.target.checked) document.getElementById('recurring-interval-group').classList.remove('hidden');
        else document.getElementById('recurring-interval-group').classList.add('hidden');
    });

    // AI Smart Categorization feature via NLP Keyword Matching
    const aiCategoryKeywords = {
        'Food': ['mcdonalds', 'kfc', 'restaurant', 'food', 'snack', 'dinner', 'lunch', 'breakfast', 'pizza', 'burger', 'grocery', 'supermarket', 'cafe', 'coffee', 'starbucks', 'taco', 'subway', 'wendys', 'chipotle', 'meal'],
        'Transport': ['uber', 'lyft', 'taxi', 'bus', 'train', 'flight', 'gas', 'fuel', 'metro', 'transit', 'ride', 'airline', 'subway', 'parking', 'toll', 'car', 'flights', 'uber ride'],
        'Shopping': ['amazon', 'walmart', 'target', 'clothes', 'shoes', 'electronics', 'mall', 'store', 'buy', 'nike', 'apple', 'best buy', 'shopping'],
        'Bills': ['electric', 'water', 'internet', 'phone', 'bill', 'utility', 'rent', 'mortgage', 'insurance', 'netflix', 'spotify', 'hulu', 'xfinity', 't-mobile', 'verizon', 'comcast'],
        'Entertainment': ['movie', 'cinema', 'game', 'concert', 'ticket', 'park', 'fun', 'club', 'steam', 'playstation', 'xbox', 'nintendo', 'amc', 'party'],
        'Education': ['course', 'book', 'school', 'college', 'tuition', 'class', 'udemy', 'coursera', 'textbook', 'university', 'student'],
        'Health': ['doctor', 'hospital', 'pharmacy', 'medicine', 'gym', 'workout', 'fitness', 'clinic', 'dentist', 'cvs', 'walgreens', 'health', 'medical']
    };

    document.getElementById('exp-desc').addEventListener('input', (e) => {
        const text = e.target.value.toLowerCase();
        let matchedCategory = null;

        for (const [category, keywords] of Object.entries(aiCategoryKeywords)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                matchedCategory = category;
                break;
            }
        }

        if (matchedCategory) {
            const selectEl = document.getElementById('exp-category');
            if (selectEl.value !== matchedCategory) {
                selectEl.value = matchedCategory;
                selectEl.dispatchEvent(new Event('change')); // Trigger visibility logic if required
                
                // Visual feedback that AI updated the category
                selectEl.style.transition = 'box-shadow 0.3s ease-in-out';
                selectEl.style.boxShadow = '0 0 15px var(--accent)';
                setTimeout(() => {
                    selectEl.style.boxShadow = '';
                }, 800);
            }
        }
    });

    document.getElementById('expense-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('exp-id').value;
        const payload = {
            amount: document.getElementById('exp-amount').value,
            category: document.getElementById('exp-category').value,
            customCategory: document.getElementById('exp-custom-cat').value,
            date: document.getElementById('exp-date').value,
            description: document.getElementById('exp-desc').value,
            isRecurring: document.getElementById('exp-recurring').checked,
            recurringInterval: document.getElementById('exp-recurring-interval').value
        };

        try {
            const url = id ? `${EXPENSE_API_BASE}/${id}` : EXPENSE_API_BASE;
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if(res.ok) {
                showToast(`Expense ${id ? 'updated' : 'added'}!`, 'success');
                expenseModal.classList.add('hidden');
                fetchExpenses();
            } else {
                showToast('Failed to save expense', 'error');
            }
        } catch(err) {
            showToast('Error saving expense', 'error');
        }
    });

    // Income modal logic
    const incomeModal = document.getElementById('income-modal');

    document.getElementById('add-income-btn').addEventListener('click', () => {
        document.getElementById('income-modal-title').innerText = 'Add Income';
        document.getElementById('income-form').reset();
        document.getElementById('inc-id').value = '';
        document.getElementById('inc-date').valueAsDate = new Date();
        document.getElementById('inc-recurring-interval-group').classList.add('hidden');
        incomeModal.classList.remove('hidden');
    });

    document.querySelector('.close-income-modal').addEventListener('click', () => {
        incomeModal.classList.add('hidden');
    });

    document.getElementById('inc-recurring').addEventListener('change', (e) => {
        document.getElementById('inc-recurring-interval-group').classList.toggle('hidden', !e.target.checked);
    });

    document.getElementById('income-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('inc-id').value;
        const btn = document.getElementById('income-submit-btn');
        btn.disabled = true; btn.innerText = 'Saving...';

        const payload = {
            amount: document.getElementById('inc-amount').value,
            category: document.getElementById('inc-category').value,
            source: document.getElementById('inc-source').value,
            date: document.getElementById('inc-date').value,
            description: document.getElementById('inc-desc').value,
            isRecurring: document.getElementById('inc-recurring').checked,
            recurringInterval: document.getElementById('inc-recurring-interval').value
        };

        try {
            const url = id ? `${INCOME_API_BASE}/${id}` : INCOME_API_BASE;
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if(res.ok) {
                showToast(`Income ${id ? 'updated' : 'added'}!`, 'success');
                incomeModal.classList.add('hidden');
                window.fetchIncome();
            } else {
                showToast('Failed to save income', 'error');
            }
        } catch(err) { showToast('Error', 'error'); }
        finally { btn.disabled = false; btn.innerText = 'Save Income'; }
    });

    // App Navigation logic
    window.switchView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        const target = document.getElementById(viewId);
        target.classList.remove('hidden');
        setTimeout(() => target.classList.add('active'), 10);
    }

    // Auth Forms Submission
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            
            if(res.ok) {
                if(data.require2fa) {
                    sessionStorage.setItem('pending_2fa_userId', data.userId);
                    switchView('two-factor-view');
                    showToast('2FA required', 'info');
                } else {
                    handleLoginSuccess(data.token);
                }
            } else {
                showToast(data.msg || 'Login failed', 'error');
            }
        } catch(err) { showToast('Connection Error', 'error'); }
    });

    const regForm = document.getElementById('register-form');
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('register-submit-btn');
        btn.disabled = true;
        btn.innerText = 'Creating...';
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        try {
            const res = await fetch(`${API_BASE}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();
            if(res.ok) {
                showToast('Account created! You can now log in.', 'success');
                regForm.reset();
                showAuthTab('login'); // Switch to login tab
            } else {
                showToast(data.msg || 'Registration failed', 'error');
            }
        } catch(err) { showToast('Connection Error', 'error'); }
        finally {
            btn.disabled = false;
            btn.innerText = 'Create Account';
        }
    });

    // 2FA Verification Form Component
    const tfaForm = document.getElementById('two-factor-form');
    tfaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tokenVal = document.getElementById('two-factor-code').value;
        const userId = sessionStorage.getItem('pending_2fa_userId');

        try {
            const res = await fetch(`${API_BASE}/login/2fa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, token: tokenVal })
            });
            const data = await res.json();
            if(res.ok) {
                handleLoginSuccess(data.token);
            } else {
                showToast(data.msg || 'Invalid code', 'error');
            }
        } catch(err) { showToast('Connection Error', 'error'); }
    });

    // Dashboard Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        if(authToken) {
            await fetch(`${API_BASE}/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
        }
        localStorage.removeItem('token');
        authToken = null;
        switchView('auth-view');
        showToast('Logged out successfully', 'success');
    });

    // Dashboard features
    document.getElementById('profile-form').addEventListener('submit', async(e) => {
        e.preventDefault();
        const name = document.getElementById('prof-name').value;
        try {
            const res = await fetch(`${API_BASE}/profile`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if(res.ok) {
                document.getElementById('user-name-disp').innerText = name;
                showToast('Profile Updated', 'success');
            } else { showToast(data.msg, 'error'); }
        } catch(err) { showToast('Error updating profile', 'error'); }
    });

    document.getElementById('password-form').addEventListener('submit', async(e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('current-pwd').value;
        const newPassword = document.getElementById('new-pwd').value;
        try {
            const res = await fetch(`${API_BASE}/change-password`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json();
            if(res.ok) showToast('Password changed!', 'success');
            else showToast(data.msg, 'error');
            e.target.reset();
        } catch(err) { showToast('Error changing password', 'error'); }
    });
    
    document.getElementById('enable-2fa-btn').addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_BASE}/2fa/generate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            if(res.ok) {
                document.getElementById('qr-code-img').src = data.qrCode;
                document.getElementById('secret-key').innerText = data.secret;
                document.getElementById('setup-2fa-area').classList.remove('hidden');
                document.getElementById('enable-2fa-btn').classList.add('hidden');
            }
        } catch(err) { showToast('Failed to start 2FA', 'error'); }
    });

    document.getElementById('confirm-2fa-btn').addEventListener('click', async () => {
        const token = document.getElementById('verify-2fa-code').value;
        try {
            const res = await fetch(`${API_BASE}/2fa/enable`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const data = await res.json();
            if(res.ok) {
                showToast('2FA Enabled Successfully', 'success');
                document.getElementById('setup-2fa-area').classList.add('hidden');
            } else {
                showToast(data.msg, 'error');
            }
        } catch(err) { showToast('Failed to verify', 'error'); }
    });
});

async function fetchProfile() {
    try {
        const res = await fetch(`${API_BASE}/profile`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if(res.ok) {
            const user = await res.json();
            document.getElementById('user-name-disp').innerText = user.name || user.email.split('@')[0];
            document.getElementById('prof-name').value = user.name || '';
            switchView('dashboard-view');
            fetchDevices();
            fetchExpenses();
            window.fetchIncome();
        } else {
            // Invalid token
            localStorage.removeItem('token');
            authToken = null;
            switchView('auth-view');
        }
    } catch(err) {
        switchView('auth-view');
    }
}

async function fetchDevices() {
    try {
        const res = await fetch(`${API_BASE}/devices`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if(res.ok) {
            const devices = await res.json();
            const list = document.getElementById('devices-list');
            list.innerHTML = '';
            devices.forEach(d => {
                const isCurrent = d.isCurrentDevice;
                const dateStr = new Date(d.lastLogin).toLocaleString();
                list.innerHTML += `
                    <div class="device-item ${isCurrent ? 'current' : ''}">
                        <div class="device-info">
                            <p>${d.deviceInfo || 'Unknown Device'} ${isCurrent ? '(This browser)' : ''}</p>
                            <span>Last active: ${dateStr}</span>
                        </div>
                        ${!isCurrent ? `<button class="btn action-btn text-danger" onclick="logoutDevice('${d.deviceId}')">Revoke</button>` : ''}
                    </div>
                `;
            });
        }
    } catch(e) {}
}

window.logoutDevice = async (deviceId) => {
    try {
         const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
             method: 'DELETE',
             headers: { 'Authorization': `Bearer ${authToken}` }
         });
         if(res.ok) {
             showToast('Device session revoked', 'success');
             fetchDevices();
         }
    } catch(err) {}
}

function handleLoginSuccess(token) {
    localStorage.setItem('token', token);
    authToken = token;
    showToast('Login successful!', 'success');
    fetchProfile();
}

function showToast(message, type = 'info') {
    const t = document.getElementById('toast');
    t.innerText = message;
    t.className = `toast ${type}`;
    t.classList.remove('hidden');
    setTimeout(() => {
        t.classList.add('hidden');
    }, 3000);
}

window.fetchExpenses = async () => {
    try {
        const res = await fetch(EXPENSE_API_BASE, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if(res.ok) {
            const expenses = await res.json();
            const container = document.getElementById('expenses-collapsible-container');
            container.innerHTML = '';
            
            let total = 0;
            let todayTotal = 0;
            let yesterdayTotal = 0;
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            // Grouping by Month
            const monthGroups = {};

            expenses.forEach(e => {
                total += e.amount;
                const dateObj = new Date(e.date);
                const eDate = dateObj.toISOString().split('T')[0];
                if(eDate === todayStr) todayTotal += e.amount;
                else if(eDate === yesterdayStr) yesterdayTotal += e.amount;

                const monthKey = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
                if (!monthGroups[monthKey]) monthGroups[monthKey] = { expenses: [], total: 0 };
                monthGroups[monthKey].expenses.push(e);
                monthGroups[monthKey].total += e.amount;
            });

            // If no expenses
            if (expenses.length === 0) {
                container.innerHTML = '<p style="text-align:center; padding:3rem; color:var(--text-secondary);">No expenses recorded yet.</p>';
            }

            // Render each month group
            Object.keys(monthGroups).sort((a, b) => new Date(b) - new Date(a)).forEach(monthKey => {
                const group = monthGroups[monthKey];
                const detailEl = document.createElement('details');
                detailEl.className = 'report-month-card';
                detailEl.style.marginBottom = '1rem';
                detailEl.style.outline = 'none';
                if (monthKey === now.toLocaleString('default', { month: 'long', year: 'numeric' })) detailEl.open = true;

                let rowHtml = group.expenses.map(e => `
                    <tr>
                        <td class="cell-date">${new Date(e.date).toLocaleDateString()}</td>
                        <td>
                            <span style="font-weight:600">${e.category === 'Custom' ? e.customCategory : e.category}</span>
                            ${e.isRecurring ? `<br><span style="color:var(--accent); font-size:0.7rem;">↻ ${e.recurringInterval}</span>` : ''}
                        </td>
                        <td style="opacity:0.8">${e.description || '-'}</td>
                        <td class="cell-amount" style="color:var(--danger)">-$${e.amount.toFixed(2)}</td>
                        <td>
                            <div class="action-btns">
                                <button class="btn-sm btn-edit" onclick='editExpense(${JSON.stringify(e).replace(/'/g, "&apos;")})'>Edit</button>
                                <button class="btn-sm btn-delete" onclick="deleteExpense('${e._id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('');

                detailEl.innerHTML = `
                    <summary style="list-style: none; cursor: pointer; padding-bottom: 0.5rem;">
                        <h4 style="border-bottom: 1px solid var(--accent); padding-bottom:0.5rem; display: flex; justify-content: space-between; align-items: center;">
                            <span>🔽 ${monthKey}</span>
                            <span style="color:var(--danger); font-size:1.1rem;">-$${group.total.toFixed(2)}</span>
                        </h4>
                    </summary>
                    <div class="table-container" style="margin-top:0.5rem; background: transparent; border: none;">
                        <table class="excel-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowHtml}
                            </tbody>
                        </table>
                    </div>
                `;
                container.appendChild(detailEl);
            });

            function checkBudgetAlerts(totalSpent) {
                const limit = 5000;
                if (totalSpent > limit) {
                    const badge = document.getElementById('notif-badge');
                    badge.style.display = 'block';
                    badge.innerText = '1';
                    document.getElementById('notification-bell').onclick = () => {
                        alert(`⚠️ Budget Alert: You have spent $${totalSpent.toFixed(2)}, which exceeds your monthly limit of $${limit}.00!`);
                        badge.style.display = 'none';
                    };
                }
            }

            document.getElementById('total-spent-disp').innerText = '$' + total.toFixed(2);
            document.getElementById('today-spent-disp').innerText = '$' + todayTotal.toFixed(2);
            document.getElementById('yesterday-spent-disp').innerText = '$' + yesterdayTotal.toFixed(2);
            
            const todayDisp = document.getElementById('today-spent-disp');
            if (todayTotal > yesterdayTotal && yesterdayTotal > 0) {
                todayDisp.style.color = 'var(--danger)';
            } else if (todayTotal < yesterdayTotal && todayTotal > 0) {
                todayDisp.style.color = 'var(--success)';
            }

            totalExpensesGlobal = total;
            checkBudgetAlerts(total);
            updateNetBalance();
        }
    } catch(err) {
        console.error('Error fetching expenses:', err);
    }
};

window.editExpense = (e) => {
    document.getElementById('expense-modal-title').innerText = 'Edit Expense';
    document.getElementById('exp-id').value = e._id;
    document.getElementById('exp-amount').value = e.amount;
    document.getElementById('exp-category').value = e.category;
    if(e.category === 'Custom') {
        document.getElementById('custom-cat-group').classList.remove('hidden');
        document.getElementById('exp-custom-cat').value = e.customCategory;
    } else {
        document.getElementById('custom-cat-group').classList.add('hidden');
    }
    document.getElementById('exp-date').value = e.date.split('T')[0];
    document.getElementById('exp-desc').value = e.description;
    document.getElementById('exp-recurring').checked = e.isRecurring;
    if(e.isRecurring) {
        document.getElementById('recurring-interval-group').classList.remove('hidden');
        document.getElementById('exp-recurring-interval').value = e.recurringInterval;
    } else {
        document.getElementById('recurring-interval-group').classList.add('hidden');
    }
    document.getElementById('expense-modal').classList.remove('hidden');
};

window.deleteExpense = async (id) => {
    if(!confirm('Are you sure you want to delete this expense?')) return;
    try {
        const res = await fetch(`${EXPENSE_API_BASE}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if(res.ok) {
            showToast('Expense deleted', 'success');
            window.fetchExpenses();
        }
    } catch(err) {}
};

/* ===== INCOME FUNCTIONS ===== */
let totalExpensesGlobal = 0;
let totalIncomeGlobal = 0;

function updateNetBalance() {
    const net = totalIncomeGlobal - totalExpensesGlobal;
    const el = document.getElementById('net-balance-disp');
    if(el) {
        el.innerText = '$' + Math.abs(net).toFixed(2) + (net < 0 ? ' (deficit)' : '');
        el.style.color = net >= 0 ? 'var(--accent)' : 'var(--danger)';
    }
}

window.fetchIncome = async () => {
    try {
        const res = await fetch(INCOME_API_BASE, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if(res.ok) {
            const incomes = await res.json();
            const list = document.getElementById('income-list');
            list.innerHTML = '';
            let total = 0;
            if(incomes.length === 0) {
                list.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:2rem;">No income entries yet. Click "+ Add Income" to start!</p>';
            }
            incomes.forEach(inc => {
                total += inc.amount;
                list.innerHTML += `
                    <tr>
                        <td class="cell-date">${new Date(inc.date).toLocaleDateString()}</td>
                        <td>
                            <span style="font-weight:600">${inc.category}</span>
                            ${inc.isRecurring ? `<br><span style="color:var(--success); font-size:0.7rem;">↻ ${inc.recurringInterval}</span>` : ''}
                        </td>
                        <td style="opacity:0.8">${inc.source || '-'}</td>
                        <td class="cell-amount" style="color:var(--success)">+$${inc.amount.toFixed(2)}</td>
                        <td>
                            <div class="action-btns">
                                <button class="btn-sm btn-edit" onclick='editIncome(${JSON.stringify(inc).replace(/'/g, "&apos;")})'>Edit</button>
                                <button class="btn-sm btn-delete" onclick="deleteIncome('${inc._id}')">Delete</button>
                            </div>
                        </td>
                    </tr>`;
            });
            totalIncomeGlobal = total;
            document.getElementById('total-income-disp').innerText = '$' + total.toFixed(2);
            updateNetBalance();
        }
    } catch(err) {}
};

window.editIncome = (inc) => {
    document.getElementById('income-modal-title').innerText = 'Edit Income';
    document.getElementById('inc-id').value = inc._id;
    document.getElementById('inc-amount').value = inc.amount;
    document.getElementById('inc-category').value = inc.category;
    document.getElementById('inc-source').value = inc.source || '';
    document.getElementById('inc-date').value = inc.date.split('T')[0];
    document.getElementById('inc-desc').value = inc.description || '';
    document.getElementById('inc-recurring').checked = inc.isRecurring;
    if(inc.isRecurring) {
        document.getElementById('inc-recurring-interval-group').classList.remove('hidden');
        document.getElementById('inc-recurring-interval').value = inc.recurringInterval;
    } else {
        document.getElementById('inc-recurring-interval-group').classList.add('hidden');
    }
    document.getElementById('income-modal').classList.remove('hidden');
};

window.deleteIncome = async (id) => {
    if(!confirm('Delete this income entry?')) return;
    try {
        const res = await fetch(`${INCOME_API_BASE}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if(res.ok) { showToast('Income entry deleted', 'success'); window.fetchIncome(); }
    } catch(err) {}
};

let chartInstances = {};

window.fetchIncomeReport = async () => {
    fetchSmartInsights();
    try {
        const [expRes, incRes] = await Promise.all([
            fetch(EXPENSE_API_BASE, { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(INCOME_API_BASE, { headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);

        if(expRes.ok && incRes.ok) {
            const expenses = await expRes.json();
            const incomes = await incRes.json();
            
            // --- 0. Today's Summary (New Feature) ---
            const todayStr = new Date().toISOString().split('T')[0];
            let todayIncomeVal = 0;
            let todayExpenseVal = 0;
            
            incomes.forEach(i => {
                if (new Date(i.date).toISOString().split('T')[0] === todayStr) todayIncomeVal += i.amount;
            });
            expenses.forEach(e => {
                if (new Date(e.date).toISOString().split('T')[0] === todayStr) todayExpenseVal += e.amount;
            });
            
            const anaIncEl = document.getElementById('ana-today-income');
            const anaExpEl = document.getElementById('ana-today-expense');
            if(anaIncEl) anaIncEl.innerText = '$' + todayIncomeVal.toFixed(2);
            if(anaExpEl) anaExpEl.innerText = '$' + todayExpenseVal.toFixed(2);

            // --- 1. Category Breakdown (Pie Chart) ---
            const catData = {};
            expenses.forEach(e => {
                const c = e.category === 'Custom' ? e.customCategory : e.category;
                catData[c] = (catData[c] || 0) + e.amount;
            });
            
            renderChart('category-pie-chart', 'pie', {
                labels: Object.keys(catData),
                datasets: [{
                    data: Object.values(catData),
                    backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef']
                }]
            });

            // --- 2. Monthly Trend (Line Graph) ---
            const monthMap = {};
            incomes.forEach(i => {
                const date = new Date(i.date);
                const m = date.toLocaleString('default', { month: 'short', year: '2-digit' });
                const day = date.getDate();
                if(!monthMap[m]) monthMap[m] = { inc: 0, exp: 0, daily: {} };
                monthMap[m].inc += i.amount;
                if(!monthMap[m].daily[day]) monthMap[m].daily[day] = { inc: 0, exp: 0 };
                monthMap[m].daily[day].inc += i.amount;
            });
            expenses.forEach(e => {
                const date = new Date(e.date);
                const m = date.toLocaleString('default', { month: 'short', year: '2-digit' });
                const day = date.getDate();
                if(!monthMap[m]) monthMap[m] = { inc: 0, exp: 0, daily: {} };
                monthMap[m].exp += e.amount;
                if(!monthMap[m].daily[day]) monthMap[m].daily[day] = { inc: 0, exp: 0 };
                monthMap[m].daily[day].exp += e.amount;
            });
            
            // Sort month map keys chronologically (simplified sort)
            const sortedMonths = Object.keys(monthMap).sort((a,b) => {
                const [mA, yA] = a.split(' '); const [mB, yB] = b.split(' ');
                return new Date(`${mA} 1 20${yA}`) - new Date(`${mB} 1 20${yB}`);
            });
            
            renderChart('monthly-trend-chart', 'line', {
                labels: sortedMonths,
                datasets: [
                    { label: 'Income', data: sortedMonths.map(m => monthMap[m].inc), borderColor: '#22c55e', backgroundColor: '#22c55e88', fill: true, tension: 0.4 },
                    { label: 'Expenses', data: sortedMonths.map(m => monthMap[m].exp), borderColor: '#ef4444', backgroundColor: '#ef444488', fill: true, tension: 0.4 }
                ]
            });

            // --- 3. Daily Spending (Bar Chart) - Last 7 Days ---
            const dailyMap = {};
            for(let i=6; i>=0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                dailyMap[d.toISOString().split('T')[0]] = 0;
            }
            expenses.forEach(e => {
                const dStr = new Date(e.date).toISOString().split('T')[0];
                if(dailyMap[dStr] !== undefined) dailyMap[dStr] += e.amount;
            });
            const days = Object.keys(dailyMap).map(d => new Date(d).toLocaleString('default', { weekday: 'short' }));

            renderChart('daily-spending-chart', 'bar', {
                labels: days,
                datasets: [{
                    label: 'Spent',
                    data: Object.values(dailyMap),
                    backgroundColor: '#6366f1',
                    borderRadius: 6
                }]
            }, { scales: { y: { beginAtZero: true } } });

            // --- 3b. Day by Day Comparison (Current vs Previous Week) ---
            const currentWeekMap = {};
            const previousWeekMap = {};
            const comparisonDays = [];
            
            for(let i=6; i>=0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const dStr = d.toISOString().split('T')[0];
                currentWeekMap[dStr] = 0;
                comparisonDays.push(d.toLocaleString('default', { weekday: 'short' }) + ' ' + d.getDate());
                
                const prevD = new Date(); prevD.setDate(prevD.getDate() - (i + 7));
                const prevDStr = prevD.toISOString().split('T')[0];
                previousWeekMap[prevDStr] = 0;
            }

            expenses.forEach(e => {
                const dStr = new Date(e.date).toISOString().split('T')[0];
                if(currentWeekMap[dStr] !== undefined) currentWeekMap[dStr] += e.amount;
                if(previousWeekMap[dStr] !== undefined) previousWeekMap[dStr] += e.amount;
            });

            renderChart('day-comparison-chart', 'bar', {
                labels: comparisonDays,
                datasets: [
                    {
                        label: 'Current 7 Days',
                        data: Object.values(currentWeekMap),
                        backgroundColor: '#6366f1',
                        borderRadius: 4
                    },
                    {
                        label: 'Previous 7 Days',
                        data: Object.values(previousWeekMap),
                        backgroundColor: '#94a3b888',
                        borderRadius: 4
                    }
                ]
            }, { scales: { y: { beginAtZero: true } } });
            
            // Include the detailed day-wise report
            const container = document.getElementById('monthly-report-container');
            container.innerHTML = `<h3 style=\"margin-bottom:1.5rem; color:var(--accent);\">📅 Detailed Monthly & Daily Breakdown</h3>`;
            
            if(sortedMonths.length === 0) {
                container.innerHTML += '<p style=\"color:var(--text-secondary); text-align:center;\">No data available for detailed breakdown.</p>';
            } else {
                sortedMonths.reverse().forEach(monthKey => {
                    const data = monthMap[monthKey];
                    let dailyHtml = '';
                    
                    // Sort days within the month
                    const sortedDays = Object.keys(data.daily).sort((a, b) => b - a);
                    
                    sortedDays.forEach(day => {
                        const dData = data.daily[day];
                        dailyHtml += `
                            <div style=\"display:flex; justify-content:space-between; padding:0.6rem; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;\">
                                <span style=\"color:var(--text-secondary);\">Day ${day}</span>
                                <div style=\"display:flex; gap:1rem;\">
                                    <span style=\"color:var(--success);\">+$${dData.inc.toFixed(2)}</span>
                                    <span style=\"color:var(--danger);\">-$${dData.exp.toFixed(2)}</span>
                                </div>
                            </div>`;
                    });

                    // Add dynamic totals after the daily entries
                    dailyHtml += `
                        <div style=\"display:flex; justify-content:space-between; padding:0.8rem 0.6rem; margin-top: 5px; background: rgba(255,255,255,0.03); border-radius: 8px; font-weight:700; border-top: 1px solid var(--accent);\">
                            <span style=\"color:var(--accent);\">${monthKey} Total</span>
                            <div style=\"display:flex; gap:1rem;\">
                                <span style=\"color:var(--success);\">+$${data.inc.toFixed(2)}</span>
                                <span style=\"color:var(--danger);\">-$${data.exp.toFixed(2)}</span>
                            </div>
                        </div>`;

                    container.innerHTML += `
                        <details class=\"report-month-card\" style=\"margin-bottom:1.5rem; outline: none;\">
                            <summary style=\"list-style: none; cursor: pointer; padding-bottom: 0.5rem;\">
                                <h4 style=\"border-bottom: 1px solid var(--accent); padding-bottom:0.5rem; display: flex; justify-content: space-between; align-items: center;\">
                                    <span>🔽 ${monthKey} Breakdown</span> 
                                    <div style=\"text-align:right;\">
                                        <span style=\"color:var(--success); font-size:1.1rem;\">+$${data.inc.toFixed(2)}</span> / 
                                        <span style=\"color:var(--danger); font-size:1.1rem;\">-$${data.exp.toFixed(2)}</span>
                                    </div>
                                </h4>
                            </summary>
                            <div style=\"margin-top:0.5rem; padding: 0.5rem;\">
                                <h5 style=\"color:var(--text-secondary); font-size:0.8rem; margin-bottom:1rem; text-transform:uppercase; letter-spacing: 1px;\">📅 Day-by-Day Historical Log:</h5>
                                ${dailyHtml}
                            </div>
                        </details>`;
                });
                sortedMonths.reverse(); // Reset order back for other logic
            }
            
            // --- 4. AI Insights Generation ---
            generateAIInsights(expenses, incomes, catData, sortedMonths, monthMap, dailyMap, currentWeekMap, previousWeekMap);
            fetchSmartInsights();
        }
    } catch(err) { 
        console.error(err);
        showToast('Failed to load analytical report', 'error'); 
    }
};

function renderChart(canvasId, type, data, extraOptions = {}) {
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    if(chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    
    Chart.defaults.color = '#94a3b8'; // text-secondary
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

    chartInstances[canvasId] = new Chart(ctx, {
        type,
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: type === 'pie' ? 'right' : 'top' }
            },
            ...extraOptions
        }
    });
}

function generateAIInsights(expenses, incomes, catData, sortedMonths, monthMap, dailyMap, currentWeekMap, previousWeekMap) {
    const insightsList = document.getElementById('ai-insights-list');
    if (!insightsList) return;
    insightsList.innerHTML = '';
    
    const insights = [];
    
    // 1. Category Trends
    const totalExpenses = Object.values(catData).reduce((sum, val) => sum + val, 0);
    if (totalExpenses > 0) {
        let topCat = '';
        let topCatAmount = 0;
        for (const [cat, amt] of Object.entries(catData)) {
            if (amt > topCatAmount) { topCat = cat; topCatAmount = amt; }
        }
        const percent = Math.round((topCatAmount / totalExpenses) * 100);
        if (percent >= 20) {
            insights.push(`You spend <strong>${percent}%</strong> of your budget on <strong>${topCat}</strong>.`);
        }
    }

    // 2. Unusual Spending (Weekends)
    let weekendTotal = 0;
    let weekdayTotal = 0;
    let weekendDays = 0;
    let weekdayDays = 0;
    
    expenses.forEach(e => {
        const day = new Date(e.date).getDay();
        if (day === 0 || day === 6) { weekendTotal += e.amount; weekendDays++; }
        else { weekdayTotal += e.amount; weekdayDays++; }
    });
    
    if (weekendDays > 0 && weekdayDays > 0) {
        const avgWeekend = weekendTotal / weekendDays;
        const avgWeekday = weekdayTotal / weekdayDays;
        if (avgWeekend > (avgWeekday * 1.3)) {
            insights.push(`Your spending increases significantly on <strong>weekends</strong> (avg $${avgWeekend.toFixed(2)}/day).`);
        } else if (avgWeekday > (avgWeekend * 1.3)) {
            insights.push(`You tend to spend more during the <strong>weekdays</strong> than on weekends.`);
        }
    }

    // 2b. Week vs Week comparison insight
    const currentWeekTotal = Object.values(currentWeekMap).reduce((a, b) => a + b, 0);
    const previousWeekTotal = Object.values(previousWeekMap).reduce((a, b) => a + b, 0);
    if(previousWeekTotal > 0 && currentWeekTotal > 0) {
        const diff = currentWeekTotal - previousWeekTotal;
        const percent = Math.round((Math.abs(diff) / previousWeekTotal) * 100);
        if(diff > 0 && percent >= 10) {
            insights.push(`Your spending this week is <strong>${percent}% higher</strong> ($${currentWeekTotal.toFixed(2)}) compared to last week ($${previousWeekTotal.toFixed(2)}).`);
        } else if(diff < 0 && percent >= 10) {
            insights.push(`Great job! You spent <strong>${percent}% less</strong> this week ($${currentWeekTotal.toFixed(2)}) compared to last week ($${previousWeekTotal.toFixed(2)}).`);
        }
    }

    // 3. Month over Month trend
    if (sortedMonths.length >= 2) {
        const lastMonthKey = sortedMonths[sortedMonths.length - 1];
        const prevMonthKey = sortedMonths[sortedMonths.length - 2];
        const currentExp = monthMap[lastMonthKey].exp;
        const prevExp = monthMap[prevMonthKey].exp;
        
        if (prevExp > 0) {
            const percentChange = Math.round(((currentExp - prevExp) / prevExp) * 100);
            if (percentChange > 0) {
                insights.push(`Your overall spending <strong>increased by ${percentChange}%</strong> this month compared to last month.`);
            } else if (percentChange < 0) {
                insights.push(`Great job! Your overall spending <strong>decreased by ${Math.abs(percentChange)}%</strong> this month.`);
            }
        }
    }
    
    // 4. Spending Predictions (Machine Learning: Linear Regression)
    if (sortedMonths.length >= 2) {
        const n = sortedMonths.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        
        for (let i = 0; i < n; i++) {
            const monthKey = sortedMonths[i];
            const x = i + 1;
            const y = monthMap[monthKey].exp;
            
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
        }
        
        const denominator = (n * sumXX) - (sumX * sumX);
        if (denominator !== 0) {
            const m = ((n * sumXY) - (sumX * sumY)) / denominator;
            const b = (sumY - (m * sumX)) / n;
            
            let predictedNextMonth = (m * (n + 1)) + b;
            if (predictedNextMonth < 0) predictedNextMonth = 0; // Prevent negative prediction
            
            // Top categories
            const sortedCategories = Object.entries(catData).sort((a,b) => b[1] - a[1]);
            const mainSpending = sortedCategories.slice(0, 2).map(c => c[0]).join(' & ');

            const predContainer = document.getElementById('ai-prediction-content');
            if (predContainer) {
                predContainer.innerHTML = `<span style="color: #eab308; font-size: 1.1rem;">Predicted spending next month: <strong>$${predictedNextMonth.toFixed(2)}</strong></span><br><br><span style="font-size: 0.95em; opacity: 0.9;">Main spending categories: <strong>${mainSpending || 'None'}</strong></span>`;
            }
        }
    } else {
        const predContainer = document.getElementById('ai-prediction-content');
        if (predContainer) {
            predContainer.innerHTML = `<p style="opacity: 0.7;">We need at least 2 months of spending history to generate a forecast. Keep tracking your expenses!</p>`;
        }
    }
    
    if (insights.length === 0) {
        if (expenses.length === 0) {
            insights.push(`Add some expenses and income to get AI-powered insights!`);
        } else {
             insights.push(`Keep adding transactions. We need more data to generate consistent patterns.`);
        }
    }

    insights.forEach(insight => {
        insightsList.innerHTML += `<li style=\"margin-bottom: 0.5rem;\">✧ ${insight}</li>`;
    });
}

async function fetchSmartInsights() {
    try {
        const res = await fetch('/api/insights', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            
            // Update UI elements
            const avgDailyEl = document.getElementById('ana-avg-daily');
            const topCatEl = document.getElementById('ana-top-category');
            const compareEl = document.getElementById('ana-month-compare');
            const insightsList = document.getElementById('ai-insights-list');

            if (avgDailyEl) avgDailyEl.innerText = '$' + data.avgDailySpending;
            if (topCatEl) topCatEl.innerText = `${data.highestCategory.category} ($${data.highestCategory.amount.toFixed(2)})`;
            
            if (compareEl) {
                const diff = data.currentMonthTotal - data.lastMonthTotal;
                const percent = data.lastMonthTotal > 0 ? ((diff / data.lastMonthTotal) * 100).toFixed(0) : 0;
                compareEl.innerText = `${diff >= 0 ? '▲' : '▼'} ${Math.abs(percent)}% vs last month`;
                compareEl.style.color = diff <= 0 ? 'var(--success)' : 'var(--danger)';
            }

            if (insightsList) {
                // data.suggestions are appended to what generateAIInsights already created
                data.suggestions.forEach(suggestion => {
                    const li = document.createElement('li');
                    li.style.marginBottom = '0.5rem';
                    li.innerHTML = `✧ ${suggestion}`;
                    insightsList.appendChild(li);
                });
            }
        }
    } catch (err) {
        console.error('Error fetching smart insights:', err);
    }
}
