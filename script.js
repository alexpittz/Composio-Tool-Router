import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore-lite.js";

const userProvidedConfig = {
    apiKey: "AIzaSyAp3q0xUaT5mjV4yNIWYSfeDBhqOmG7LiM",
    authDomain: "toolrouter-d1321.firebaseapp.com",
    projectId: "toolrouter-d1321",
    storageBucket: "toolrouter-d1321.firebasestorage.app",
    messagingSenderId: "453302598569",
    appId: "1:453302598569:web:a5a922ebf2b4cc7cae62b8",
    measurementId: "G-C2W38CVBD3"
};

let app, db, auth, userId;
const appId = typeof __app_id !== 'undefined' ? __app_id : userProvidedConfig.projectId;
const firebaseConfig = userProvidedConfig;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
let currentView = 'dashboard';
let decisions = [];
let toolCalls = [];
let isDarkMode = false;
let firestoreStatus = 'connecting';
const apiKey = "AIzaSyAKEDYBH1TJ91Swga_3hKk7ALO4lrwrqc8";

function updateStatusIndicator(status) {
    firestoreStatus = status;
    const circle = document.getElementById('statusCircle');
    const text = document.getElementById('statusText');

    if (circle && text) {
        circle.classList.remove('bg-gray-400', 'bg-green-500', 'bg-red-500', 'animate-pulse');
        text.classList.remove('text-gray-600', 'text-green-600', 'text-red-600');

        if (status === 'connected') {
            circle.classList.add('bg-green-500');
            text.classList.add('text-green-600');
            circle.title = 'Connected';
            text.textContent = 'Connected';
        } else if (status === 'error') {
            circle.classList.add('bg-red-500');
            text.classList.add('text-red-600');
            circle.title = 'Error';
            text.textContent = 'Error';
        } else {
            circle.classList.add('bg-gray-400', 'animate-pulse');
            text.classList.add('text-gray-600');
            circle.title = 'Connecting...';
            text.textContent = 'Connecting...';
        }
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        isDarkMode = true;
        document.documentElement.classList.add('dark');
    } else {
        isDarkMode = false;
    }
}

function toggleAIBotPanel() {
    const panel = document.getElementById('aiBotPanel');
    panel.classList.toggle('translate-x-full');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const colorMap = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };

    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast p-4 rounded-lg shadow-xl text-white ${colorMap[type]} flex items-center`;
    toast.innerHTML = `<i class="fas ${iconMap[type]} mr-3"></i> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

async function initializeFirebase() {
    updateStatusIndicator('connecting');
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
            showToast('Authenticated successfully.', 'success');
        } else {
            await signInAnonymously(auth);
            showToast('Signed in anonymously.', 'info');
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                console.log("User ID:", userId);
                updateStatusIndicator('connected');
                setupFirestoreListeners();
                switchView(currentView);
            } else {
                userId = null;
                console.log("No user signed in.");
                updateStatusIndicator('error');
            }
        });

    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        updateStatusIndicator('error');
        showToast(`Firebase Error: ${error.message}`, 'error');
    }
}

