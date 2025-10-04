import { supabase } from "../../supabase/config.js";

class ChatApp {
    constructor() {
        this.currentUser = null;
        this.chatPartner = null;
        this.userRole = null;
        this.hireId = new URLSearchParams(window.location.search).get("hire");
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // Navigation elements
        this.sidebar = document.getElementById('sidebar');
        this.navMenu = document.getElementById('navMenu');
        this.menuToggle = document.getElementById('menuToggle');
        this.closeSidebar = document.getElementById('closeSidebar');
        
        // Header elements
        this.pageTitle = document.getElementById('pageTitle');
        this.pageSubtitle = document.getElementById('pageSubtitle');
        
        // Chat elements
        this.partnerName = document.getElementById('partnerName');
        this.partnerRole = document.getElementById('partnerRole');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messages = document.getElementById('messages');
        this.messageForm = document.getElementById('messageForm');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
    }

    bindEvents() {
        // Navigation events
        this.menuToggle?.addEventListener('click', () => this.toggleSidebar());
        this.closeSidebar?.addEventListener('click', () => this.closeSidebarMenu());
        
        // Message form events
        this.messageForm?.addEventListener('submit', (e) => this.handleMessageSubmit(e));
        
        // Click outside sidebar to close
        document.addEventListener('click', (e) => this.handleOutsideClick(e));
        
        // Window resize
        window.addEventListener('resize', () => this.handleResize());
    }

async init() {
    if (!this.hireId) {
        this.showError("Invalid chat link. Missing hire ID.");
        return;
    }

    try {
        // Get current user
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) throw new Error("Authentication required");
        
        this.currentUser = user;
        
        // Initialize theme toggle FIRST
        this.initThemeToggle();
        
        // Determine user role
        await this.determineUserRole();
        
        // Setup navigation with known role
        await this.setupNavigation();
        await this.loadHireDetails();
        await this.loadMessages();
        this.setupRealtimeSubscription();
        
    } catch (error) {
        this.showError(error.message || "Failed to initialize chat");
    }
}

    async determineUserRole() {
        if (!this.currentUser) return;

        try {
            // Check if user exists in clients or freelancers table
            const { data: clientData } = await supabase
                .from('users')
                .select('id')
                .eq('id', this.currentUser.id)
                .eq('role', 'client')
                .single();

            if (clientData) {
                this.userRole = 'client';
                return;
            }

            const { data: freelancerData } = await supabase
                .from('users')
                .select('id')
                .eq('id', this.currentUser.id)
                .eq('role', 'freelancer')
                .single();

            if (freelancerData) {
                this.userRole = 'freelancer';
                return;
            }

            // Fallback: check user metadata or app_metadata
            this.userRole = this.currentUser.user_metadata?.role || 
                           this.currentUser.app_metadata?.role || 
                           'client'; // default to client

        } catch (error) {
            console.error('Error determining user role:', error);
            this.userRole = 'client'; // default fallback
        }
    }

    async setupNavigation() {
        if (!this.userRole) {
            console.error('User role not determined');
            return;
        }

        const navItems = this.userRole === 'client' ? this.getClientNav() : this.getFreelancerNav();
        if (this.navMenu) {
            this.navMenu.innerHTML = navItems;
        }

        this.updateLayout();
    }

    getClientNav() {
        return `
            <li class="nav-item">
                <a href="../client/dashboard.html" class="nav-link">
                    <span class="nav-icon">📊</span>
                    <span>Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/matches.html" class="nav-link">
                    <span class="nav-icon">🔍</span>
                    <span>Matches</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/hires.html" class="nav-link">
                    <span class="nav-icon">👥</span>
                    <span>My Hires</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/contracts.html" class="nav-link">
                    <span class="nav-icon">📝</span>
                    <span>Contracts</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/messages.html" class="nav-link active">
                    <span class="nav-icon">💬</span>
                    <span>Messages</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../auth/logout.html" class="nav-link logout">
                    <span class="nav-icon">🚪</span>
                    <span>Logout</span>
                </a>
            </li>
        `;
    }

    getFreelancerNav() {
        return `
            <li class="nav-item">
                <a href="../freelancer/dashboard.html" class="nav-link">
                    <span class="nav-icon">📊</span>
                    <span>Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/portfolio.html" class="nav-link">
                    <span class="nav-icon">💼</span>
                    <span>Portfolio</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/jobs.html" class="nav-link">
                    <span class="nav-icon">🔍</span>
                    <span>Jobs</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/hires.html" class="nav-link">
                    <span class="nav-icon">👥</span>
                    <span>Hires</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/messages.html" class="nav-link active">
                    <span class="nav-icon">💬</span>
                    <span>Messages</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../auth/logout.html" class="nav-link logout">
                    <span class="nav-icon">🚪</span>
                    <span>Logout</span>
                </a>
            </li>
        `;
    }

    async loadHireDetails() {
        const { data: hire, error } = await supabase
            .from("hires")
            .select(`
                jobs(title),
                client:users!hires_client_id_fkey(full_name, id),
                freelancer:users!hires_freelancer_id_fkey(full_name, id)
            `)
            .eq("id", this.hireId)
            .single();

        if (error || !hire) throw new Error("Chat not found");

        // Verify user has access to this chat
        if (this.currentUser.id === hire.client.id) {
            this.chatPartner = hire.freelancer;
            // Confirm role matches
            if (this.userRole !== 'client') {
                console.warn('Role mismatch: User is in chat as client but role was determined as', this.userRole);
            }
        } else if (this.currentUser.id === hire.freelancer.id) {
            this.chatPartner = hire.client;
            if (this.userRole !== 'freelancer') {
                console.warn('Role mismatch: User is in chat as freelancer but role was determined as', this.userRole);
            }
        } else {
            throw new Error("Access denied");
        }

        this.updateChatHeader(hire);
        await this.loadPartnerAvatar();

    }

    updateChatHeader(hire) {
        if (this.pageTitle) this.pageTitle.textContent = `Chat with ${this.chatPartner.full_name}`;
        if (this.pageSubtitle) this.pageSubtitle.textContent = hire.jobs.title;
        if (this.partnerName) this.partnerName.textContent = this.chatPartner.full_name;
        if (this.partnerRole) {
            this.partnerRole.textContent = `${this.userRole === 'client' ? 'Freelancer' : 'Client'} • ${hire.jobs.title}`;
        }
    }

    async loadMessages() {
        const { data: messages, error } = await supabase
            .from("messages")
            .select("*")
            .eq("hire_id", this.hireId)
            .order("created_at", { ascending: true });

        if (error) throw new Error("Failed to load messages");

        if (this.messages) {
            this.messages.innerHTML = '';

            if (!messages || messages.length === 0) {
                this.showEmptyState();
                return;
            }

            messages.forEach(message => this.appendMessage(message));
            this.scrollToBottom();
        }
    }

    appendMessage(message) {
        if (!this.messages) return;

        const emptyState = this.messages.querySelector('.empty-chat');
        if (emptyState) emptyState.remove();

        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.sender_id === this.currentUser.id ? 'sent' : 'received'}`;
        
        const time = new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageEl.innerHTML = `
            <div class="message-content">${this.escapeHtml(message.content)}</div>
            <div class="message-time">${time}</div>
        `;

        this.messages.appendChild(messageEl);
        this.scrollToBottom();
    }

    async handleMessageSubmit(e) {
        e.preventDefault();
        
        const content = this.messageInput.value.trim();
        if (!content) return;

        this.setSendButtonState(true);

        try {
            const { error } = await supabase.from("messages").insert({
                hire_id: this.hireId,
                sender_id: this.currentUser.id,
                content: content,
            });

            if (error) throw error;

            await this.sendNotification();
            
            this.messageInput.value = '';
            this.messageInput.focus();

        } catch (error) {
            this.showError("Failed to send message");
        } finally {
            this.setSendButtonState(false);
        }
    }

    async sendNotification() {
        const { data: hire } = await supabase
            .from("hires")
            .select("client_id, freelancer_id")
            .eq("id", this.hireId)
            .single();

        const recipientId = hire.client_id === this.currentUser.id 
            ? hire.freelancer_id 
            : hire.client_id;

        await supabase.from("notifications").insert({
            user_id: recipientId,
            type: "message",
            message: `New message from ${this.currentUser.user_metadata?.full_name || 'User'}`,
        });
    }

    setupRealtimeSubscription() {
        supabase
            .channel(`chat-${this.hireId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `hire_id=eq.${this.hireId}`
                },
                (payload) => {
                    this.appendMessage(payload.new);
                }
            )
            .subscribe();
    }

    // UI Methods
    toggleSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.toggle('open');
        }
    }

    closeSidebarMenu() {
        if (this.sidebar) {
            this.sidebar.classList.remove('open');
        }
    }

    handleOutsideClick(e) {
        if (this.sidebar && this.sidebar.classList.contains('open') && 
            this.menuToggle && !this.sidebar.contains(e.target) && 
            !this.menuToggle.contains(e.target)) {
            this.closeSidebarMenu();
        }
    }

    handleResize() {
        if (window.innerWidth > 768) {
            this.closeSidebarMenu();
        }
        this.updateLayout();
    }

    updateLayout() {
        if (!this.sidebar) return;
        
        if (window.innerWidth > 768) {
            this.sidebar.style.transform = 'translateX(0)';
        } else {
            if (!this.sidebar.classList.contains('open')) {
                this.sidebar.style.transform = 'translateX(-100%)';
            }
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            if (this.messagesContainer) {
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        }, 100);
    }

    setSendButtonState(sending) {
        if (!this.sendButton) return;
        
        this.sendButton.disabled = sending;
        this.sendButton.innerHTML = sending ? 
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity=".5"/><path d="M20 12h2A10 10 0 0 0 12 2v2a8 8 0 0 1 8 8z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    }

    showEmptyState() {
        if (!this.messages) return;
        
        this.messages.innerHTML = `
            <div class="empty-chat">
                <h3>No messages yet</h3>
                <p>Start the conversation by sending a message!</p>
            </div>
        `;
    }

    showError(message) {
        if (!this.messages) return;
        
        this.messages.innerHTML = `<div class="error">${message}</div>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }


    // Add this method to the ChatApp class
initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');
    
    // Check for saved theme or prefer-color-scheme
    const savedTheme = localStorage.getItem('chat-theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    
    if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
        document.documentElement.setAttribute('data-theme', 'light');
        themeIcon.textContent = '🌙';
        themeLabel.textContent = 'Dark Mode';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.textContent = '☀️';
        themeLabel.textContent = 'Light Mode';
    }
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        
        if (currentTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeIcon.textContent = '☀️';
            themeLabel.textContent = 'Light Mode';
            localStorage.setItem('chat-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.textContent = '🌙';
            themeLabel.textContent = 'Dark Mode';
            localStorage.setItem('chat-theme', 'light');
        }
    });
}


async loadPartnerAvatar() {
  if (!this.chatPartner || !this.chatPartner.id) return;

  const avatarEl = document.querySelector(".partner-avatar");
  if (!avatarEl) return;

  try {
    // Show loading state
    avatarEl.classList.add('loading');
    
    // Fetch partner's profile picture path from users table
    const { data, error } = await supabase
      .from("users")
      .select("profile_picture")
      .eq("id", this.chatPartner.id)
      .single();

    if (error || !data) {
      throw new Error("No profile picture found");
    }

    if (data.profile_picture) {
      // If profile picture stored in storage, get public URL
      const { data: publicUrl } = supabase.storage
        .from("profile_pictures")
        .getPublicUrl(data.profile_picture);

      if (publicUrl?.publicUrl) {
        // Create image element to handle loading
        const img = new Image();
        img.src = publicUrl.publicUrl;
        img.alt = "Partner Avatar";
        img.className = "avatar-img";
        
        img.onload = () => {
          avatarEl.innerHTML = '';
          avatarEl.appendChild(img);
          avatarEl.classList.remove('loading');
        };
        
        img.onerror = () => {
          avatarEl.classList.remove('loading');
          avatarEl.classList.add('error');
          console.error("Failed to load avatar image");
        };
      } else {
        throw new Error("No public URL available");
      }
    } else {
      throw new Error("No profile picture set");
    }
  } catch (err) {
    console.error("Error loading partner avatar:", err);
    avatarEl.classList.remove('loading');
    avatarEl.classList.add('error');
  }
}
}

// Global function for back button

// Initialize the chat app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const chatApp = new ChatApp();
    chatApp.init();
});
