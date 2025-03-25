document.addEventListener('DOMContentLoaded', function() {
    // Initialize markdown-it for rendering markdown
    const md = window.markdownit({
        html: false,
        linkify: true,
        typographer: true,
        highlight: function (str, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(str, { language: lang }).value;
                } catch (__) {}
            }
            return ''; // use external default escaping
        }
    });

    // DOM elements
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    const sendButton = document.getElementById('send-button');
    const clearChatButton = document.getElementById('clear-chat');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    const scrollBottomBtn = document.getElementById('scroll-bottom');
    const personaSelection = document.getElementById('persona-selection');
    const personaButtons = document.querySelectorAll('.persona-btn');
    const quickActions = document.getElementById('quick-actions');
    const actionGroups = document.querySelectorAll('.quick-action-group');
    const actionButtons = document.querySelectorAll('.action-btn');
    const personaBadge = document.getElementById('persona-badge');
    const currentPersonaBadge = document.getElementById('current-persona-badge');
    const loadingMessages = Array.from(document.querySelectorAll('#loading-messages .message-template'));
    const stopGenerationBtn = document.getElementById('stop-generation');
    const stopBtn = document.getElementById('stop-btn');
    const contextActions = document.getElementById('context-actions');
    const subjectActionTemplates = document.getElementById('subject-action-templates');
    
    // State variables
    let messageCounter = 0;
    let currentPersona = null;
    let isFirstMessage = true;
    let currentTypingInstance = null;
    let currentRequestController = null; // For stop generation button
    let isGenerating = false; // Flag to track if response is being generated
    let loadingChatHistory = true; // Flag to indicate we're loading chat history
    
    // Initialize the theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    
    // Load chat history from server on page load
    loadChatHistory().then(() => {
        // Show persona selection if this is a new conversation
        if (isFirstMessage && !loadingChatHistory) {
            setTimeout(() => {
                personaSelection.style.display = 'block';
            }, 1000);
        } else if (currentPersona) {
            // Show the current persona badge
            updatePersonaBadge(currentPersona);
        }
    });
    
    // Theme toggle functionality
    themeToggle.addEventListener('click', function() {
        const currentTheme = document.documentElement.getAttribute('data-bs-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    });
    
    // Set theme function
    function setTheme(theme) {
        document.documentElement.setAttribute('data-bs-theme', theme);
        
        if (theme === 'light') {
            themeIcon.className = 'fas fa-sun me-1';
            themeText.textContent = 'Light Mode';
        } else {
            themeIcon.className = 'fas fa-moon me-1';
            themeText.textContent = 'Dark Mode';
        }
    }
    
    // Auto-resize text area as user types
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
    
    // Scroll-to-bottom button logic
    chatMessages.addEventListener('scroll', function() {
        const isScrolledToBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 50;
        
        if (isScrolledToBottom) {
            scrollBottomBtn.style.display = 'none';
        } else if (chatMessages.scrollTop < chatMessages.scrollHeight - chatMessages.clientHeight - 100) {
            scrollBottomBtn.style.display = 'flex';
        }
    });
    
    scrollBottomBtn.addEventListener('click', function() {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    });
    
    // Persona selection functionality
    personaButtons.forEach(button => {
        button.addEventListener('click', async function() {
            const persona = this.getAttribute('data-persona');
            
            try {
                // Send the selected persona to the server
                const response = await fetch('/api/persona', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ persona })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to set persona');
                }
                
                // Hide the persona selection
                personaSelection.style.display = 'none';
                
                // Store the selected persona
                currentPersona = persona;
                localStorage.setItem('persona', persona);
                
                // Update the persona badge
                updatePersonaBadge(persona);
                
                // Show the appropriate quick action buttons after the first message
                if (!isFirstMessage) {
                    showQuickActions(persona);
                }
                
                // Allow user to type
                userInput.focus();
                
            } catch (error) {
                console.error('Error setting persona:', error);
            }
        });
    });
    
    // Quick action button functionality
    actionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const persona = currentPersona;
            
            // Get the current input text
            const currentText = userInput.value.trim();
            
            // Create a descriptive message based on the action button text
            const buttonText = this.textContent.trim();
            const actionMessage = currentText ? 
                `${buttonText}: ${currentText}` : 
                `${buttonText}`;
            
            // Set the input value to the formatted message
            userInput.value = actionMessage;
            
            // Simulate form submission
            chatForm.dispatchEvent(new Event('submit'));
        });
    });
    
    // Subject-specific action button functionality
    document.addEventListener('click', function(e) {
        if (e.target.closest('.subject-action-btn')) {
            const button = e.target.closest('.subject-action-btn');
            const action = button.getAttribute('data-action');
            
            // Get the current input text
            const currentText = userInput.value.trim();
            
            // Create a descriptive message based on the action button text
            const buttonText = button.textContent.trim();
            const actionMessage = currentText ? 
                `${buttonText}: ${currentText}` : 
                `${buttonText}`;
            
            // Set the input value to the formatted message
            userInput.value = actionMessage;
            
            // Simulate form submission
            chatForm.dispatchEvent(new Event('submit'));
        }
    });
    
    // Show the appropriate quick action buttons
    function showQuickActions(persona) {
        // Hide all action groups first
        actionGroups.forEach(group => {
            group.style.display = 'none';
        });
        
        // Show the appropriate action group
        const actionGroup = document.getElementById(`${persona}-actions`);
        if (actionGroup) {
            quickActions.style.display = 'block';
            actionGroup.style.display = 'block';
        }
    }
    
    // Update the persona badge
    function updatePersonaBadge(persona) {
        let personaText = '';
        let badgeClass = '';
        
        switch (persona) {
            case 'code':
                personaText = '🖥️ Code Specialist';
                badgeClass = 'bg-primary';
                break;
            case 'stem':
                personaText = '🔬 STEM Specialist';
                badgeClass = 'bg-success';
                break;
            case 'business':
                personaText = '💼 Business Advisor';
                badgeClass = 'bg-info';
                break;
            case 'general':
                personaText = '🎓 General Learning';
                badgeClass = 'bg-secondary';
                break;
        }
        
        if (personaText) {
            currentPersonaBadge.textContent = personaText;
            currentPersonaBadge.className = `badge ${badgeClass}`;
            personaBadge.classList.remove('d-none');
        }
    }
    
    // Copy message button functionality
    document.addEventListener('click', function(e) {
        if (e.target.closest('.copy-btn')) {
            const copyBtn = e.target.closest('.copy-btn');
            const messageId = copyBtn.getAttribute('data-message-id');
            const messageElement = document.getElementById(`message-${messageId}`);
            
            if (messageElement) {
                // Get text content excluding any buttons or other elements
                const textToCopy = messageElement.textContent.trim();
                
                navigator.clipboard.writeText(textToCopy).then(() => {
                    // Show copied state
                    copyBtn.classList.add('copied');
                    copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                    
                    // Reset after 2 seconds
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            }
        }
    });
    
    // Clear chat messages and reset conversation on the server
    clearChatButton.addEventListener('click', async function() {
        // Keep only the first welcome message
        const welcomeMessage = chatMessages.querySelector('.message');
        chatMessages.innerHTML = '';
        if (welcomeMessage) {
            chatMessages.appendChild(welcomeMessage);
        }
        
        // Clear local storage except theme
        const theme = localStorage.getItem('theme');
        localStorage.clear();
        if (theme) localStorage.setItem('theme', theme);
        
        // Reset state variables
        isFirstMessage = true;
        currentPersona = null;
        
        // Hide quick actions
        quickActions.style.display = 'none';
        
        // Hide persona badge
        personaBadge.classList.add('d-none');
        
        // Show persona selection
        personaSelection.style.display = 'block';
        
        // Reset conversation on the server
        try {
            await fetch('/api/reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log('Conversation history reset on server');
        } catch (error) {
            console.error('Error resetting conversation on server:', error);
        }
    });
    
    // Load chat history from server database
    async function loadChatHistory() {
        try {
            loadingChatHistory = true;
            
            // Fetch conversation history from the server
            const response = await fetch('/api/history');
            
            if (!response.ok) {
                throw new Error('Failed to fetch conversation history');
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Get the history array and persona
                const history = data.history;
                currentPersona = data.persona;
                
                // If there's no history, we're starting a new conversation
                if (!history || history.length === 0) {
                    isFirstMessage = true;
                    
                    // Show persona selection if there's no history
                    setTimeout(() => {
                        personaSelection.style.display = 'block';
                    }, 1000);
                    
                    loadingChatHistory = false;
                    return;
                }
                
                // Clear existing messages except the welcome message
                const welcomeMessage = chatMessages.querySelector('.message');
                chatMessages.innerHTML = '';
                if (welcomeMessage) {
                    chatMessages.appendChild(welcomeMessage);
                }
                
                // Add each message to the chat
                history.forEach(msg => {
                    addMessage(msg.content, msg.role, false);
                });
                
                // Update state
                isFirstMessage = false;
                
                // Show the persona badge
                if (currentPersona) {
                    updatePersonaBadge(currentPersona);
                    
                    // Show quick actions
                    showQuickActions(currentPersona);
                }
                
                // Scroll to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
            
            // Fallback to localStorage if server fails
            const chatHistory = localStorage.getItem('chatHistory');
            if (chatHistory) {
                chatMessages.innerHTML = chatHistory;
                
                // Reinitialize copy buttons
                const copyButtons = document.querySelectorAll('.copy-btn');
                copyButtons.forEach(btn => {
                    const messageId = btn.getAttribute('data-message-id');
                    if (messageId !== 'welcome') {
                        btn.setAttribute('data-message-id', messageId);
                    }
                });
                
                // Fallback to localStorage for persona
                currentPersona = localStorage.getItem('persona');
                
                // Update state
                isFirstMessage = false;
                
                // Show quick actions if persona is set
                if (currentPersona) {
                    updatePersonaBadge(currentPersona);
                    showQuickActions(currentPersona);
                }
                
                // Scroll to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } finally {
            loadingChatHistory = false;
        }
    }
    
    // Save chat history to localStorage as backup
    function saveChatHistory() {
        localStorage.setItem('chatHistory', chatMessages.innerHTML);
    }
    
    // Format message using markdown-it
    function formatMessage(text) {
        try {
            // Render markdown
            let renderedHtml = md.render(text);
            
            // Apply syntax highlighting to code blocks
            setTimeout(() => {
                document.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }, 0);
            
            return renderedHtml;
        } catch (error) {
            console.error('Error formatting message:', error);
            
            // Fallback for any rendering errors
            return `<p>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
        }
    }
    
    // Get a random loading message
    function getRandomLoadingMessage() {
        if (loadingMessages.length === 0) return "Thinking...";
        return loadingMessages[Math.floor(Math.random() * loadingMessages.length)].textContent;
    }
    
    // Add a message to the chat
    function addMessage(message, sender, animate = false) {
        messageCounter++;
        const messageId = `msg-${Date.now()}-${messageCounter}`;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        
        const iconClass = sender === 'user' ? 'fas fa-user' : 'fas fa-graduation-cap';
        let formattedMessage = formatMessage(message);
        
        // Create the message HTML structure with copy button
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="${iconClass}"></i>
            </div>
            <div class="message-content">
                <div class="message-text" id="message-${messageId}">
                    ${animate ? '<span class="typing-text">' + formattedMessage + '</span>' : formattedMessage}
                </div>
                ${sender === 'assistant' ? `
                <div class="message-actions">
                    <button class="btn btn-sm copy-btn" data-message-id="${messageId}">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>` : ''}
            </div>
        `;
        
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Save to localStorage
        saveChatHistory();
        
        // If this is the first user message and we have a persona, show quick actions
        if (sender === 'user' && isFirstMessage && currentPersona) {
            isFirstMessage = false;
            showQuickActions(currentPersona);
        }
        
        // If animation is requested and this is an assistant message, animate typing
        if (animate && sender === 'assistant') {
            const textElement = messageDiv.querySelector('.typing-text');
            
            if (textElement) {
                // Hide the text initially
                textElement.style.visibility = 'visible';
                textElement.innerHTML = '';
                
                // Create and start typing animation with faster speed
                currentTypingInstance = new TypeIt(textElement, {
                    strings: [formattedMessage],
                    speed: 10, // Increased speed for faster typing
                    waitUntilVisible: true,
                    startDelay: 0, // No delay before starting
                    afterComplete: function() {
                        // Replace the span with actual HTML to ensure proper formatting
                        const parentElement = textElement.parentElement;
                        if (parentElement) {
                            parentElement.innerHTML = formattedMessage;
                            
                            // Re-highlight code blocks
                            const codeBlocks = parentElement.querySelectorAll('pre code');
                            if (codeBlocks.length > 0) {
                                codeBlocks.forEach(block => {
                                    hljs.highlightElement(block);
                                });
                            }
                            
                            // Update localStorage after animation completes
                            saveChatHistory();
                        }
                    }
                }).go();
            }
        }
        
        return messageDiv;
    }
    
    // Add typing indicator with a random message
    function addTypingIndicator() {
        const loadingMessage = getRandomLoadingMessage();
        const indicatorDiv = document.createElement('div');
        indicatorDiv.classList.add('typing-indicator-container');
        
        indicatorDiv.innerHTML = `
            <div class="typing-indicator-text">${loadingMessage}</div>
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        chatMessages.appendChild(indicatorDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return indicatorDiv;
    }
    
    // Remove typing indicator
    function removeTypingIndicator(indicator) {
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    }
    
    // Send message to backend API
    async function sendMessage(message, persona = null, action = null) {
        try {
            // Create an AbortController for this request
            currentRequestController = new AbortController();
            const signal = currentRequestController.signal;
            
            // Set generating state and show stop button
            isGenerating = true;
            stopGenerationBtn.style.display = 'block';
            
            const payload = { message };
            
            // Add persona and action if provided
            if (persona) payload.persona = persona;
            if (action) payload.action = action;
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: signal // Add signal to allow request cancellation
            });
            
            // Reset generating state
            isGenerating = false;
            stopGenerationBtn.style.display = 'none';
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get response');
            }
            
            const data = await response.json();
            
            // Update persona if returned from server
            if (data.persona && data.persona !== currentPersona) {
                currentPersona = data.persona;
                localStorage.setItem('persona', currentPersona);
                updatePersonaBadge(currentPersona);
            }
            
            // Detect subject from the message and response to show context-based actions
            detectSubjectAndUpdateActions(message, data.response);
            
            return data.response;
        } catch (error) {
            // Reset generating state
            isGenerating = false;
            stopGenerationBtn.style.display = 'none';
            
            // Check if error was caused by abort (user clicked "Stop Generating")
            if (error.name === 'AbortError') {
                return "Generation stopped by user.";
            }
            
            console.error('Error sending message:', error);
            throw error;
        }
    }
    
    // Detect subject from text and update context-based action buttons
    function detectSubjectAndUpdateActions(userMessage, aiResponse) {
        if (!subjectActionTemplates) return;
        
        // Combine user message and AI response for context analysis
        const fullContext = `${userMessage} ${aiResponse}`.toLowerCase();
        
        // Clear current context actions
        contextActions.innerHTML = '';
        contextActions.style.display = 'none';
        
        // Check each subject template
        const subjectTemplates = subjectActionTemplates.querySelectorAll('[data-subject]');
        let foundSubject = false;
        
        subjectTemplates.forEach(template => {
            const subject = template.getAttribute('data-subject');
            const contextKeywords = template.getAttribute('data-context').split(',');
            
            // Check if any of the keywords appear in the conversation
            const isRelevant = contextKeywords.some(keyword => 
                fullContext.includes(keyword.trim().toLowerCase())
            );
            
            if (isRelevant) {
                foundSubject = true;
                // Clone the buttons from the template
                const buttons = template.cloneNode(true).innerHTML;
                contextActions.innerHTML += buttons;
                
                // Show the context actions section
                contextActions.style.display = 'block';
                quickActions.style.display = 'block';
            }
        });
        
        // If any subject was detected, show the quick actions section
        if (foundSubject) {
            quickActions.style.display = 'block';
        }
    }
    
    // Send message with an action
    async function sendMessageWithAction(message, persona, action) {
        // Disable input and button
        userInput.value = '';
        userInput.style.height = 'auto';
        userInput.disabled = true;
        sendButton.disabled = true;
        
        // Add user message to chat
        addMessage(message, 'user');
        
        // Show typing indicator
        const typingIndicator = addTypingIndicator();
        
        try {
            // Send message to backend with action
            const response = await sendMessage(message, persona, action);
            
            // Remove typing indicator
            removeTypingIndicator(typingIndicator);
            
            // Add assistant response to chat with typing animation
            addMessage(response, 'assistant', true);
        } catch (error) {
            // Remove typing indicator
            removeTypingIndicator(typingIndicator);
            
            // Add error message
            addMessage(`I'm sorry, I encountered an error: ${error.message}. Please try again.`, 'assistant');
        } finally {
            // Re-enable input and button
            userInput.disabled = false;
            sendButton.disabled = false;
            userInput.focus();
            
            // Hide scroll button if at bottom
            if (chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 50) {
                scrollBottomBtn.style.display = 'none';
            }
        }
    }
    
    // Handle form submission
    chatForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if (!message) return;
        
        // Don't allow sending messages if persona selection is showing
        if (personaSelection.style.display === 'block') {
            // Flash the persona selection to draw attention
            personaSelection.style.animation = 'none';
            setTimeout(() => {
                personaSelection.style.animation = 'flash 0.5s';
            }, 10);
            return;
        }
        
        // Disable input and button while processing
        userInput.value = '';
        userInput.style.height = 'auto';
        userInput.disabled = true;
        sendButton.disabled = true;
        
        // Add user message to chat
        addMessage(message, 'user');
        
        // Show typing indicator
        const typingIndicator = addTypingIndicator();
        
        try {
            // Send message to backend and get response
            const response = await sendMessage(message);
            
            // Remove typing indicator
            removeTypingIndicator(typingIndicator);
            
            // Add assistant response to chat with typing animation
            addMessage(response, 'assistant', true);
        } catch (error) {
            // Remove typing indicator
            removeTypingIndicator(typingIndicator);
            
            // Add error message
            addMessage(`I'm sorry, I encountered an error: ${error.message}. Please try again.`, 'assistant');
        } finally {
            // Re-enable input and button
            userInput.disabled = false;
            sendButton.disabled = false;
            userInput.focus();
            
            // Hide scroll button if at bottom
            if (chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 50) {
                scrollBottomBtn.style.display = 'none';
            }
        }
    });
    
    // Load chat history when page loads
    loadChatHistory();
    
    // Focus input on page load if persona selection is not showing
    if (personaSelection.style.display !== 'block') {
        userInput.focus();
    }
    
    // Enable Enter key to send message (Shift+Enter for new line)
    userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (userInput.value.trim() && personaSelection.style.display !== 'block') {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    });
    
    // Add flash animation for persona selection
    const style = document.createElement('style');
    style.textContent = `
    @keyframes flash {
        0%, 100% { background-color: var(--bs-dark); }
        50% { background-color: var(--bs-primary); }
    }`;
    document.head.appendChild(style);
    
    // Stop generation button functionality
    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            if (currentRequestController && isGenerating) {
                // Abort the current fetch request
                currentRequestController.abort();
                
                // Stop the typing animation if it's running
                if (currentTypingInstance) {
                    currentTypingInstance.destroy();
                    currentTypingInstance = null;
                }
                
                console.log('Generation stopped by user');
            }
        });
    }
});