function setupFirestoreListeners() {
    if (!db || !userId) return;

    const baseCollectionPath = `/artifacts/${appId}/users/${userId}`;

    const toolCallQuery = query(collection(db, `${baseCollectionPath}/tool_calls`));
    onSnapshot(toolCallQuery, (snapshot) => {
        toolCalls = [];
        snapshot.forEach(doc => {
            toolCalls.push({ id: doc.id, ...doc.data() });
        });
        toolCalls.sort((a, b) => b.timestamp - a.timestamp);
        if (currentView === 'router') renderToolRouter();
    }, (error) => {
        console.error("Tool Call Snapshot Error:", error);
        showToast("Failed to load tool call data.", 'error');
    });

    const decisionQuery = query(collection(db, `${baseCollectionPath}/decisions`));
    onSnapshot(decisionQuery, (snapshot) => {
        decisions = [];
        snapshot.forEach(doc => {
            decisions.push({ id: doc.id, ...doc.data() });
        });
        decisions.sort((a, b) => b.timestamp - a.timestamp);
        if (currentView === 'decision') renderDecisionLog();
    }, (error) => {
        console.error("Decision Snapshot Error:", error);
        showToast("Failed to load decision data.", 'error');
    });
}

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`; 

function renderMessage(sender, text) {
    const historyDiv = document.getElementById('chatHistory');
    const messageDiv = document.createElement('div');
    const formattedText = text.replace(/\n/g, '<br>');

    if (sender === 'user') {
        messageDiv.className = 'flex justify-end';
        messageDiv.innerHTML = `
            <div class="bg-blue-600 text-white p-3 rounded-xl rounded-br-sm max-w-[80%] shadow-md">
                ${formattedText}
            </div>
        `;
    } else {
        messageDiv.className = 'flex justify-start';
        messageDiv.innerHTML = `
            <div class="bg-purple-100 text-gray-800 p-3 rounded-xl rounded-bl-sm max-w-[80%] shadow-sm">
                ${formattedText}
            </div>
        `;
    }
    historyDiv.appendChild(messageDiv);
    historyDiv.scrollTop = historyDiv.scrollHeight;
}

async function callGeminiAPI(prompt) {
    const chatHistoryDiv = document.getElementById('chatHistory');
    const inputField = document.getElementById('chatInput');
    const sendButton = document.getElementById('chatSendButton');

    renderMessage('user', prompt);
    inputField.value = '';
    sendButton.disabled = true;

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'flex justify-start';
    loadingDiv.id = 'ai-loading';
    loadingDiv.innerHTML = `
        <div class="bg-purple-100 text-gray-800 p-3 rounded-xl rounded-bl-sm max-w-[80%] shadow-sm">
            <i class="fas fa-spinner fa-spin mr-2"></i> Thinking...
        </div>
    `;
    chatHistoryDiv.appendChild(loadingDiv);
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;

    const systemPrompt = "You are a helpful AI assistant for the Composio Tool Router Dashboard. Provide concise and accurate answers based on the user's query. If the query is general knowledge, use the search tool for grounding. If the query is about the dashboard's current data (e.g., 'What is the current latency?'), state that you cannot access live data but can explain what the metric represents.";

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    const maxRetries = 5;
    let responseText = "Sorry, I couldn't get a response from the AI assistant. Please try again later.";

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        let delay = Math.pow(2, attempt) * 1000;
        await new Promise(res => setTimeout(res, delay)); 

        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 429) continue;

            if (!response.ok) throw new Error(`API returned status ${response.status}`);

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                responseText = candidate.content.parts[0].text;
                break;
            }

        } catch (error) {
            console.error("Gemini API call failed:", error);
        }
    }

    loadingDiv.remove();
    renderMessage('ai', responseText);
    sendButton.disabled = false;
}

function handleChatSubmission(e) {
    e.preventDefault();
    const chatInput = document.getElementById('chatInput');
    const prompt = chatInput.value.trim();

    if (prompt) {
        callGeminiAPI(prompt);
    }
}

function switchView(viewId) {
    currentView = viewId;
    const contentArea = document.getElementById('contentArea');

    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.dataset.view === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    contentArea.innerHTML = '';

    switch (viewId) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'router':
            renderToolRouter();
            break;
        case 'decision':
            renderDecisionLog();
            break;
        case 'simulation':
            renderSimulation();
            break;
        default:
            contentArea.innerHTML = `<p class="text-center text-gray-500 pt-10">View not found.</p>`;
    }
}

function renderDashboard() {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2 class="text-3xl font-extrabold text-gray-900 mb-6">System Dashboard</h2>
        <p class="text-gray-600 mb-8">Quick overview of AI router performance and data insights. <span class="text-sm text-primary break-all">User ID: ${userId || 'N/A'}</span></p>

        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-10">
            ${renderMetricCard('Total Calls', toolCalls.length, 'fas fa-arrow-up', 'text-primary')}
            ${renderMetricCard('Successful Routes', toolCalls.filter(c => c.status === 'success').length, 'fas fa-check-circle', 'text-green-500')}
            ${renderMetricCard('Router Accuracy', '92.5%', 'fas fa-bullseye', 'text-secondary')}
            ${renderMetricCard('Avg Latency (ms)', '185ms', 'fas fa-clock', 'text-yellow-500')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-gray-50 p-6 rounded-xl shadow-inner h-96">
                <h3 class="text-xl font-semibold mb-4 text-gray-800">Tool Call Volume (Last 7 Days)</h3>
                <canvas id="callVolumeChart"></canvas>
            </div>
            <div class="lg:col-span-1 bg-gray-50 p-6 rounded-xl shadow-inner overflow-y-auto h-96">
                <h3 class="text-xl font-semibold mb-4 text-gray-800">Recent Decisions</h3>
                ${renderRecentDecisions()}
            </div>
        </div>

        <div class="mt-10 p-6 bg-primary/10 rounded-xl shadow-md border-l-4 border-primary flex flex-col md:flex-row justify-between items-start md:items-center">
            <p class="text-primary-800 font-medium mb-3 md:mb-0">
                Run a comprehensive AI analysis on the latest 100 tool calls.
            </p>
            <button id="runAIAnalysis" class="bg-primary hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200 shadow-md">
                <i class="fas fa-magic mr-2"></i> Run AI Analysis
            </button>
        </div>
    `;
    setTimeout(initializeChart, 0);
}

function renderMetricCard(title, value, icon, color) {
    return `
        <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <div class="flex items-center">
                <div class="p-3 rounded-full ${color} bg-opacity-10 mr-4">
                    <i class="${icon} text-xl"></i>
                </div>
                <div>
                    <p class="text-sm font-medium text-gray-500">${title}</p>
                    <p class="text-2xl font-bold text-gray-900">${value}</p>
                </div>
            </div>
        </div>
    `;
}

function renderRecentDecisions() {
    if (decisions.length === 0) {
        return '<p class="text-gray-500 italic">No decisions logged yet.</p>';
    }
    return decisions.slice(0, 5).map(d => `
        <div class="mb-4 p-3 bg-white rounded-lg shadow-sm border border-gray-200">
            <p class="font-medium text-gray-800 truncate">${d.prompt}</p>
            <p class="text-sm text-gray-600 mt-1">
                <span class="font-semibold">${d.tool}</span> | ${new Date(d.timestamp).toLocaleTimeString()}
            </p>
        </div>
    `).join('');
}

