console.log('CONTENT: Script loaded - v1.0.3');

// Check if we're already running to prevent duplicate initialization
if (window.popAiAlreadyInitialized) {
  console.log('CONTENT: Another instance already running, exiting');
} else {
  // Mark as initialized at the window level
  window.popAiAlreadyInitialized = true;
  
  // Global state - now inside our singleton scope
  const state = {
    isInitialized: false,
    activeInput: null,
    ghostText: null,
    currentSuggestion: null,
    lastValue: '',
    cursorPosition: 0,
    lastRequestTime: 0,
    lastRequestText: '',
    recentlyAcceptedSuggestion: false
  };
  
  // Helper functions
  function isInputElement(element) {
    if (!element) return false;
    
    // Get tag name in lowercase
    const tagName = element.tagName.toLowerCase();
    
    // Check for standard input elements
    if (tagName === 'input' && ['text', 'search', 'email', 'url', 'tel', 'number', 'password'].includes(element.type)) {
      return true;
    }
    
    // Check for textarea
    if (tagName === 'textarea') {
      return true;
    }
    
    // Check for contenteditable
    if (element.isContentEditable) {
      return true;
    }
    
    // Check for chat-specific elements by class or role
    if (element.getAttribute('role') === 'textbox' || 
        element.classList.contains('chat-input') || 
        element.classList.contains('message-input') ||
        element.classList.contains('composer-input')) {
      return true;
    }
    
    // Check for common chat input patterns
    const parentClasses = element.parentElement?.className || '';
    if (parentClasses.includes('chat') || 
        parentClasses.includes('message') || 
        parentClasses.includes('composer')) {
      return true;
    }
    
    return false;
  }
  
  function getInputValue(inputElement) {
    if (!inputElement) return '';
    
    if (inputElement.isContentEditable) {
      return inputElement.textContent || '';
    } else {
      return inputElement.value || '';
    }
  }
  
  function setInputValue(inputElement, value) {
    if (!inputElement) return;
    
    if (inputElement.isContentEditable) {
      inputElement.textContent = value;
    } else {
      inputElement.value = value;
    }
  }
  
  function getCursorPosition(inputElement) {
    if (!inputElement) return 0;
    
    if (inputElement.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(inputElement);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
      }
      return 0;
    } else {
      return inputElement.selectionEnd || 0;
    }
  }
  
  function showDebugOverlay(message) {
    console.log('CONTENT: Debug overlay:', message);
    
    // Create or get overlay
    let overlay = document.querySelector('.pop-ai-debug-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'pop-ai-debug-overlay';
      overlay.style.position = 'fixed';
      overlay.style.bottom = '10px';
      overlay.style.right = '10px';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      overlay.style.color = 'white';
      overlay.style.padding = '5px 10px';
      overlay.style.borderRadius = '5px';
      overlay.style.fontSize = '12px';
      overlay.style.zIndex = '10000';
      overlay.style.transition = 'opacity 0.3s';
      document.body.appendChild(overlay);
    }
    
    // Set message and show
    overlay.textContent = message;
    overlay.style.opacity = '1';
    
    // Hide after 3 seconds
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300);
    }, 3000);
  }
  
  // Create ghost text element
  function createGhostText() {
    console.log('CONTENT: Creating ghost text element');
    // Remove any existing ghost text
    if (state.ghostText) {
      state.ghostText.remove();
    }
    
    state.ghostText = document.createElement('div');
    state.ghostText.className = 'pop-ai-ghost-text';
    document.body.appendChild(state.ghostText);
    
    console.log('CONTENT: Ghost text element created');
    return state.ghostText;
  }
  
  // Improve ghost text positioning and visibility
  function positionGhostText(input, suggestion) {
    if (!state.ghostText || !suggestion || !input) {
      console.log('CONTENT: Cannot position ghost text - missing element(s)');
      hideGhostText();
      return;
    }
    
    try {
      const inputRect = input.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(input);
      
      // Calculate available width considering padding and borders
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
      const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
      const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
      
      // Calculate maximum width
      const availableWidth = inputRect.width - paddingLeft - paddingRight - borderLeft - borderRight;
      
      // Update ghost text styles with width constraint
      state.ghostText.style.cssText = `
        position: absolute !important;
        font-family: ${computedStyle.fontFamily} !important;
        font-size: ${computedStyle.fontSize} !important;
        line-height: ${computedStyle.lineHeight} !important;
        color: rgba(108, 92, 231, 0.8) !important;
        pointer-events: none !important;
        z-index: 999999 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: ${availableWidth}px !important;
        width: ${availableWidth}px !important;
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
        text-shadow: 0 0 0.5px rgba(255, 255, 255, 0.5) !important;
      `;

      // Get cursor position
      const cursorPos = getCursorPosition(input);
      const caret = getCaretCoordinates(input, cursorPos);
      
      // Calculate position with scroll offsets
      const left = inputRect.left + paddingLeft + borderLeft + caret.left - (input.scrollLeft || 0);
      const top = inputRect.top + caret.top - (input.scrollTop || 0);
      
      // Add window scroll offset
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      
      // Ensure ghost text stays within input boundaries
      const maxRight = inputRect.left + inputRect.width - paddingRight - borderRight;
      let finalLeft = left + scrollX;
      
      if (finalLeft + state.ghostText.offsetWidth > maxRight) {
        // Move to next line if text would overflow
        finalLeft = inputRect.left + paddingLeft + borderLeft + scrollX;
        state.ghostText.style.top = `${top + parseFloat(computedStyle.lineHeight) + scrollY}px`;
      } else {
        state.ghostText.style.top = `${top + scrollY}px`;
      }
      
      state.ghostText.style.left = `${finalLeft}px`;
      state.ghostText.textContent = suggestion;
      
    } catch (error) {
      console.error('CONTENT: Error positioning ghost text:', error);
      hideGhostText();
    }
  }
  
  // Hide ghost text
  function hideGhostText() {
    if (state.ghostText) {
      state.ghostText.style.display = 'none';
    }
    
    // Clean up resize handler
    if (state.resizeHandler) {
      window.removeEventListener('resize', state.resizeHandler);
      window.removeEventListener('scroll', state.resizeHandler, true);
      state.resizeHandler = null;
    }
  }
  
  // Define handleFocusIn function before setupEventListeners
  function handleFocusIn(event) {
    const target = event.target;
    
    if (isInputElement(target)) {
      console.log('CONTENT: Focus detected on input element');
      state.activeInput = target;
      state.lastValue = getInputValue(target);
      state.cursorPosition = getCursorPosition(target);
      
      // Request suggestion after a short delay
      setTimeout(() => {
        if (state.activeInput === target) {
          requestSuggestion(target);
        }
      }, 300);
    }
  }
  
  // Define handleFocusOut function before setupEventListeners
  function handleFocusOut(event) {
    console.log('CONTENT: Focus out detected');
    
    // Don't clear active input immediately to allow for suggestion acceptance
    setTimeout(() => {
      // Only clear if we haven't accepted a suggestion recently
      if (!state.recentlyAcceptedSuggestion) {
        state.activeInput = null;
        hideGhostText();
      }
      state.recentlyAcceptedSuggestion = false;
    }, 100);
  }
  
  // Update handleInput function to ensure context is properly gathered
  function handleInput(event) {
    const input = event.target;
    if (!isInputElement(input)) return;
    
    const currentValue = getInputValue(input);
    
    // Update state
    state.activeInput = input;
    state.lastValue = currentValue;
    state.cursorPosition = getCursorPosition(input);
    
    // Hide existing ghost text
    hideGhostText();
    
    // Get enhanced context with more detailed logging
    const context = getPageContext();
    console.log('CONTENT: Context gathered for suggestion:', context);
    
    // Only request if value has changed
    if (currentValue !== state.lastRequestText) {
      state.lastRequestTime = Date.now();
      state.lastRequestText = currentValue;
      
      // Request new suggestion with full context
      chrome.runtime.sendMessage({
        type: 'getSuggestion',
        text: currentValue,
        ...context
      }, handleSuggestionResponse);
    }
  }
  
  // Improve handleTabKey function
  function handleTabKey(event) {
    if (!state.activeInput || !state.currentSuggestion) {
      return;
    }
    
    // Prevent default tab behavior
    event.preventDefault();
    
    try {
      const currentValue = getInputValue(state.activeInput);
      const newValue = currentValue + state.currentSuggestion;
      
      // Apply the suggestion
      setInputValue(state.activeInput, newValue);
      
      // Set cursor to end
      if (state.activeInput.setSelectionRange) {
        state.activeInput.setSelectionRange(newValue.length, newValue.length);
      }
      
      // Hide current ghost text
      hideGhostText();
      
      // Reset states for next suggestion
      state.lastValue = newValue;
      state.lastRequestText = '';  // Reset this to allow new suggestions
      state.currentSuggestion = null;
      
      // Force a new suggestion request after a short delay
      setTimeout(() => {
        const inputEvent = new Event('input', { bubbles: true });
        state.activeInput.dispatchEvent(inputEvent);
      }, 10);
      
      // Send feedback
      chrome.runtime.sendMessage({
        action: 'suggestionAccepted',
        text: currentValue,
        suggestion: state.currentSuggestion
      });
    } catch (error) {
      console.error('CONTENT: Error accepting suggestion:', error);
    }
  }
  
  // Define rejectSuggestion before setupEventListeners
  function rejectSuggestion() {
    if (!state.currentSuggestion) return;
    
    console.log('CONTENT: Rejecting suggestion');
    
    // Report rejection
    chrome.runtime.sendMessage({
      type: 'suggestionRejected',
      text: state.activeInput ? getInputValue(state.activeInput) : '',
      suggestion: state.currentSuggestion,
      url: window.location.href
    });
    
    // Clear suggestion
    state.currentSuggestion = null;
  }
  
  // Define requestSuggestion before setupEventListeners
  function requestSuggestion(inputElement) {
    if (!inputElement) {
      console.log('CONTENT: No input element provided');
      return;
    }
    
    try {
      // Get the current text
      const text = getInputValue(inputElement);
      
      // Don't request if text is too short
      if (!text || text.length < 3) {
        console.log('CONTENT: Text too short, not requesting suggestion');
        hideGhostText();
        return;
      }
      
      // Throttle requests
      const now = Date.now();
      if (now - state.lastRequestTime < 500 || text === state.lastRequestText) {
        console.log('CONTENT: Throttling suggestion request');
        return;
      }
      
      state.lastRequestTime = now;
      state.lastRequestText = text;
      
      // Get page context
      const pageUrl = window.location.href;
      const pageTitle = document.title;
      
      // Get enhanced context
      const enhancedContext = getEnhancedContext(inputElement);
      
      console.log('CONTENT: Requesting suggestion for:', text.substring(0, 30) + '...');
      
      // Request suggestion from background script
      chrome.runtime.sendMessage({
        type: 'getSuggestion',
        text: text,
        url: pageUrl,
        title: pageTitle,
        inputType: inputElement.tagName.toLowerCase(),
        inputId: inputElement.id || '',
        inputName: inputElement.name || '',
        inputClass: inputElement.className || '',
        placeholder: inputElement.placeholder || '',
        ...enhancedContext
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('CONTENT: Error getting suggestion:', chrome.runtime.lastError);
          return;
        }
        
        console.log('CONTENT: Got response from background:', response);
        handleSuggestionResponse(response);
      });
    } catch (error) {
      console.error('CONTENT: Error in requestSuggestion:', error);
      hideGhostText();
    }
  }
  
  // Add the textarea-caret-position utility
  function getCaretCoordinates(element, position) {
    // Create div to measure
    const div = document.createElement('div');
    const style = div.style;
    const computed = window.getComputedStyle(element);
    
    // Copy styles that affect text measurement
    const properties = [
      'direction', 'boxSizing', 'width', 'height',
      'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth',
      'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch',
      'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
      'textAlign', 'textTransform', 'textIndent', 'textDecoration',
      'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
    ];
    
    // Copy computed styles
    properties.forEach(prop => {
      style[prop] = computed[prop];
    });
    
    // Special handling for certain styles
    style.position = 'absolute';
    style.visibility = 'hidden';
    style.whiteSpace = 'pre-wrap';
    
    // If element is textarea, wrap properly
    if (element.nodeName === 'TEXTAREA') {
      style.wordWrap = 'break-word';
    }
    
    // Create content and measure
    div.textContent = element.value.substring(0, position);
    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);
    
    document.body.appendChild(div);
    const coordinates = {
      top: span.offsetTop + parseInt(computed.borderTopWidth),
      left: span.offsetLeft + parseInt(computed.borderLeftWidth)
    };
    document.body.removeChild(div);
    
    return coordinates;
  }
  
  // Update handleSuggestionResponse with new positioning logic
  function handleSuggestionResponse(response) {
    try {
      if (!response || !response.suggestion || !state.activeInput) {
        console.log('CONTENT: No valid suggestion or active input');
        hideGhostText();
        return;
      }

      const suggestion = response.suggestion;
      state.currentSuggestion = suggestion;

      // Create ghost text if it doesn't exist
      if (!state.ghostText) {
        createGhostText();
      }

      requestAnimationFrame(() => {
        const input = state.activeInput;
        const computedStyle = window.getComputedStyle(input);

        // Set basic styles
        state.ghostText.style.cssText = `
          position: absolute;
          font-family: ${computedStyle.fontFamily};
          font-size: ${computedStyle.fontSize};
          line-height: ${computedStyle.lineHeight};
          color: rgba(108, 92, 231, 0.8);
          pointer-events: none;
          z-index: 999999;
          white-space: pre-wrap;
          display: block;
          padding: ${computedStyle.padding};
          text-shadow: 0 0 0.5px rgba(255, 255, 255, 0.5);
        `;

        const rect = input.getBoundingClientRect();
        const cursorPos = getCursorPosition(input);
        const caret = getCaretCoordinates(input, cursorPos);

        // Calculate position considering scroll
        const left = rect.left + caret.left - (input.scrollLeft || 0);
        const top = rect.top + caret.top - (input.scrollTop || 0);

        // Add window scroll offset
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        // Set final position
        state.ghostText.style.left = `${left + scrollX}px`;
        state.ghostText.style.top = `${top + scrollY}px`;
        state.ghostText.textContent = suggestion;
      });

    } catch (error) {
      console.error('CONTENT: Error in handleSuggestionResponse:', error);
      hideGhostText();
    }
  }
  
  // Add throttle utility function
  function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  // Improve context detection for chat interfaces
  function getEnhancedContext(inputElement) {
    try {
      const context = {};
      
      // Check if we're in a chat/messaging interface
      const isInChatInterface = 
        document.URL.includes('/messages') || 
        document.URL.includes('/chat') ||
        document.querySelector('.messages') ||
        document.querySelector('.chat') ||
        document.querySelector('[role="conversation"]');
      
      if (isInChatInterface) {
        context.interfaceType = 'chat';
        
        // Get all message elements with more robust selectors
        const messageSelectors = [
          '.message', '.chat-message', '.message-bubble', 
          '[role="message"]', '.message-body', '.message-text',
          '.chat-bubble', '.chat-text', '.message-content'
        ];
        
        // Join all selectors with commas for a single query
        const messageElements = document.querySelectorAll(messageSelectors.join(', '));
        
        // Extract the last 3 messages for better context
        const recentMessages = [];
        for (let i = Math.max(0, messageElements.length - 3); i < messageElements.length; i++) {
          const messageText = messageElements[i].textContent.trim();
          if (messageText) {
            recentMessages.push(messageText);
          }
        }
        
        // Add recent messages to context
        if (recentMessages.length > 0) {
          context.recentMessages = recentMessages;
          context.lastMessageText = recentMessages[recentMessages.length - 1];
        }
        
        // Try to extract the conversation topic from page elements
        const topicElement = document.querySelector('.conversation-topic, .chat-title, .thread-title');
        if (topicElement) {
          context.conversationTopic = topicElement.textContent.trim();
        }
        
        // Get the current partial input text
        if (inputElement) {
          const currentInput = getInputValue(inputElement);
          context.currentInput = currentInput;
        }
      }
      
      return context;
    } catch (error) {
      console.error('CONTENT: Error getting enhanced context:', error);
      return {};
    }
  }
  
  // Make sure these functions are defined before setupEventListeners is called
  function setupEventListeners() {
    console.log('CONTENT: Setting up event listeners');
    
    // Listen for input events on the document
    document.addEventListener('input', handleInput, true);
    
    // Listen for keydown events to handle tab key
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Tab') {
        handleTabKey(event);
      } else if (event.key === 'Escape') {
        hideGhostText();
      }
    }, true);
    
    // Listen for focus events
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    
    // Listen for click events to hide ghost text when clicking elsewhere
    document.addEventListener('click', function(event) {
      if (!isInputElement(event.target)) {
        hideGhostText();
      }
    }, true);
    
    console.log('CONTENT: Event listeners set up successfully');
  }
  
  // Test ghost text
  // function testGhostText() {
  //   console.log('CONTENT: Testing ghost text');
    
  //   // Create a test input if none is active
  //   let testInput = state.activeInput;
  //   if (!testInput) {
  //     testInput = document.querySelector('input[type="text"], textarea') || 
  //                document.querySelector('[contenteditable="true"]');
      
  //     if (!testInput) {
  //       console.log('CONTENT: No suitable input found for test');
  //       showDebugOverlay('No suitable input found for test');
  //       return;
  //     }
  //   }
    
  //   // Create a test suggestion
  //   const testSuggestion = ' is working correctly!';
    
  //   // Make sure ghost text element exists
  //   if (!state.ghostText) {
  //     createGhostText();
  //   }
    
  //   // Position ghost text
  //   positionGhostText(testInput, testSuggestion);
    
  //   // Store current suggestion
  //   state.currentSuggestion = testSuggestion;
    
  //   // Show debug overlay
  //   showDebugOverlay('TEST: Ghost text should be visible now');
  // }
  
  // Modify the startKeepAlivePing function to better handle extension context invalidation
  function startKeepAlivePing() {
    console.log('CONTENT: Starting keep-alive ping');
    
    let pingInterval;
    let pingAttempts = 0;
    const MAX_PING_ATTEMPTS = 3;
    
    function ping() {
      try {
        chrome.runtime.sendMessage({ type: 'ping' }, function(response) {
          // Check for runtime errors first
          if (chrome.runtime.lastError) {
            console.error('CONTENT: Ping failed:', chrome.runtime.lastError);
            
            // If we get an extension context invalidated error, stop pinging immediately
            if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
              console.log('CONTENT: Extension context invalidated, stopping ping');
              clearInterval(pingInterval);
              return;
            }
            
            pingAttempts++;
            if (pingAttempts >= MAX_PING_ATTEMPTS) {
              console.log('CONTENT: Too many failed ping attempts, stopping ping');
              clearInterval(pingInterval);
            }
          } else {
            // Reset attempts on success
            pingAttempts = 0;
            console.log('CONTENT: Ping successful');
          }
        });
      } catch (e) {
        console.error('CONTENT: Error sending ping:', e);
        
        // If it's an extension context error, stop immediately
        if (e.message && e.message.includes('Extension context invalidated')) {
          console.log('CONTENT: Extension context invalidated, stopping ping');
          clearInterval(pingInterval);
          return;
        }
        
        pingAttempts++;
        if (pingAttempts >= MAX_PING_ATTEMPTS) {
          clearInterval(pingInterval);
        }
      }
    }
    
    // Start pinging every 20 seconds
    pingInterval = setInterval(ping, 20000);
    
    // Store the interval ID in state for cleanup
    state.pingInterval = pingInterval;
    
    // Do an initial ping
    ping();
  }
  
  // Add this function to initialize the extension properly
  function initializeExtension() {
    console.log('CONTENT: Initializing extension');
    
    // Create ghost text element
    createGhostText();
    
    // Set up event listeners
    setupEventListeners();
    
    // Start keep-alive ping
    startKeepAlivePing();
    
    // Mark as initialized
    state.isInitialized = true;
    
    console.log('CONTENT: Extension initialized successfully');
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      try {
        console.log('CONTENT: Received message:', request.action || request.type);
        
        // Handle ping to check if content script is loaded
        if (request.action === 'ping') {
          console.log('CONTENT: Ping received, sending response');
          sendResponse({ status: 'ok' });
          return true;
        }
        
        return true;
      } catch (error) {
        console.error('CONTENT: Error handling message:', error);
        sendResponse({ success: false, error: error.message });
        return true;
      }
    });
  }
  
  // Call initialize when the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    // DOM is already ready
    initializeExtension();
  }
}

