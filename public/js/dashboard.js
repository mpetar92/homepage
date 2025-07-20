// Dashboard initialization
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    loadSystemInfo();
    loadTasks();
    loadNotes();
    initializeAgenda();
    setupSearch();
    loadGitHubReports();
    
    // Update time every second
    setInterval(updateTime, 1000);
    updateTime();
    
    // Auto-save notes
    document.getElementById('notes-content').addEventListener('input', debounce(saveNotes, 1000));
});

// Navigation functions
function goToGitHubAnalyses() {
    window.location.href = '/github-analyses.html';
}

function initializeDashboard() {
    updateGreeting();
    updateCurrentDate();
}

function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    document.getElementById('current-time').textContent = timeString;
    
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.getElementById('timezone').textContent = timezone.split('/').pop();
}

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    
    if (hour >= 12 && hour < 17) {
        greeting = 'Good afternoon';
    } else if (hour >= 17) {
        greeting = 'Good evening';
    }
    
    document.getElementById('greeting').textContent = greeting;
}

function updateCurrentDate() {
    const now = new Date();
    const dateString = now.toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('current-date').textContent = dateString;
}


// Today's Agenda functionality
let todayEvents = [];

function initializeAgenda() {
    loadTodaysEvents();
    displayTodaysDate();
}

function displayTodaysDate() {
    const today = new Date();
    const dateString = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    document.getElementById('agenda-date').textContent = dateString;
}

async function loadTodaysEvents() {
    try {
        const response = await fetch('/api/events/today');
        if (response.ok) {
            const data = await response.json();
            todayEvents = data.events || [];
        } else {
            // Fallback to localStorage
            const storedEvents = JSON.parse(localStorage.getItem('events') || '[]');
            const today = new Date().toDateString();
            todayEvents = storedEvents.filter(event => {
                const eventDate = new Date(event.date).toDateString();
                return eventDate === today;
            });
        }
    } catch (error) {
        // Fallback to localStorage
        const storedEvents = JSON.parse(localStorage.getItem('events') || '[]');
        const today = new Date().toDateString();
        todayEvents = storedEvents.filter(event => {
            const eventDate = new Date(event.date).toDateString();
            return eventDate === today;
        });
    }
    renderTodaysAgenda();
}

