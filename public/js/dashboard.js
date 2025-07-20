// Dashboard initialization
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    loadWeather();
    loadSystemInfo();
    loadTasks();
    loadNotes();
    initializeCalendar();
    setupSearch();
    
    // Update time every second
    setInterval(updateTime, 1000);
    updateTime();
    
    // Auto-save notes
    document.getElementById('notes-content').addEventListener('input', debounce(saveNotes, 1000));
});

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

// Weather functionality
async function loadWeather() {
    try {
        // First get user's location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                try {
                    // Using OpenWeatherMap API (you'll need to get a free API key)
                    // For demo, using mock data
                    displayWeather({
                        location: 'Belgrade, RS',
                        temperature: Math.round(Math.random() * 30 + 5),
                        description: 'partly cloudy',
                        feelsLike: Math.round(Math.random() * 30 + 5),
                        humidity: Math.round(Math.random() * 40 + 40),
                        windSpeed: Math.round(Math.random() * 20 + 5),
                        icon: 'fa-cloud-sun'
                    });
                } catch (error) {
                    displayWeatherError();
                }
            }, () => {
                // Location denied, use default
                displayWeather({
                    location: 'Location unavailable',
                    temperature: '--',
                    description: 'Enable location for weather',
                    feelsLike: '--',
                    humidity: '--',
                    windSpeed: '--',
                    icon: 'fa-cloud'
                });
            });
        } else {
            displayWeatherError();
        }
    } catch (error) {
        displayWeatherError();
    }
}

function displayWeather(weather) {
    document.getElementById('temperature').textContent = weather.temperature + '°';
    document.getElementById('location').textContent = weather.location;
    document.getElementById('weather-description').textContent = weather.description;
    document.getElementById('feels-like').textContent = weather.feelsLike + '°';
    document.getElementById('humidity').textContent = weather.humidity + '%';
    document.getElementById('wind-speed').textContent = weather.windSpeed + ' km/h';
    
    const iconElement = document.getElementById('weather-icon').querySelector('i');
    iconElement.className = `fas ${weather.icon}`;
}

function displayWeatherError() {
    document.getElementById('weather-content').innerHTML = `
        <div class="text-center text-muted">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Weather unavailable</p>
        </div>
    `;
}

// Calendar functionality
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

function initializeCalendar() {
    generateCalendar();
}

function generateCalendar() {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    
    document.getElementById('calendar-month').textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    
    let calendarHTML = '';
    
    // Day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        calendarHTML += `<div class="calendar-day calendar-header">${day}</div>`;
    });
    
    // Previous month's days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        calendarHTML += `<div class="calendar-day other-month">${day}</div>`;
    }
    
    // Current month's days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = (currentYear === today.getFullYear() && 
                        currentMonth === today.getMonth() && 
                        day === today.getDate());
        const todayClass = isToday ? 'today' : '';
        calendarHTML += `<div class="calendar-day ${todayClass}">${day}</div>`;
    }
    
    // Next month's days
    const totalCells = calendarHTML.split('calendar-day').length - 1;
    const remainingCells = 42 - totalCells; // 6 rows × 7 days
    for (let day = 1; day <= remainingCells; day++) {
        calendarHTML += `<div class="calendar-day other-month">${day}</div>`;
    }
    
    document.getElementById('calendar').innerHTML = calendarHTML;
}

function changeMonth(direction) {
    currentMonth += direction;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    generateCalendar();
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
    document.getElementById('link-input').style.display = 'block';
    document.getElementById('new-link-title').focus();
}

function hideAddLink() {
    document.getElementById('link-input').style.display = 'none';
    document.getElementById('new-link-title').value = '';
    document.getElementById('new-link-url').value = '';
}

function addLink() {
    const title = document.getElementById('new-link-title').value.trim();
    const url = document.getElementById('new-link-url').value.trim();
    
    if (!title || !url) return;
    
    const linksGrid = document.getElementById('links-grid');
    const linkElement = document.createElement('a');
    linkElement.className = 'link-item';
    linkElement.href = url;
    linkElement.target = '_blank';
    linkElement.innerHTML = `
        <i class="fas fa-link"></i>
        <span>${title}</span>
    `;
    
    linksGrid.appendChild(linkElement);
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
