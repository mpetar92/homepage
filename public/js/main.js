// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    hamburger.addEventListener('click', function() {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', function() {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }));

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Animated counters
    function animateCounter(element) {
        const target = parseInt(element.getAttribute('data-target'));
        const increment = target / 100;
        let current = 0;
        
        const timer = setInterval(() => {
            current += increment;
            element.textContent = Math.floor(current);
            
            if (current >= target) {
                element.textContent = target;
                clearInterval(timer);
            }
        }, 20);
    }

    // Intersection Observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (entry.target.classList.contains('stat-number')) {
                    animateCounter(entry.target);
                }
                entry.target.classList.add('animate');
            }
        });
    }, observerOptions);

    // Observe stat numbers
    document.querySelectorAll('.stat-number').forEach(stat => {
        observer.observe(stat);
    });

    // Load skills data
    loadSkills();
    
    // Load projects data
    loadProjects();

    // Contact form handling
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactForm);
    }

    // Load more projects button
    const loadMoreBtn = document.getElementById('load-more-projects');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreProjects);
    }
});

// Load skills from API or static data
async function loadSkills() {
    const skillsContainer = document.getElementById('skills-container');
    const skills = [
        { name: 'JavaScript', icon: 'fab fa-js-square' },
        { name: 'Node.js', icon: 'fab fa-node-js' },
        { name: 'React', icon: 'fab fa-react' },
        { name: 'Docker', icon: 'fab fa-docker' },
        { name: 'MongoDB', icon: 'fas fa-database' },
        { name: 'Git', icon: 'fab fa-git-alt' }
    ];

    skillsContainer.innerHTML = skills.map(skill => `
        <div class="skill-item">
            <i class="${skill.icon}"></i>
            <div>${skill.name}</div>
        </div>
    `).join('');
}

// Load projects from API
async function loadProjects() {
    const projectsContainer = document.getElementById('projects-container');
    
    try {
        // Try to load from API first
        const response = await fetch('/api/items');
        const data = await response.json();
        
        let projects = data.items || [];
        
        // If no projects in database, use default projects
        if (projects.length === 0) {
            projects = [
                {
                    _id: '1',
                    name: 'Personal Homepage',
                    description: 'Modern responsive homepage built with Fastify, MongoDB, and Docker. Features automatic SSL certificates and a REST API.',
                    technologies: ['Fastify', 'MongoDB', 'Docker', 'Traefik'],
                    github: 'https://github.com/mpetar92/homepage',
                    demo: 'https://app.srv916746.hstgr.cloud'
                },
                {
                    _id: '2',
                    name: 'Workflow Automation',
                    description: 'n8n-powered automation platform for streamlining business processes and integrating various services.',
                    technologies: ['n8n', 'Node.js', 'Docker', 'API Integration'],
                    github: '#',
                    demo: 'https://n8n.srv916746.hstgr.cloud'
                },
                {
                    _id: '3',
                    name: 'Infrastructure Setup',
                    description: 'Automated server infrastructure with Traefik reverse proxy, SSL certificates, and container orchestration.',
                    technologies: ['Traefik', 'Docker Compose', 'SSL/HTTPS', 'Ubuntu'],
                    github: '#',
                    demo: '#'
                }
            ];
        }

        projectsContainer.innerHTML = projects.map(project => `
            <div class="project-card">
                <div class="project-image">
                    <i class="fas fa-code"></i>
                </div>
                <div class="project-content">
                    <h3 class="project-title">${project.name}</h3>
                    <p class="project-description">${project.description}</p>
                    <div class="project-tech">
                        ${project.technologies ? project.technologies.map(tech => 
                            `<span class="tech-tag">${tech}</span>`
                        ).join('') : ''}
                    </div>
                    <div class="project-links">
                        ${project.github && project.github !== '#' ? 
                            `<a href="${project.github}" class="project-link" target="_blank">
                                <i class="fab fa-github"></i> Code
                            </a>` : ''
                        }
                        ${project.demo && project.demo !== '#' ? 
                            `<a href="${project.demo}" class="project-link" target="_blank">
                                <i class="fas fa-external-link-alt"></i> Demo
                            </a>` : ''
                        }
                    </div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading projects:', error);
        // Fallback to default projects
        loadProjects();
    }
}

// Handle contact form submission
async function handleContactForm(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        subject: formData.get('subject'),
        message: formData.get('message')
    };

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            alert('Thank you for your message! I\'ll get back to you soon.');
            e.target.reset();
        } else {
            throw new Error('Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Sorry, there was an error sending your message. Please try again.');
    }
}

// Load more projects
async function loadMoreProjects() {
    // This would typically load more projects from the API
    console.log('Loading more projects...');
}

// Navbar scroll effect
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 100) {
        navbar.style.backgroundColor = 'rgba(255, 255, 255, 0.98)';
    } else {
        navbar.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    }
});
