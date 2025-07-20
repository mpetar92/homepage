// JavaScript for GitHub Analyses functionality

// Function to go back to the dashboard
globalThis.goToDashboard = function() {
    window.location.href = '/dashboard';
}

// Function to load reports
globalThis.loadReports = async function() {
    const reportsList = document.getElementById('reports-list');
    reportsList.innerHTML = "";

    try {
        const response = await fetch('/api/github/reports');
        if (!response.ok) {
            throw new Error('Failed to load reports');
        }

        const data = await response.json();
        const reports = data.reports;

        reports.forEach(report => {
            const reportItem = document.createElement('div');
            reportItem.classList.add('report-item');
            reportItem.innerHTML = `
                <div class="report-content" onclick="viewReport(${JSON.stringify(report).replace(/"/g, '&quot;')})">
                    <div class="repo-name"><i class="fab fa-github"></i> ${report.repository}</div>
                    <div class="report-meta">
                        <div class="report-date"><i class="far fa-calendar"></i> ${new Date(report.generatedAt).toLocaleDateString()}</div>
                        <div class="report-period"><i class="far fa-clock"></i> ${report.period}</div>
                    </div>
                    <div class="report-summary">
                        <div class="summary-item">
                            <i class="fas fa-code-branch"></i>
                            <span>${report.summary.totalCommits}</span>
                        </div>
                        <div class="summary-item">
                            <i class="fas fa-code-merge"></i>
                            <span>${report.summary.totalPrs}</span>
                        </div>
                        <div class="summary-item">
                            <i class="fas fa-users"></i>
                            <span>${report.summary.activeContributors}</span>
                        </div>
                    </div>
                </div>
                <div class="report-actions">
                    <button class="delete-btn" onclick="deleteReport('${report.id}', '${report.repository}')" title="Delete Report">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            reportsList.appendChild(reportItem);
        });

        document.getElementById('report-count').innerText = `${reports.length} reports`;
    } catch (error) {
        console.error('Error loading reports:', error);
    }
}

// Function to view a report
globalThis.viewReport = async function(report) {
    console.log(`Viewing report for ${report.repository}`);
    const contentArea = document.getElementById('content-area');
    
    // Show loading state
    contentArea.innerHTML = `
        <div class="github-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading report...</span>
        </div>
    `;

    try {
        const response = await fetch(`/api/github/reports/${report.id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch report');
        }

        const reportData = await response.json();

        contentArea.innerHTML = `
            <div class="report-header">
                <h2>${reportData.metadata.repository} Analysis</h2>
            </div>
            <div class="report-body">
                ${renderCollapsibleSection('AI Summary', formatMarkdown(reportData.aiSummary))}
                ${renderCollapsibleSection('Summary', `
                    <ul>
                        <li>Total Commits: ${reportData.summary.totalCommits}</li>
                        <li>Total PRs: ${reportData.summary.totalPrs}</li>
                        <li>Merged PRs: ${reportData.summary.mergedPrs}</li>
                        <li>Open PRs: ${reportData.summary.openPrs}</li>
                        <li>Total Branches: ${reportData.summary.totalBranches}</li>
                        <li>Feature Branches: ${reportData.summary.featureBranches}</li>
                        <li>Active Contributors: ${reportData.summary.activeContributors}</li>
                        <li>Unique Tickets: ${reportData.summary.uniqueTickets}</li>
                    </ul>`)}
                ${renderCollapsibleSection('Commits', `
                    <ul>
                        ${reportData.rawData.commits.slice(0, 5).map(commit => `
                            <li>
                                <a href="${commit.url}" target="_blank">${commit.sha}</a>: ${commit.message.split('\n')[0]} by ${commit.author} on ${new Date(commit.date).toLocaleDateString()}
                            </li>`).join('')}
                    </ul>`)}
                ${renderCollapsibleSection('Pull Requests', `
                    <ul>
                        ${reportData.rawData.pullRequests.slice(0, 5).map(pr => `
                            <li>
                                <a href="${pr.url}" target="_blank">#${pr.number} ${pr.title}</a> by ${pr.author} - ${pr.state.toUpperCase()}
                            </li>`).join('')}
                    </ul>`)}
                ${renderCollapsibleSection('Contributors', `
                    <ul>
                        ${reportData.rawData.contributors.slice(0, 5).map(contributor => `
                            <li>${contributor.author}: ${contributor.commitCount} commits, active on ${contributor.branches} branches
                            </li>`).join('')}
                    </ul>`)}
                ${renderCollapsibleSection('Branches', `
                    <ul>
                        ${reportData.rawData.branches.slice(0, 5).map(branch => `
                            <li>
                                <a href="${branch.url}" target="_blank">${branch.name}</a>: latest commit ${branch.sha}
                            </li>`).join('')}
                    </ul>`)}
                ${renderCollapsibleSection('Tickets', `<p>${reportData.rawData.tickets.join(', ')}</p>`) }
            </div>
        `;
        
        // Add collapsible functionality after content is rendered
        setTimeout(() => {
            document.querySelectorAll('.collapsible-header').forEach(header => {
                header.addEventListener('click', function() {
                    this.classList.toggle('active');
                    const content = this.nextElementSibling;
                    if (content.style.maxHeight) {
                        content.style.maxHeight = null;
                    } else {
                        content.style.maxHeight = content.scrollHeight + "px";
                    }
                });
            });
        }, 100);
    } catch (error) {
        console.error('Error fetching report:', error);
        contentArea.innerHTML = `<div class="github-error">Failed to load report.</div>`;
    }
}

function formatMarkdown(text) {
    if (!text) return '';
    return text.replace(/## (.*$)/gim, '<h3>$1</h3>')
        .replace(/\n/g, '<br/>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

function renderCollapsibleSection(title, content) {
    return `
        <div class="collapsible-section">
            <div class="collapsible-header">
                <span class="section-title">${title}</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="collapsible-content">${content}</div>
        </div>`;
}

// Function to show the New Report Dialog
globalThis.showNewReportDialog = function() {
    const modal = document.getElementById('new-report-modal');
    modal.style.display = 'block';
}

// Function to hide the New Report Dialog
globalThis.hideNewReportDialog = function() {
    const modal = document.getElementById('new-report-modal');
    modal.style.display = 'none';
}

// Function to generate a new report
globalThis.generateNewReport = async function() {
    const owner = document.getElementById('report-owner').value;
    const repoName = document.getElementById('report-repo').value;
    const days = document.getElementById('report-days').value;

    if (!owner || !repoName) {
        alert('Please fill in all fields.');
        return;
    }

    // Show loading simulation
    const githubContent = document.getElementById('content-area');
    githubContent.innerHTML = `
        <div class="github-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Generating GitHub analysis report...</span>
        </div>
    `;

    try {
        const response = await fetch('/api/github/reports/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner, repo: repoName, days })
        });

        if (!response.ok) {
            throw new Error('Failed to generate report');
        }

        alert('Report generated successfully!');
        loadReports(); // Reload reports after generating
        hideNewReportDialog();
    } catch (error) {
        console.error('Error generating report:', error);
        alert(`Error: ${error.message}`);
    }
}

// Function to delete a report
globalThis.deleteReport = async function(reportId, repositoryName) {
    // Show confirmation dialog
    const confirmed = confirm(`Are you sure you want to delete the analysis report for ${repositoryName}?\n\nThis action cannot be undone.`);
    
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/github/reports/${reportId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete report');
        }

        // Show success message
        alert(`Report for ${repositoryName} has been deleted successfully.`);
        
        // Reload reports list
        loadReports();
        
        // Clear the content area if the deleted report was currently displayed
        const contentArea = document.getElementById('content-area');
        if (contentArea.innerHTML.includes(repositoryName)) {
            contentArea.innerHTML = `
                <div class="welcome-state">
                    <div class="welcome-message">
                        <i class="fab fa-github" style="font-size: 4rem; color: var(--text-muted); margin-bottom: 2rem;"></i>
                        <h2>Report Deleted</h2>
                        <p>The analysis report has been deleted successfully. Select another report from the sidebar or generate a new one.</p>
                        <div class="welcome-actions">
                            <button class="btn-primary" onclick="showNewReportDialog()">
                                <i class="fas fa-plus"></i> Generate New Report
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error deleting report:', error);
        alert(`Failed to delete report: ${error.message}`);
    }
}

// Load reports initially when page loads
window.onload = loadReports;
