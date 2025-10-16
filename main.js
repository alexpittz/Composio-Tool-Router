// ToolRouter Telemetry Hub - Main JavaScript

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
        // Form submissions
        document.getElementById('toolCallForm').addEventListener('submit', (e) => this.handleToolCallSubmit(e));
        document.getElementById('decisionForm').addEventListener('submit', (e) => this.handleDecisionSubmit(e));
        
        // Filter application
        document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
        
        // Auto-refresh every 30 seconds
        setInterval(() => this.refreshData(), 30000);
    }

    setupTabNavigation() {
        const tabs = ['dashboardTab', 'dataInputTab', 'analyticsTab'];
        const views = ['dashboardView', 'dataInputView', 'analyticsView'];

        tabs.forEach((tabId, index) => {
            document.getElementById(tabId).addEventListener('click', () => {
                // Update tab styles
                tabs.forEach(t => {
                    const tab = document.getElementById(t);
                    tab.classList.remove('border-b-2', 'border-blue-300');
                });
                document.getElementById(tabId).classList.add('border-b-2', 'border-blue-300');

                // Show/hide views
                views.forEach(viewId => {
                    document.getElementById(viewId).classList.add('hidden');
                });
                document.getElementById(views[index]).classList.remove('hidden');

                // Update charts if switching to dashboard or analytics
                if (index === 0 || index === 2) {
                    setTimeout(() => this.updateCharts(), 100);
                }
            });
        });
    }

    async loadData() {
        this.showLoading(true);
        try {
            // Load tool calls data
            const toolCallsResponse = await fetch('tables/toolrouter_calls?limit=1000');
            if (toolCallsResponse.ok) {
                const toolCallsData = await toolCallsResponse.json();
                this.data.toolCalls = toolCallsData.data || [];
            }

            // Load agent decisions data
            const decisionsResponse = await fetch('tables/agent_decisions?limit=1000');
            if (decisionsResponse.ok) {
                const decisionsData = await decisionsResponse.json();
                this.data.agentDecisions = decisionsData.data || [];
            }

            // Load correlation data
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
        // Calculate correlations between agent decisions and tool calls
        const correlations = [];
        
        this.data.agentDecisions.forEach(decision => {
            const relatedCalls = this.data.toolCalls.filter(call => 
                call.agent_id === decision.agent_id && 
                call.session_id === decision.session_id &&
                Math.abs(new Date(call.timestamp) - new Date(decision.timestamp)) < 60000 // Within 1 minute
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

        // Save correlations
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
        
        // Update status cards
        document.getElementById('totalCalls').textContent = stats.totalCalls;
        document.getElementById('successRate').textContent = `${stats.successRate}%`;
        document.getElementById('avgLatency').textContent = `${stats.avgLatency}ms`;
        document.getElementById('activeAgents').textContent = stats.activeAgents;

        // Update recent activity
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
        // Status Distribution Chart
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

        // Latency Chart
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

        // Tool Usage Chart
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

        // Correlation Chart
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
            .slice(-20); // Last 20 calls

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
            .slice(0, 10); // Top 10 tools

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
        // Filter data
        const filteredCalls = this.data.toolCalls.filter(call => {
            const matchesAgent = !this.filters.agentId || call.agent_id.toLowerCase().includes(this.filters.agentId);
            const matchesTool = !this.filters.toolName || call.tool_name.toLowerCase().includes(this.filters.toolName);
            const matchesStatus = !this.filters.status || call.call_status === this.filters.status;
            return matchesAgent && matchesTool && matchesStatus;
        });

        // Update table
        this.updateToolCallsTable(filteredCalls);

        // Update performance metrics
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

        // Animate in
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        }, 3000);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.telemetryHub = new TelemetryHub();
});