function renderTodaysAgenda() {
    const agendaContainer = document.getElementById('agenda-events');
    
    if (todayEvents.length === 0) {
        agendaContainer.innerHTML = '<p class="no-events">No events scheduled for today</p>';
        return;
    }
    
    // Sort events by time
    const sortedEvents = todayEvents.sort((a, b) => {
        const timeA = a.time ? new Date(`2000-01-01 ${a.time}`) : new Date(0);
        const timeB = b.time ? new Date(`2000-01-01 ${b.time}`) : new Date(0);
        return timeA - timeB;
    });
    
    agendaContainer.innerHTML = sortedEvents.map((event, index) => {
        const timeDisplay = event.time ? formatTime(event.time) : 'All day';
        return `
            <div class="agenda-event">
                <div class="event-time">${timeDisplay}</div>
                <div class="event-details">
                    <div class="event-title">${event.title}</div>
                    ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
                </div>
                <button class="event-delete" onclick="deleteEvent(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
}

function formatTime(timeString) {
    try {
        const [hours, minutes] = timeString.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (error) {
        return timeString; // Return original if parsing fails
    }
}

function showAddEvent() {
    document.getElementById('event-input').style.display = 'block';
    document.getElementById('new-event-title').focus();
}

function hideAddEvent() {
    document.getElementById('event-input').style.display = 'none';
    document.getElementById('new-event-title').value = '';
    document.getElementById('new-event-time').value = '';
    document.getElementById('new-event-description').value = '';
}

async function addEvent() {
    const title = document.getElementById('new-event-title').value.trim();
    const time = document.getElementById('new-event-time').value;
    const description = document.getElementById('new-event-description').value.trim();
    
    if (!title) return;
    
    const newEvent = {
        title: title,
        time: time,
        description: description,
        date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
        created: new Date().toISOString()
    };
    
    try {
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEvent)
        });
        
        if (response.ok) {
            const result = await response.json();
            todayEvents.push({ ...newEvent, id: result.id });
        } else {
            // Fallback to localStorage
            const storedEvents = JSON.parse(localStorage.getItem('events') || '[]');
            storedEvents.push(newEvent);
            localStorage.setItem('events', JSON.stringify(storedEvents));
            todayEvents.push(newEvent);
        }
    } catch (error) {
        // Fallback to localStorage
        const storedEvents = JSON.parse(localStorage.getItem('events') || '[]');
        storedEvents.push(newEvent);
        localStorage.setItem('events', JSON.stringify(storedEvents));
        todayEvents.push(newEvent);
    }
    
    renderTodaysAgenda();
    hideAddEvent();
}

function deleteEvent(index) {
    const eventToDelete = todayEvents[index];
    
    // Remove from today's events array
    todayEvents.splice(index, 1);
    
    // Update storage
    saveEvents();
    renderTodaysAgenda();
}

async function saveEvents() {
    try {
        await fetch('/api/events', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: todayEvents })
        });
    } catch (error) {
        // Update localStorage as fallback
        const storedEvents = JSON.parse(localStorage.getItem('events') || '[]');
        const today = new Date().toDateString();
        
        // Remove today's events from stored events and add the current ones
        const otherDayEvents = storedEvents.filter(event => {
            const eventDate = new Date(event.date).toDateString();
            return eventDate !== today;
        });
        
        localStorage.setItem('events', JSON.stringify([...otherDayEvents, ...todayEvents]));
    }
}

function refreshAgenda() {
    loadTodaysEvents();
    displayTodaysDate();
}

// Tasks functionality
let tasks = [];

async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        if (response.ok) {
            const data = await response.json();
            tasks = data.tasks || [];
        } else {
            tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
        }
    } catch (error) {
        tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    }
    renderTasks();
}

function renderTasks() {
    const tasksList = document.getElementById('tasks-list');
    const completedCount = tasks.filter(task => task.completed).length;
    const totalCount = tasks.length;
    
    document.getElementById('completed-count').textContent = completedCount;
    document.getElementById('total-count').textContent = totalCount;
    
    if (tasks.length === 0) {
        tasksList.innerHTML = '<p class="no-events">No tasks yet</p>';
        return;
    }
    
    tasksList.innerHTML = tasks.map((task, index) => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
                   onchange="toggleTask(${index})">
            <span class="task-text">${task.text}</span>
            <button class="task-delete" onclick="deleteTask(${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function showAddTask() {
    document.getElementById('task-input').style.display = 'block';
    document.getElementById('new-task').focus();
}

function hideAddTask() {
    document.getElementById('task-input').style.display = 'none';
    document.getElementById('new-task').value = '';
}

async function addTask() {
    const input = document.getElementById('new-task');
    const text = input.value.trim();
    
    if (!text) return;
    
    const newTask = {
        text: text,
        completed: false,
        created: new Date().toISOString()
    };
    
    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTask)
        });
        
        if (response.ok) {
            const result = await response.json();
            tasks.push({ ...newTask, id: result.id });
        } else {
            tasks.push(newTask);
            localStorage.setItem('tasks', JSON.stringify(tasks));
        }
    } catch (error) {
        tasks.push(newTask);
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }
    
    renderTasks();
    hideAddTask();
}

function toggleTask(index) {
    tasks[index].completed = !tasks[index].completed;
    saveTasks();
    renderTasks();
}

function deleteTask(index) {
    tasks.splice(index, 1);
    saveTasks();
    renderTasks();
}

async function saveTasks() {
    try {
        await fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks })
        });
    } catch (error) {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }
}

// Quick Links functionality
function showAddLink() {
    document.getElementById('link-input-modal').style.display = 'block';
    document.getElementById('new-link-title').focus();
}

function hideAddLink() {
    document.getElementById('link-input-modal').style.display = 'none';
    document.getElementById('new-link-title').value = '';
    document.getElementById('new-link-url').value = '';
}

function addLink() {
    const title = document.getElementById('new-link-title').value.trim();
    const url = document.getElementById('new-link-url').value.trim();
    
    if (!title || !url) return;
    
    // Add to header quick links
    const quickLinksContainer = document.getElementById('header-quick-links');
    const addButton = quickLinksContainer.querySelector('.add-link');
    
    const linkElement = document.createElement('a');
    linkElement.className = 'quick-link';
    linkElement.href = url;
    linkElement.target = '_blank';
    linkElement.title = title;
    linkElement.innerHTML = `<i class="fas fa-link"></i>`;
    
    // Insert before the add button
    quickLinksContainer.insertBefore(linkElement, addButton);
    hideAddLink();
}

// Notes functionality
async function loadNotes() {
    try {
        const response = await fetch('/api/notes');
        if (response.ok) {
            const data = await response.json();
            document.getElementById('notes-content').value = data.notes || '';
        } else {
            const savedNotes = localStorage.getItem('notes') || '';
            document.getElementById('notes-content').value = savedNotes;
        }
    } catch (error) {
        const savedNotes = localStorage.getItem('notes') || '';
        document.getElementById('notes-content').value = savedNotes;
    }
}

async function saveNotes() {
    const notes = document.getElementById('notes-content').value;
    
    try {
        await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
        });
    } catch (error) {
        localStorage.setItem('notes', notes);
    }
}

// System info
async function loadSystemInfo() {
    try {
        const response = await fetch('/api/system');
        if (response.ok) {
            const data = await response.json();
            document.getElementById('services-count').textContent = `${data.services || 4}/4 running`;
            document.getElementById('system-uptime').textContent = data.uptime || 'Unknown';
        }
    } catch (error) {
        document.getElementById('services-count').textContent = 'Unavailable';
        document.getElementById('system-uptime').textContent = 'Unavailable';
    }
}

// Search functionality
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                if (isValidUrl(query)) {
                    window.open(query, '_blank');
                } else {
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
                }
                searchInput.value = '';
            }
        }
    });
}

function isValidUrl(string) {
    try {
        new URL(string.startsWith('http') ? string : 'https://' + string);
        return true;
    } catch (_) {
        return false;
    }
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search-input').focus();
    }
    
    // ESC to close inputs
    if (e.key === 'Escape') {
        hideAddTask();
        hideAddLink();
        hideAddEvent();
        hideNewReportDialog();
        document.getElementById('search-input').blur();
    }
});

// Task input enter key
document.getElementById('new-task').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addTask();
    }
});

// Logout functionality
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            window.location.href = '/login';
        } else {
            console.error('Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect to login page anyway
        window.location.href = '/login';
    }
}

// Check authentication status on page load
async function checkAuth() {
    try {
        const response = await fetch('/api/auth', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            window.location.href = '/login';
            return false;
        }
        
        const authData = await response.json();
        if (!authData.authenticated) {
            window.location.href = '/login';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login';
        return false;
    }
}

// Initialize auth check
checkAuth();
// GitHub Analysis functionality
async function loadGitHubReports() {
    const reportSelector = document.getElementById('report-selector');
    const githubContent = document.getElementById('github-content');

    try {
        // Fetch existing reports
        const response = await fetch('/api/github/reports');
        if (!response.ok) {
            throw new Error('Failed to load reports');
        }

        const data = await response.json();
        const reports = data.reports;

        if (reports.length > 0) {
            reportSelector.style.display = 'block';
            
            // Sort reports by generation date (newest first)
            const sortedReports = reports.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
            const latestReport = sortedReports[0];
            
            reportSelector.innerHTML = '<option value="">Select a report...</option>' +
                sortedReports.map(report => `<option value="${report.id}"${report.id === latestReport.id ? ' selected' : ''}>${report.repository} - ${report.period} - ${new Date(report.generatedAt).toLocaleString()}</option>`).join('');
            
            // Automatically load the latest report
            loadReport(latestReport.id);
        } else {
            reportSelector.style.display = 'none';
            githubContent.innerHTML = `
                <div class="github-initial-state">
                    <div class="initial-message">
                        <i class="fab fa-github" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
                        <h4>GitHub Repository Analysis</h4>
                        <p>Generate AI-powered reports to analyze repository activity, commits, and development trends.</p>
                        <button class="btn-primary" onclick="showNewReportDialog()">
                            <i class="fas fa-plus"></i> Generate Your First Report
                        </button>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading reports:', error);
        githubContent.innerHTML = `
            <div class="github-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h4>GitHub Analysis Unavailable</h4>
                <p>${error.message}</p>
                <p class="error-help">Configure GITHUB_TOKEN and OPENAI_API_KEY environment variables to enable this feature.</p>
            </div>
        `;
    }
}

function showNewReportDialog() {
    document.getElementById('new-report-modal').style.display = 'block';
}

function hideNewReportDialog() {
    document.getElementById('new-report-modal').style.display = 'none';
}

async function generateNewReport() {
    const githubContent = document.getElementById('github-content');
    const owner = document.getElementById('report-owner').value;
    const repo = document.getElementById('report-repo').value;
    const days = document.getElementById('report-days').value;

    if (!owner || !repo) {
        alert('Please fill in both the repository owner and name.');
        return;
    }

    hideNewReportDialog();

    try {
        githubContent.innerHTML = `
            <div class="github-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Generating GitHub analysis report...</span>
            </div>
        `;

        const response = await fetch('/api/github/reports/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner, repo, days })
        });

        if (!response.ok) {
            throw new Error('Failed to generate report');
        }

        const result = await response.json();
        alert('Report generated successfully!');
        loadGitHubReports(); // Reload reports to include the new one
    } catch (error) {
        console.error('Error generating report:', error);
        alert(`Error: ${error.message}`);
        githubContent.innerHTML = `
            <div class="github-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h4>GitHub Analysis Unavailable</h4>
                <p>${error.message}</p>
                <p class="error-help">Configure GITHUB_TOKEN and OPENAI_API_KEY environment variables to enable this feature.</p>
            </div>
        `;
    }
}