function renderToolRouter() {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2 class="text-3xl font-extrabold text-gray-900 mb-6">Tool Router & Call Log</h2>
        <div class="flex flex-col md:flex-row gap-4 mb-6">
            <form id="toolCallForm" class="p-6 bg-gray-100 rounded-xl shadow-inner w-full md:w-1/2 lg:w-1/3">
                <h3 class="text-xl font-semibold mb-4 text-gray-800">New Tool Call</h3>
                <div class="mb-4">
                    <label for="promptInput" class="block text-sm font-medium text-gray-700 mb-1">User Prompt</label>
                    <textarea id="promptInput" required rows="3" class="w-full px-3 py-2 border border-gray-300 bg-white text-gray-800 rounded-lg shadow-sm focus:ring-primary focus:border-primary transition duration-150"></textarea>
                </div>
                <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg transition duration-200 shadow-md">
                    <i class="fas fa-play mr-2"></i> Route & Call Tool
                </button>
            </form>

            <div class="p-6 bg-white rounded-xl shadow-md w-full md:w-1/2 lg:w-2/3 flex flex-col justify-between">
                <h3 class="text-xl font-semibold mb-4 text-gray-800">Data Actions</h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label for="statusFilter" class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select id="statusFilter" class="w-full px-3 py-2 border border-gray-300 bg-white text-gray-800 rounded-lg shadow-sm focus:ring-primary focus:border-primary transition duration-150">
                            <option value="">All</option>
                            <option value="success">Success</option>
                            <option value="failure">Failure</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>
                    <div>
                        <label for="toolFilter" class="block text-sm font-medium text-gray-700 mb-1">Tool Used</label>
                        <select id="toolFilter" class="w-full px-3 py-2 border border-gray-300 bg-white text-gray-800 rounded-lg shadow-sm focus:ring-primary focus:border-primary transition duration-150">
                            <option value="">All Tools</option>
                            <option value="google:search">Google Search</option>
                            <option value="calendar:create">Calendar Create</option>
                            <option value="jira:update">Jira Update</option>
                        </select>
                    </div>
                    <div class="flex flex-col justify-end">
                        <button id="applyFilters" class="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition duration-200 shadow-md mb-2">
                            <i class="fas fa-filter mr-2"></i> Apply Filters
                        </button>
                        <button id="exportData" class="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 rounded-lg transition duration-200 shadow-md">
                            <i class="fas fa-download mr-2"></i> Export Data
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200">
            ${renderToolCallTable(toolCalls)}
        </div>
    `;
}

function renderToolCallTable(calls) {
    if (calls.length === 0) {
        return '<p class="p-8 text-center text-gray-500 italic">No tool calls have been logged yet.</p>';
    }

    const header = (name, mobileHide = false) => `<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${mobileHide ? 'hidden lg:table-cell' : ''}">${name}</th>`;

    const rows = calls.map(call => {
        const statusClass = call.status === 'success' ? 'bg-green-100 text-green-800' :
                           call.status === 'failure' ? 'bg-red-100 text-red-800' :
                           'bg-yellow-100 text-yellow-800';

        return `
            <tr class="border-t border-gray-200 hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900 w-1/3">${call.tool}</td>
                <td class="px-4 py-3 text-sm text-gray-600 truncate max-w-xs w-1/2">${call.prompt}</td>
                <td class="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">${new Date(call.timestamp).toLocaleString()}</td>
                <td class="px-4 py-3 text-sm w-1/6">
                    <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${call.status}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    ${header('Tool')}
                    ${header('Prompt')}
                    ${header('Timestamp', true)}
                    ${header('Status')}
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${rows}
            </tbody>
        </table>
    `;
}

function renderDecisionLog() {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2 class="text-3xl font-extrabold text-gray-900 mb-6">Decision Log</h2>
        <p class="text-gray-600 mb-8">Review the AI model's routing decisions (Prompt, Decision, Rationale).</p>

        <div id="decisionList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            ${decisions.length === 0 
                ? '<p class="col-span-full p-8 text-center text-gray-500 italic">No routing decisions have been logged yet.</p>' 
                : decisions.map(renderDecisionCard).join('')
            }
        </div>
    `;
}

function renderDecisionCard(decision) {
    const timestamp = new Date(decision.timestamp).toLocaleString();
    return `
        <div class="bg-white rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition duration-300 flex flex-col">
            <div class="p-5 border-b border-gray-100">
                <div class="text-xs font-semibold uppercase text-indigo-600 mb-1">${decision.tool}</div>
                <h3 class="text-lg font-bold text-gray-900 mb-2 truncate" title="${decision.prompt}">${decision.prompt}</h3>
            </div>
            <div class="p-5 flex-grow">
                <p class="text-sm text-gray-700 mb-3 line-clamp-3">${decision.rationale || 'No rationale provided.'}</p>
            </div>
            <div class="p-5 pt-0 text-right text-xs text-gray-400 border-t border-gray-100">
                Logged: ${timestamp}
            </div>
        </div>
    `;
}

function renderSimulation() {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2 class="text-3xl font-extrabold text-gray-900 mb-6">Router Simulation</h2>
        <p class="text-gray-600 mb-8">Test the router against a large batch of prompts to assess performance and robustness.</p>

        <div class="max-w-3xl mx-auto bg-gray-100 p-6 sm:p-8 rounded-xl shadow-inner">
            <form id="simulationForm">
                <h3 class="text-xl font-semibold text-gray-800 mb-5">Simulation Parameters</h3>

                <div class="mb-5">
                    <label for="promptCount" class="block text-sm font-medium text-gray-700 mb-1">Number of Prompts to Simulate (1-100)</label>
                    <input type="number" id="promptCount" value="10" min="1" max="100" required
                        class="w-full px-4 py-2 border border-gray-300 bg-white text-gray-800 rounded-lg shadow-sm focus:ring-primary focus:border-primary transition duration-150">
                </div>

                <div class="mb-5">
                    <label for="simulationSource" class="block text-sm font-medium text-gray-700 mb-1">Prompt Source</label>
                    <select id="simulationSource" required
                        class="w-full px-4 py-2 border border-gray-300 bg-white text-gray-800 rounded-lg shadow-sm focus:ring-primary focus:border-primary transition duration-150">
                        <option value="sample">Use Sample Prompts</option>
                        <option value="user_data">Use Recent Tool Call Prompts</option>
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Select the source for the prompts used in the simulation batch.</p>
                </div>

                <div class="mb-5">
                    <label for="mockLatency" class="block text-sm font-medium text-gray-700 mb-1">Mock Tool Latency (ms)</label>
                    <input type="range" id="mockLatency" value="150" min="50" max="1000" oninput="document.getElementById('latencyValue').innerText = this.value + ' ms'"
                        class="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer">
                    <p class="text-sm text-gray-500 mt-1">Simulated latency: <span id="latencyValue">150 ms</span></p>
                </div>

                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition duration-200 shadow-lg">
                    <i class="fas fa-forward mr-2"></i> Start Simulation
                </button>
            </form>
        </div>

        <div id="simulationResults" class="mt-10 p-6 bg-white rounded-xl shadow-lg border border-gray-200 hidden">
            <h3 class="text-2xl font-bold text-gray-900 mb-4">Simulation Results</h3>
            <div id="resultsContent"></div>
        </div>
    `;
    document.getElementById('latencyValue').innerText = document.getElementById('mockLatency').value + ' ms';
}

let callVolumeChart;
function initializeChart() {
    if (callVolumeChart) callVolumeChart.destroy();

    const ctx = document.getElementById('callVolumeChart');
    if (!ctx) return;

    const data = {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
            {
                label: 'Tool Calls',
                data: [15, 22, 18, 25, 30, 10, 5],
                borderColor: isDarkMode ? '#a78bfa' : '#3b82f6',
                backgroundColor: isDarkMode ? 'rgba(167, 139, 250, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true,
            },
        ]
    };

    callVolumeChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }, ticks: { color: isDarkMode ? 'white' : 'black' } },
                x: { grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }, ticks: { color: isDarkMode ? 'white' : 'black' } }
            }
        }
    });
}

