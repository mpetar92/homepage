const { Octokit } = require("@octokit/rest");
const OpenAI = require("openai");

class GitHubAnalyzer {
  constructor() {
    // Initialize GitHub API client
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Default repository configuration
    this.defaultRepo = {
      owner: process.env.GITHUB_OWNER || 'everli',
      repo: process.env.GITHUB_REPO || 'ev3rli'
    };
  }

  /**
   * Fetch recent commits from GitHub across all branches
   */
  async fetchRecentCommits(owner = this.defaultRepo.owner, repo = this.defaultRepo.repo, days = 7) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      // First, get all branches to fetch commits from each one
      const { data: branches } = await this.octokit.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      });

      console.log(`Found ${branches.length} branches to analyze for commits`);
      
      // Fetch commits from all branches in parallel
      const allCommitsPromises = branches.map(async (branch) => {
        try {
          const { data: branchCommits } = await this.octokit.repos.listCommits({
            owner,
            repo,
            sha: branch.name, // Specify the branch
            since,
            per_page: 100,
          });
          
          return branchCommits.map(commit => ({
            sha: commit.sha.substring(0, 8),
            message: commit.commit.message,
            author: commit.commit.author.name,
            email: commit.commit.author.email,
            date: commit.commit.author.date,
            url: commit.html_url,
            branch: branch.name // Add branch info
          }));
        } catch (branchError) {
          console.warn(`Could not fetch commits from branch ${branch.name}:`, branchError.message);
          return [];
        }
      });

      const allBranchCommits = await Promise.all(allCommitsPromises);
      
      // Flatten and deduplicate commits by SHA
      const allCommits = allBranchCommits.flat();
      const uniqueCommits = [];
      const seenShas = new Set();
      
      for (const commit of allCommits) {
        if (!seenShas.has(commit.sha)) {
          seenShas.add(commit.sha);
          uniqueCommits.push(commit);
        }
      }
      
      // Sort by date (most recent first)
      uniqueCommits.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      console.log(`Found ${uniqueCommits.length} unique commits across all branches`);
      
      return uniqueCommits;
    } catch (error) {
      console.error('Error fetching commits:', error);
      throw new Error('Failed to fetch commits from GitHub');
    }
  }

  /**
   * Fetch recent pull requests
   */
  async fetchRecentPullRequests(owner = this.defaultRepo.owner, repo = this.defaultRepo.repo, days = 7) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      // Get recently updated PRs
      const { data: prs } = await this.octokit.pulls.list({
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 50,
      });

      // Filter PRs updated in the last week
      const recentPrs = prs.filter(pr => new Date(pr.updated_at) >= new Date(since));

      return recentPrs.map(pr => ({
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        state: pr.state,
        merged: pr.merged_at !== null,
        created: pr.created_at,
        updated: pr.updated_at,
        merged_at: pr.merged_at,
        url: pr.html_url,
        labels: pr.labels.map(label => label.name)
      }));
    } catch (error) {
      console.error('Error fetching pull requests:', error);
      throw new Error('Failed to fetch pull requests from GitHub');
    }
  }

  /**
   * Fetch repository branches
   */
  async fetchBranches(owner = this.defaultRepo.owner, repo = this.defaultRepo.repo) {
    try {
      const { data: branches } = await this.octokit.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      });

      return branches.map(branch => ({
        name: branch.name,
        sha: branch.commit.sha.substring(0, 8),
        protected: branch.protected,
        url: branch.commit.url
      }));
    } catch (error) {
      console.error('Error fetching branches:', error);
      throw new Error('Failed to fetch branches from GitHub');
    }
  }

  /**
   * Fetch contributors statistics
   */
  async fetchContributors(owner = this.defaultRepo.owner, repo = this.defaultRepo.repo) {
    try {
      const { data: contributors } = await this.octokit.repos.listContributors({
        owner,
        repo,
        per_page: 100,
      });

      return contributors.map(contributor => ({
        login: contributor.login,
        contributions: contributor.contributions,
        avatar_url: contributor.avatar_url,
        html_url: contributor.html_url
      }));
    } catch (error) {
      console.error('Error fetching contributors:', error);
      throw new Error('Failed to fetch contributors from GitHub');
    }
  }

  /**
   * Process and analyze the fetched data
   */
  processData(commits, prs, branches, contributors) {
    // Group commits by author
    const commitsByAuthor = {};
    commits.forEach(commit => {
      if (!commitsByAuthor[commit.author]) {
        commitsByAuthor[commit.author] = [];
      }
      commitsByAuthor[commit.author].push(commit);
    });

    // Group commits by branch (now that we have branch info)
    const commitsByBranch = {};
    commits.forEach(commit => {
      if (commit.branch) {
        if (!commitsByBranch[commit.branch]) {
          commitsByBranch[commit.branch] = [];
        }
        commitsByBranch[commit.branch].push(commit);
      }
    });

    // Find most active branches by commit count
    const activeBranches = Object.entries(commitsByBranch)
      .map(([branch, branchCommits]) => ({
        name: branch,
        commitCount: branchCommits.length,
        latestCommit: branchCommits[0]?.date,
        contributors: [...new Set(branchCommits.map(c => c.author))].length
      }))
      .sort((a, b) => b.commitCount - a.commitCount)
      .slice(0, 10);

    // Analyze PR patterns
    const mergedPrs = prs.filter(pr => pr.merged);
    const openPrs = prs.filter(pr => pr.state === 'open');
    
    // Extract ticket patterns (MA-123, SP-456, etc.)
    const ticketPattern = /([A-Z]{2,}-\d+)/g;
    const tickets = new Set();
    
    [...commits, ...prs].forEach(item => {
      const text = item.message || item.title || '';
      const matches = text.match(ticketPattern);
      if (matches) {
        matches.forEach(ticket => tickets.add(ticket));
      }
    });

    // Identify active feature branches
    const featureBranches = branches.filter(branch => 
      branch.name.startsWith('feat/') || 
      branch.name.startsWith('feature/') ||
      branch.name.startsWith('env/') ||
      /^[A-Z]{2,}-\d+/.test(branch.name) ||
      branch.name.includes('ma-') ||
      branch.name.includes('sp-')
    );

    // Top contributors by recent activity
    const topContributors = Object.entries(commitsByAuthor)
      .map(([author, authorCommits]) => ({
        author,
        commitCount: authorCommits.length,
        latestCommit: authorCommits[0]?.date,
        branches: [...new Set(authorCommits.map(c => c.branch).filter(Boolean))].length
      }))
      .sort((a, b) => b.commitCount - a.commitCount)
      .slice(0, 10);

    return {
      summary: {
        totalCommits: commits.length,
        totalPrs: prs.length,
        mergedPrs: mergedPrs.length,
        openPrs: openPrs.length,
        totalBranches: branches.length,
        featureBranches: featureBranches.length,
        activeBranches: activeBranches.length,
        uniqueTickets: tickets.size,
        activeContributors: topContributors.length
      },
      commits: commits.slice(0, 20), // Latest 20 commits
      pullRequests: prs.slice(0, 10), // Latest 10 PRs
      branches: featureBranches.slice(0, 15), // Top 15 feature branches
      activeBranches: activeBranches, // Most active branches by commit count
      contributors: topContributors,
      tickets: Array.from(tickets).slice(0, 20),
      commitsByAuthor,
      commitsByBranch
    };
  }

  /**
   * Generate AI-powered summary using OpenAI
   */
  async generateSummary(analysisData) {
    try {
      const { summary, commits, pullRequests, contributors, tickets, activeBranches } = analysisData;
      
      const prompt = `
Analyze the following GitHub repository activity from the past week and provide a comprehensive development summary:

## Repository Activity Summary:
- Total Commits: ${summary.totalCommits} (across ALL branches)
- Total Pull Requests: ${summary.totalPrs} (${summary.mergedPrs} merged, ${summary.openPrs} open)
- Total Branches: ${summary.totalBranches}
- Feature Branches: ${summary.featureBranches}
- Most Active Branches: ${summary.activeBranches}
- Unique Tickets: ${summary.uniqueTickets}
- Active Contributors: ${summary.activeContributors}

## Recent Commits (from all branches):
${commits.slice(0, 10).map(c => `- ${c.sha}: ${c.message.split('\n')[0]} (${c.author}) [${c.branch || 'unknown branch'}]`).join('\n')}

## Recent Pull Requests:
${pullRequests.slice(0, 5).map(pr => `- #${pr.number}: ${pr.title} [${pr.state}] by ${pr.author}`).join('\n')}

## Most Active Branches:
${(activeBranches || []).slice(0, 5).map(b => `- ${b.name}: ${b.commitCount} commits, ${b.contributors} contributors`).join('\n')}

## Top Contributors:
${contributors.slice(0, 5).map(c => `- ${c.author}: ${c.commitCount} commits across ${c.branches || 0} branches`).join('\n')}

## Active Tickets:
${tickets.slice(0, 10).join(', ')}

Please provide a structured markdown report covering:
1. **Executive Summary** - Brief overview of development activity across all branches
2. **Major Features & Improvements** - Key developments based on commits and PRs from all branches
3. **Branch Activity** - Analysis of which branches are most active and development patterns
4. **Team Activity** - Contributor insights and collaboration patterns across branches
5. **Technical Focus** - Technologies, patterns, and areas of development
6. **Business Impact** - Potential business value from recent changes
7. **Development Trends** - Patterns or notable observations from cross-branch analysis

Keep the tone professional yet engaging, suitable for both technical and business stakeholders.
`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a senior software engineering manager providing insights on development activity. Focus on actionable insights and business value from cross-branch analysis."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Error generating AI summary:', error);
      throw new Error('Failed to generate AI summary');
    }
  }

  /**
   * Main analysis function
   */
  async generateRepositoryReport(owner, repo, days = 7) {
    try {
      console.log(`Analyzing repository: ${owner}/${repo} for the past ${days} days...`);

      // Fetch data in parallel for better performance
      const [commits, prs, branches, contributors] = await Promise.all([
        this.fetchRecentCommits(owner, repo, days),
        this.fetchRecentPullRequests(owner, repo, days),
        this.fetchBranches(owner, repo),
        this.fetchContributors(owner, repo)
      ]);

      console.log(`Fetched: ${commits.length} commits, ${prs.length} PRs, ${branches.length} branches`);

      // Process the data
      const analysisData = this.processData(commits, prs, branches, contributors);

      // Generate AI summary
      const aiSummary = await this.generateSummary(analysisData);

      return {
        metadata: {
          repository: `${owner}/${repo}`,
          analyzedPeriod: `${days} days`,
          generatedAt: new Date().toISOString(),
          dataFreshness: 'real-time'
        },
        summary: analysisData.summary,
        aiSummary,
        rawData: {
          commits: analysisData.commits,
          pullRequests: analysisData.pullRequests,
          branches: analysisData.branches,
          contributors: analysisData.contributors,
          tickets: analysisData.tickets
        }
      };
    } catch (error) {
      console.error('Error generating repository report:', error);
      throw error;
    }
  }

  /**
   * Generate a quick status update
   */
  async getQuickStatus(owner, repo) {
    try {
      const commits = await this.fetchRecentCommits(owner, repo, 1);
      const prs = await this.fetchRecentPullRequests(owner, repo, 1);
      
      return {
        lastCommit: commits[0] || null,
        recentActivity: {
          commits: commits.length,
          prs: prs.length
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting quick status:', error);
      throw error;
    }
  }
}

module.exports = GitHubAnalyzer;