async function loadReport(reportId) {
    const githubContent = document.getElementById('github-content');
    
    // Show loading state
    githubContent.innerHTML = `
        <div class="github-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading report...</span>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/github/reports/${reportId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch report');
        }

        const reportData = await response.json();
        displayGitHubAnalysis(reportData);
    } catch (error) {
        console.error('Error fetching report:', error);
        githubContent.innerHTML = `
            <div class="github-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h4>Failed to Load Report</h4>
                <p>Error: ${error.message}</p>
            </div>
        `;
    }
}

async function onReportSelectionChange() {
    const reportSelector = document.getElementById('report-selector');
    const selectedReportId = reportSelector.value;
    if (!selectedReportId) return;
    
    loadReport(selectedReportId);
}

function displayGitHubAnalysis(data) {
    const githubContent = document.getElementById('github-content');
    const { summary, aiSummary, rawData, metadata } = data;
    
    githubContent.innerHTML = `
        <div class="github-analysis">
            <!-- Summary Stats -->
            <div class="github-stats">
                <div class="stat-item">
                    <i class="fas fa-code-branch"></i>
                    <span class="stat-number">${summary.totalCommits}</span>
                    <span class="stat-label">Commits</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-code-merge"></i>
                    <span class="stat-number">${summary.totalPrs}</span>
                    <span class="stat-label">PRs</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-users"></i>
                    <span class="stat-number">${summary.activeContributors}</span>
                    <span class="stat-label">Contributors</span>
                </div>
            </div>
            
            <!-- AI Summary -->
            <div class="github-ai-summary">
                <h4><i class="fas fa-brain"></i> AI Analysis</h4>
                <div class="ai-content">
                    ${formatMarkdown(aiSummary)}
                </div>
            </div>
            
            <!-- Recent Activity -->
            <div class="github-activity">
                <div class="activity-section">
                    <h4><i class="fas fa-history"></i> Recent Commits</h4>
                    <div class="commits-list">
                        ${rawData.commits.slice(0, 5).map(commit => `
                            <div class="commit-item">
                                <span class="commit-sha">${commit.sha}</span>
                                <span class="commit-message">${commit.message.split('\n')[0]}</span>
                                <span class="commit-author">${commit.author}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="activity-section">
                    <h4><i class="fas fa-users"></i> Top Contributors</h4>
                    <div class="contributors-list">
                        ${rawData.contributors.slice(0, 5).map(contributor => `
                            <div class="contributor-item">
                                <span class="contributor-name">${contributor.author}</span>
                                <span class="contributor-commits">${contributor.commitCount} commits</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <div class="github-footer">
                <small>Repository: ${metadata.repository} • Period: ${metadata.analyzedPeriod} • Generated: ${new Date(metadata.generatedAt).toLocaleString()}</small>
            </div>
        </div>
    `;
}

function displayGitHubError(message) {
    const githubContent = document.getElementById('github-content');
    githubContent.innerHTML = `
        <div class="github-error">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>GitHub Analysis Unavailable</h4>
            <p>${message}</p>
            <p class="error-help">Configure GITHUB_TOKEN and OPENAI_API_KEY environment variables to enable this feature.</p>
        </div>
    `;
}

function formatMarkdown(text) {
    if (!text) return '';
    
    // Simple markdown formatting
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^## (.*$)/gim, '<h3>$1</h3>')
        .replace(/^### (.*$)/gim, '<h4>$1</h4>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/<\/ul>\s*<ul>/g, '')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<[h3-6]|<ul|<\/p><p>)(.*$)/gim, '<p>$1</p>')
        .replace(/^<p><\/p>$/gm, '')
        .trim();
}