async function routeAndCallTool(prompt) {
    showToast('Routing prompt and calling tool...', 'info');

    const mockTools = ['google:search', 'calendar:create', 'jira:update', 'slack:send_message'];
    const randomTool = mockTools[Math.floor(Math.random() * mockTools.length)];
    const status = Math.random() < 0.8 ? 'success' : 'failure';

    const decisionData = {
        prompt: prompt,
        tool: randomTool,
        rationale: `The model determined that ${randomTool} was the best fit because the prompt mentioned keywords related to its function.`,
        timestamp: Date.now(),
    };

    const toolCallData = {
        prompt: prompt,
        tool: randomTool,
        status: status,
        result: status === 'success' ? `Successfully executed ${randomTool}.` : `Failed to execute ${randomTool} due to a mock error.`,
        timestamp: Date.now(),
    };

    try {
        const decisionRef = collection(db, `/artifacts/${appId}/users/${userId}/decisions`);
        await addDoc(decisionRef, decisionData);

        const callRef = collection(db, `/artifacts/${appId}/users/${userId}/tool_calls`);
        await addDoc(callRef, toolCallData);

        showToast(`Tool routed to ${randomTool}. Status: ${status}`, status === 'success' ? 'success' : 'error');
    } catch (e) {
        console.error("Error adding document: ", e);
        showToast(`Failed to log data: ${e.message}`, 'error');
    }
}

function handleToolCallSubmission(e) {
    e.preventDefault();
    const promptInput = document.getElementById('promptInput');
    const prompt = promptInput.value.trim();

    if (prompt) {
        routeAndCallTool(prompt);
        promptInput.value = '';
    } else {
        showToast('Please enter a prompt.', 'error');
    }
}

function handleDecisionSubmission(e) {
    e.preventDefault();
    showToast('Decision logged (Mock functionality).', 'info');
}