// Improve getPageContext to gather more detailed information
function getPageContext() {
  try {
    // Get URL and domain
    const url = window.location.href;
    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch (e) {
      console.error('CONTENT: Error parsing URL:', e);
    }
    
    // Get page title and clean it
    const title = document.title;
    
    // Detect page type with more precision
    const pageType = detectPageType();
    
    // Create base context object
    const context = {
      url: url,
      domain: domain,
      title: title,
      pageType: pageType,
      conversationHistory: [],
      lastMessage: '',
      messageCount: 0,
      timestamp: Date.now()
    };
    
    // Enhanced context for job sites
    if (pageType === 'job') {
      // Extract job-specific information
      const jobTitle = document.querySelector('h1, .job-title, [data-testid="job-title"]')?.textContent.trim() || '';
      const companyName = document.querySelector('.company-name, [data-testid="company-name"]')?.textContent.trim() || '';
      const jobDescription = document.querySelector('.job-description, [data-testid="job-description"]')?.textContent.trim() || '';
      
      // Add to context
      context.jobTitle = jobTitle;
      context.companyName = companyName;
      context.jobSummary = jobDescription.substring(0, 200) + (jobDescription.length > 200 ? '...' : '');
      
      // Extract job ID from URL if available
      const jobIdMatch = url.match(/job_listing_id=(\d+)/);
      if (jobIdMatch && jobIdMatch[1]) {
        context.jobId = jobIdMatch[1];
      }
    }
    
    // Get conversation history for chat interfaces
    const messageElements = document.querySelectorAll([
      '.message', 
      '.chat-message',
      '[role="message"]',
      '.message-bubble',
      '.message-content',
      '[data-testid="message-bubble"]',
      '[data-testid="message-content"]'
    ].join(','));

    if (messageElements.length > 0) {
      // Get last 3 messages for context
      const recentMessages = Array.from(messageElements)
        .slice(-3)
        .map(el => ({
          text: el.textContent.trim(),
          timestamp: el.querySelector('time')?.textContent || '',
          isOutgoing: el.classList.contains('outgoing') || el.closest('[data-testid="outgoing-message"]') !== null
        }));

      context.conversationHistory = recentMessages;
      context.lastMessage = recentMessages[recentMessages.length - 1]?.text || '';
      context.messageCount = messageElements.length;
    }

    console.log('CONTENT: Page context gathered:', context);
    return context;
  } catch (error) {
    console.error('CONTENT: Error getting page context:', error);
    return {
      url: window.location.href,
      title: document.title
    };
  }
}

// Add detectPageType function if it doesn't exist
function detectPageType() {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();
  
  // Check for email services
  if (url.includes('mail.') || url.includes('gmail') || url.includes('outlook')) {
    return 'email';
  }
  
  // Check for social media
  if (url.includes('twitter') || url.includes('facebook') || 
      url.includes('linkedin') || url.includes('instagram')) {
    return 'social';
  }
  
  // Check for job sites
  if (url.includes('job') || url.includes('career') || url.includes('wellfound') || 
      url.includes('indeed') || url.includes('glassdoor')) {
    return 'job';
  }
  
  // Check for chat interfaces
  if (url.includes('chat') || url.includes('message') || 
      document.querySelector('.chat') || document.querySelector('.messages')) {
    return 'chat';
  }
  
  return 'general';
  }