async function handleSimulationSubmission(e) {
    e.preventDefault();
    const promptCount = parseInt(document.getElementById('promptCount').value);
    const mockLatency = parseInt(document.getElementById('mockLatency').value);

    if (isNaN(promptCount) || promptCount < 1 || promptCount > 100) {
        showToast('Please enter a valid prompt count (1-100).', 'error');
        return;
    }

    const simResultsDiv = document.getElementById('simulationResults');
    const resultsContentDiv = document.getElementById('resultsContent');
    simResultsDiv.classList.remove('hidden');
    resultsContentDiv.innerHTML = '<p class="text-center text-primary font-medium"><i class="fas fa-spinner fa-spin mr-2"></i> Running simulation...</p>';

    const startSimTime = performance.now();
    let successCount = 0;
    let failureCount = 0;

    const samplePrompts = [
        "Schedule a meeting with the team next Tuesday morning.",
        "Find the best way to travel from London to Paris by train.",
        "Update the Jira ticket 'Project X Bug' with the status 'In Progress'.",
        "Send a Slack message to the #engineering channel about the new deployment.",
        "What is the capital of Australia?",
        "Draft an email to finance about my expense report.",
        "Create a new document for Q4 planning.",
        "Check the weather forecast for San Francisco tomorrow.",
        "Log a high-priority bug in Jira for the payment gateway.",
        "Who won the last F1 race?",
    ];

    let promptsToRun = [];
    for (let i = 0; i < promptCount; i++) {
        promptsToRun.push(samplePrompts[i % samplePrompts.length]);
    }

    const mockToolExecution = (prompt) => new Promise(resolve => {
        const toolResult = Math.random() < 0.85 ? 'success' : 'failure';
        setTimeout(() => resolve(toolResult), mockLatency * (0.8 + Math.random() * 0.4));
    });

    const results = await Promise.all(promptsToRun.map(prompt => mockToolExecution(prompt)));

    results.forEach(result => {
        if (result === 'success') successCount++;
        else failureCount++;
    });

    const endSimTime = performance.now();
    const totalSimTime = (endSimTime - startSimTime).toFixed(2);
    const avgLatency = (totalSimTime / promptCount).toFixed(2);
    const accuracy = ((successCount / promptCount) * 100).toFixed(1);

    resultsContentDiv.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${renderMetricCard('Total Prompts', promptCount, 'fas fa-list-ol', 'text-primary')}
            ${renderMetricCard('Total Time (ms)', totalSimTime, 'fas fa-hourglass-half', 'text-gray-500')}
            ${renderMetricCard('Success Rate', `${accuracy}%`, 'fas fa-award', 'text-green-500')}
            ${renderMetricCard('Avg Latency (ms)', avgLatency, 'fas fa-gauge-high', 'text-secondary')}
        </div>
        <div class="mt-6 p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
            <p class="text-yellow-800 font-medium">The simulation ran ${promptCount} prompts. Successes: ${successCount}, Failures: ${failureCount}.</p>
        </div>
    `;
    showToast(`Simulation complete in ${totalSimTime} ms.`, 'success');
}

function runAIAnalysis() {
    showToast('Running comprehensive AI analysis (Mock).', 'info');
}

function applyFilters() {
    const status = document.getElementById('statusFilter')?.value;
    const tool = document.getElementById('toolFilter')?.value;
    showToast(`Applying mock filters: Status=${status || 'All'}, Tool=${tool || 'All'}`, 'info');
}

function exportData() {
    showToast('Exporting data to CSV (Mock).', 'info');
}

window.onload = function () {
    initializeTheme();
    initializeFirebase();

    document.getElementById('contentArea').addEventListener('submit', (e) => {
        if (e.target.id === 'toolCallForm') handleToolCallSubmission(e);
        else if (e.target.id === 'decisionForm') handleDecisionSubmission(e);
        else if (e.target.id === 'simulationForm') handleSimulationSubmission(e);
    });

    document.getElementById('contentArea').addEventListener('click', (e) => {
        if (e.target.id === 'runAIAnalysis') runAIAnalysis();
        else if (e.target.id === 'applyFilters') applyFilters();
        else if (e.target.id === 'exportData') exportData();
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = e.currentTarget.dataset.view;
            switchView(viewId);
        });
    });

    document.getElementById('aiBotToggle').addEventListener('click', toggleAIBotPanel);
    document.getElementById('closeAiBot').addEventListener('click', toggleAIBotPanel);
    document.getElementById('chatForm').addEventListener('submit', handleChatSubmission);

    const teamButtons = [document.getElementById('teamButtonHeader')];
        teamButtons.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    document.getElementById('teamBanner').classList.remove('hidden');
                });
            }
        });

    switchView(currentView);
}

class TelemetryHub {
    constructor() {
        this.charts = {};
        this.data = {
            toolCalls: [],
            agentDecisions: [],
            correlations: []
        };
        this.filters = {
            agentId: '',
            toolName: '',
            status: ''
        };
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupTabNavigation();
        await this.loadData();
        this.initializeCharts();
        this.updateDashboard();
    }

    setupEventListeners() {
        document.getElementById('toolCallForm').addEventListener('submit', (e) => this.handleToolCallSubmit(e));
        document.getElementById('decisionForm').addEventListener('submit', (e) => this.handleDecisionSubmit(e));
        document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
        setInterval(() => this.refreshData(), 30000);
    }

    setupTabNavigation() {
        const tabs = ['dashboardTab', 'dataInputTab', 'analyticsTab'];
        const views = ['dashboardView', 'dataInputView', 'analyticsView'];

        tabs.forEach((tabId, index) => {
            document.getElementById(tabId).addEventListener('click', () => {
                tabs.forEach(t => {
                    const tab = document.getElementById(t);
                    tab.classList.remove('border-b-2', 'border-blue-300');
                });
                document.getElementById(tabId).classList.add('border-b-2', 'border-blue-300');

                views.forEach(viewId => {
                    document.getElementById(viewId).classList.add('hidden');
                });
                document.getElementById(views[index]).classList.remove('hidden');

                if (index === 0 || index === 2) {
                    setTimeout(() => this.updateCharts(), 100);
                }
            });
        });
    }

    async loadData() {
        this.showLoading(true);
        try {
            const toolCallsResponse = await fetch('tables/toolrouter_calls?limit=1000');
            if (toolCallsResponse.ok) {
                const toolCallsData = await toolCallsResponse.json();
                this.data.toolCalls = toolCallsData.data || [];
            }

            const decisionsResponse = await fetch('tables/agent_decisions?limit=1000');
            if (decisionsResponse.ok) {
                const decisionsData = await decisionsResponse.json();
                this.data.agentDecisions = decisionsData.data || [];
            }

            const correlationsResponse = await fetch('tables/correlation_metrics?limit=1000');
            if (correlationsResponse.ok) {
                const correlationsData = await correlationsResponse.json();
                this.data.correlations = correlationsData.data || [];
            }

        } catch (error) {
            console.error('Error loading data:', error);
            this.showToast('Error loading data', 'error');
        }
        this.showLoading(false);
    }

    async refreshData() {
        await this.loadData();
        this.updateDashboard();
        this.updateCharts();
        this.updateAnalytics();
    }

    async handleToolCallSubmit(e) {
        e.preventDefault();
        this.showLoading(true);

        const formData = {
            tool_name: document.getElementById('toolName').value,
            call_status: document.getElementById('callStatus').value,
            latency_ms: parseFloat(document.getElementById('latency').value),
            parameters: document.getElementById('parameters').value,
            agent_id: document.getElementById('agentId').value,
            session_id: document.getElementById('sessionId').value,
            error_message: document.getElementById('errorMessage').value,
            timestamp: new Date().toISOString(),
            response_data: ''
        };

        try {
            const response = await fetch('tables/toolrouter_calls', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                this.showToast('Tool call data added successfully!', 'success');
                document.getElementById('toolCallForm').reset();
                await this.refreshData();
                this.calculateCorrelations();
            } else {
                throw new Error('Failed to add tool call data');
            }
        } catch (error) {
            console.error('Error adding tool call:', error);
            this.showToast('Error adding tool call data', 'error');
        }
        this.showLoading(false);
    }

    async handleDecisionSubmit(e) {
        e.preventDefault();
        this.showLoading(true);

        const formData = {
            agent_id: document.getElementById('decisionAgentId').value,
            session_id: document.getElementById('decisionSessionId').value,
            decision_type: document.getElementById('decisionType').value,
            decision_context: document.getElementById('decisionContext').value,
            chosen_action: document.getElementById('chosenAction').value,
            confidence_score: parseFloat(document.getElementById('confidenceScore').value),
            outcome_success: document.getElementById('outcomeSuccess').value === 'true',
            timestamp: new Date().toISOString(),
            related_tool_calls: []
        };

        try {
            const response = await fetch('tables/agent_decisions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                this.showToast('Agent decision added successfully!', 'success');
                document.getElementById('decisionForm').reset();
                await this.refreshData();
                this.calculateCorrelations();
            } else {
                throw new Error('Failed to add agent decision');
            }
        } catch (error) {
            console.error('Error adding decision:', error);
            this.showToast('Error adding agent decision', 'error');
        }
        this.showLoading(false);
    }

    async calculateCorrelations() {
        const correlations = [];

        this.data.agentDecisions.forEach(decision => {
            const relatedCalls = this.data.toolCalls.filter(call => 
                call.agent_id === decision.agent_id && 
                call.session_id === decision.session_id &&
                Math.abs(new Date(call.timestamp) - new Date(decision.timestamp)) < 60000
            );

            if (relatedCalls.length > 0) {
                const avgLatency = relatedCalls.reduce((sum, call) => sum + call.latency_ms, 0) / relatedCalls.length;
                const successRate = relatedCalls.filter(call => call.call_status === 'success').length / relatedCalls.length;

                const correlation = {
                    agent_id: decision.agent_id,
                    session_id: decision.session_id,
                    decision_id: decision.id,
                    tool_call_ids: relatedCalls.map(call => call.id),
                    correlation_strength: decision.confidence_score * successRate,
                    success_rate: successRate,
                    avg_latency: avgLatency,
                    pattern_type: relatedCalls.length > 1 ? 'sequential' : 'single',
                    timestamp: new Date().toISOString()
                };

                correlations.push(correlation);
            }
        });

        for (const correlation of correlations) {
            try {
                await fetch('tables/correlation_metrics', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(correlation)
                });
            } catch (error) {
                console.error('Error saving correlation:', error);
            }
        }

        this.data.correlations = [...this.data.correlations, ...correlations];
    }

    updateDashboard() {
        const stats = this.calculateStats();

        document.getElementById('totalCalls').textContent = stats.totalCalls;
        document.getElementById('successRate').textContent = `${stats.successRate}%`;
        document.getElementById('avgLatency').textContent = `${stats.avgLatency}ms`;
        document.getElementById('activeAgents').textContent = stats.activeAgents;

        this.updateRecentActivity();
    }

    calculateStats() {
        const totalCalls = this.data.toolCalls.length;
        const successfulCalls = this.data.toolCalls.filter(call => call.call_status === 'success').length;
        const successRate = totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0;

        const totalLatency = this.data.toolCalls.reduce((sum, call) => sum + (call.latency_ms || 0), 0);
        const avgLatency = totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0;

        const uniqueAgents = new Set(this.data.toolCalls.map(call => call.agent_id));
        const activeAgents = uniqueAgents.size;

        return { totalCalls, successRate, avgLatency, activeAgents };
    }

    updateRecentActivity() {
        const recentActivity = document.getElementById('recentActivity');
        const recentCalls = this.data.toolCalls
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 10);

        recentActivity.innerHTML = recentCalls.map(call => `
            <div class="flex items-center justify-between p-3 bg-white bg-opacity-10 rounded-lg">
                <div class="flex items-center space-x-3">
                    <i class="fas fa-${call.call_status === 'success' ? 'check-circle text-green-400' : 'times-circle text-red-400'}"></i>
                    <div>
                        <p class="text-white font-medium">${call.tool_name}</p>
                        <p class="text-blue-200 text-sm">${call.agent_id}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-white text-sm">${call.latency_ms}ms</p>
                    <p class="text-blue-200 text-xs">${new Date(call.timestamp).toLocaleTimeString()}</p>
                </div>
            </div>
        `).join('');
    }

    initializeCharts() {
        const statusCtx = document.getElementById('statusChart').getContext('2d');
        this.charts.status = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['Success', 'Failure', 'Timeout', 'Error'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: ['#10B981', '#EF4444', '#F59E0B', '#8B5CF6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: 'white' }
                    }
                }
            }
        });

        const latencyCtx = document.getElementById('latencyChart').getContext('2d');
        this.charts.latency = new Chart(latencyCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Latency (ms)',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'white' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
                    y: { ticks: { color: 'white' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
                },
                plugins: {
                    legend: { labels: { color: 'white' } }
                }
            }
        });

        const toolUsageCtx = document.getElementById('toolUsageChart').getContext('2d');
        this.charts.toolUsage = new Chart(toolUsageCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Usage Count',
                    data: [],
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderColor: '#22C55E',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'white' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
                    y: { ticks: { color: 'white' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
                },
                plugins: {
                    legend: { labels: { color: 'white' } }
                }
            }
        });

        const correlationCtx = document.getElementById('correlationChart').getContext('2d');
        this.charts.correlation = new Chart(correlationCtx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Decision Confidence vs Success Rate',
                    data: [],
                    backgroundColor: 'rgba(168, 85, 247, 0.6)',
                    borderColor: '#A855F7',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { 
                        title: { display: true, text: 'Confidence Score', color: 'white' },
                        ticks: { color: 'white' }, 
                        grid: { color: 'rgba(255, 255, 255, 0.1)' } 
                    },
                    y: { 
                        title: { display: true, text: 'Success Rate', color: 'white' },
                        ticks: { color: 'white' }, 
                        grid: { color: 'rgba(255, 255, 255, 0.1)' } 
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white' } }
                }
            }
        });
    }

    updateCharts() {
        this.updateStatusChart();
        this.updateLatencyChart();
        this.updateToolUsageChart();
        this.updateCorrelationChart();
    }

    updateStatusChart() {
        const statusCounts = { success: 0, failure: 0, timeout: 0, error: 0 };
        this.data.toolCalls.forEach(call => {
            if (statusCounts.hasOwnProperty(call.call_status)) {
                statusCounts[call.call_status]++;
            }
        });

        this.charts.status.data.datasets[0].data = [
            statusCounts.success,
            statusCounts.failure,
            statusCounts.timeout,
            statusCounts.error
        ];
        this.charts.status.update();
    }

    updateLatencyChart() {
        const sortedCalls = this.data.toolCalls
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .slice(-20);

        const labels = sortedCalls.map((call, index) => `Call ${index + 1}`);
        const data = sortedCalls.map(call => call.latency_ms || 0);

        this.charts.latency.data.labels = labels;
        this.charts.latency.data.datasets[0].data = data;
        this.charts.latency.update();
    }

    updateToolUsageChart() {
        const toolUsage = {};
        this.data.toolCalls.forEach(call => {
            toolUsage[call.tool_name] = (toolUsage[call.tool_name] || 0) + 1;
        });

        const sortedTools = Object.entries(toolUsage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        this.charts.toolUsage.data.labels = sortedTools.map(([tool]) => tool);
        this.charts.toolUsage.data.datasets[0].data = sortedTools.map(([, count]) => count);
        this.charts.toolUsage.update();
    }

    updateCorrelationChart() {
        const correlationData = this.data.correlations.map(corr => ({
            x: corr.correlation_strength || 0,
            y: corr.success_rate || 0
        }));

        this.charts.correlation.data.datasets[0].data = correlationData;
        this.charts.correlation.update();
    }

    applyFilters() {
        this.filters.agentId = document.getElementById('filterAgentId').value.toLowerCase();
        this.filters.toolName = document.getElementById('filterToolName').value.toLowerCase();
        this.filters.status = document.getElementById('filterStatus').value;

        this.updateAnalytics();
        this.showToast('Filters applied successfully!', 'success');
    }

    updateAnalytics() {
        const filteredCalls = this.data.toolCalls.filter(call => {
            const matchesAgent = !this.filters.agentId || call.agent_id.toLowerCase().includes(this.filters.agentId);
            const matchesTool = !this.filters.toolName || call.tool_name.toLowerCase().includes(this.filters.toolName);
            const matchesStatus = !this.filters.status || call.call_status === this.filters.status;
            return matchesAgent && matchesTool && matchesStatus;
        });

        this.updateToolCallsTable(filteredCalls);
        this.updatePerformanceMetrics(filteredCalls);
        this.updateAgentPerformance();
        this.updateToolReliability();
    }

    updateToolCallsTable(calls) {
        const tbody = document.getElementById('toolCallsTableBody');
        tbody.innerHTML = calls.slice(0, 50).map(call => `
            <tr class="border-b border-white border-opacity-10">
                <td class="py-3 px-4">${call.tool_name}</td>
                <td class="py-3 px-4">
                    <span class="px-2 py-1 rounded-full text-xs ${this.getStatusColor(call.call_status)}">
                        ${call.call_status}
                    </span>
                </td>
                <td class="py-3 px-4">${call.latency_ms}ms</td>
                <td class="py-3 px-4">${call.agent_id}</td>
                <td class="py-3 px-4">${call.session_id}</td>
                <td class="py-3 px-4">${new Date(call.timestamp).toLocaleString()}</td>
            </tr>
        `).join('');
    }

    getStatusColor(status) {
        const colors = {
            success: 'bg-green-500 text-white',
            failure: 'bg-red-500 text-white',
            timeout: 'bg-yellow-500 text-black',
            error: 'bg-purple-500 text-white'
        };
        return colors[status] || 'bg-gray-500 text-white';
    }

    updatePerformanceMetrics(calls) {
        if (calls.length === 0) {
            document.getElementById('p95Latency').textContent = '-';
            document.getElementById('p99Latency').textContent = '-';
            document.getElementById('errorRate').textContent = '-';
            document.getElementById('timeoutRate').textContent = '-';
            return;
        }

        const latencies = calls.map(call => call.latency_ms).sort((a, b) => a - b);
        const p95Index = Math.floor(latencies.length * 0.95);
        const p99Index = Math.floor(latencies.length * 0.99);

        const errorCount = calls.filter(call => call.call_status === 'error').length;
        const timeoutCount = calls.filter(call => call.call_status === 'timeout').length;

        document.getElementById('p95Latency').textContent = `${latencies[p95Index] || 0}ms`;
        document.getElementById('p99Latency').textContent = `${latencies[p99Index] || 0}ms`;
        document.getElementById('errorRate').textContent = `${((errorCount / calls.length) * 100).toFixed(1)}%`;
        document.getElementById('timeoutRate').textContent = `${((timeoutCount / calls.length) * 100).toFixed(1)}%`;
    }

    updateAgentPerformance() {
        const agentStats = {};

        this.data.toolCalls.forEach(call => {
            if (!agentStats[call.agent_id]) {
                agentStats[call.agent_id] = { total: 0, successful: 0, totalLatency: 0 };
            }
            agentStats[call.agent_id].total++;
            if (call.call_status === 'success') {
                agentStats[call.agent_id].successful++;
            }
            agentStats[call.agent_id].totalLatency += call.latency_ms || 0;
        });

        const agentPerformanceList = document.getElementById('agentPerformanceList');
        agentPerformanceList.innerHTML = Object.entries(agentStats)
            .sort((a, b) => b[1].successful / b[1].total - a[1].successful / a[1].total)
            .slice(0, 5)
            .map(([agentId, stats]) => {
                const successRate = ((stats.successful / stats.total) * 100).toFixed(1);
                const avgLatency = (stats.totalLatency / stats.total).toFixed(0);

                return `
                    <div class="flex justify-between items-center p-2 bg-white bg-opacity-10 rounded">
                        <span class="text-white text-sm">${agentId}</span>
                        <div class="text-right">
                            <div class="text-white text-sm">${successRate}%</div>
                            <div class="text-blue-200 text-xs">${avgLatency}ms avg</div>
                        </div>
                    </div>
                `;
            }).join('');
    }

    updateToolReliability() {
        const toolStats = {};

        this.data.toolCalls.forEach(call => {
            if (!toolStats[call.tool_name]) {
                toolStats[call.tool_name] = { total: 0, successful: 0 };
            }
            toolStats[call.tool_name].total++;
            if (call.call_status === 'success') {
                toolStats[call.tool_name].successful++;
            }
        });

        const toolReliabilityList = document.getElementById('toolReliabilityList');
        toolReliabilityList.innerHTML = Object.entries(toolStats)
            .sort((a, b) => b[1].successful / b[1].total - a[1].successful / a[1].total)
            .slice(0, 5)
            .map(([toolName, stats]) => {
                const reliability = ((stats.successful / stats.total) * 100).toFixed(1);

                return `
                    <div class="flex justify-between items-center p-2 bg-white bg-opacity-10 rounded">
                        <span class="text-white text-sm">${toolName}</span>
                        <div class="text-right">
                            <div class="text-white text-sm">${reliability}%</div>
                            <div class="text-blue-200 text-xs">${stats.total} calls</div>
                        </div>
                    </div>
                `;
            }).join('');
    }

    showLoading(show) {
        const indicator = document.getElementById('loadingIndicator');
        if (show) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');

        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500'
        };

        toast.className = `${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`;
        toast.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}-circle"></i>
                <span>${message}</span>
            </div>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);

        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof TelemetryHub !== 'undefined' && document.getElementById('statusChart')) {
        window.telemetryHub = new TelemetryHub();
    }
});
