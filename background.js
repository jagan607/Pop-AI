console.log('BACKGROUND: Script started - v1.0.3');

// Add this debugging function
function debugLog(message, data) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] BACKGROUND: ${message}`, data || '');
}

// Keep the service worker alive
function keepAlive() {
  debugLog('Keeping service worker alive');
  setTimeout(keepAlive, 20000); // Ping every 20 seconds
}
keepAlive();

// Track which tabs have content scripts
const tabsWithContentScript = new Set();

// Ensure storage permission is available
let hasStoragePermission = false;
try {
  hasStoragePermission = chrome.storage && chrome.storage.local;
  debugLog('Storage API available:', !!hasStoragePermission);
} catch (e) {
  console.error('Storage API not available:', e);
}


// Global variables
const suggestionCache = new Map();
const pendingRequests = new Map();
const linkedInRequestsInProgress = new Map();

// OpenAI API configuration
const API_CONFIG = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-3.5-turbo'
};

// Your OpenAI API key - replace with your actual key
const openAIKey = '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';

// Add this function definition before getSuggestion
function getIntelligentSuggestion(text, context) {
  debugLog('Getting intelligent suggestion with context:', context);
  
  // Extract domain and page type from context
  const domain = context.domain || '';
  const pageType = context.pageType || 'general';
  
  // If we have conversation history, use it for better suggestions
  if (context.conversationHistory?.length > 0) {
    const lastMessage = context.lastMessage || '';
    const isFollowUp = context.conversationHistory.some(msg => 
      msg.text.toLowerCase().includes('follow') && msg.text.toLowerCase().includes('up')
    );
    
    // Handle follow-up messages
    if (isFollowUp) {
      if (text.toLowerCase().includes('regarding') || text.toLowerCase().includes('about')) {
        return "our previous discussion and see if you have any updates.";
      }
      return "and check on the status of our previous conversation.";
    }
    
    // Handle responses to specific message types
    if (lastMessage.toLowerCase().includes('discord')) {
      return "and I'm looking forward to collaborating on the platform.";
    }
    
    if (lastMessage.toLowerCase().includes('next steps')) {
      return "and I'm ready to proceed with the next phase of the process.";
    }
  }
  
  // Check if we're on a job application site
  if (pageType === 'job' || domain.includes('linkedin') || domain.includes('indeed') || 
      domain.includes('wellfound') || domain.includes('glassdoor') || domain.includes('ziprecruiter')) {
    
    // Job application completions
    if (text.toLowerCase().includes('what interests me')) {
      return "the opportunity to apply my skills in a collaborative environment where I can contribute to meaningful projects";
    }
    
    if (text.toLowerCase().includes('my experience with')) {
      return "developing scalable solutions has taught me the importance of clean code and effective communication";
    }
    
    if (text.toLowerCase().includes('i am passionate about')) {
      return "solving complex problems and continuously learning new technologies to improve my skillset";
    }
    
    if (text.toLowerCase().includes('my goal is')) {
      return "to join a team where I can both contribute value and grow professionally";
    }
  }
  
  // Email completions
  if (pageType === 'email' || domain.includes('gmail') || domain.includes('outlook') || domain.includes('mail')) {
    if (text.toLowerCase().includes('thank you for your')) {
      return "consideration. I look forward to hearing from you soon.";
    }
    
    if (text.toLowerCase().includes('i hope this email')) {
      return "finds you well. I wanted to reach out regarding";
    }
    
    if (text.toLowerCase().includes('please let me know')) {
      return "if you need any additional information or have any questions.";
    }
    
    if (text.toLowerCase().includes('best regards')) {
      return "\n[Your Name]";
    }
  }
  
  // Social media completions
  if (pageType === 'social' || domain.includes('twitter') || domain.includes('facebook') || 
      domain.includes('linkedin') || domain.includes('instagram')) {
    if (text.toLowerCase().includes('i am excited to')) {
      return "share that I've recently joined [Company] as a [Position]";
    }
    
    if (text.toLowerCase().includes('looking for recommendations')) {
      return "for tools or resources related to [specific area]";
    }
  }
  
  // Generic completions for any context
  if (text.toLowerCase().includes('i would like to')) {
    return "request more information about your services";
  }
  
  if (text.toLowerCase().includes('please find attached')) {
    return "the documents you requested";
  }
  
  if (text.toLowerCase().endsWith('i think')) {
    return " this approach would be beneficial because";
  }
  
  // Return null if no intelligent suggestion found
  return null;
}

function getSimpleSuggestion(text, context) {
  // Check if the text ends with any of our phrase starters
  for (const [phrase, completion] of Object.entries(commonPhrases)) {
    if (text.trim().endsWith(phrase)) {
      return completion;
    }
  }
  
  
  return null;
}

// Add this function to process context for better suggestions
function processContext(context) {
  // Create a processed context object
  const processedContext = {
    url: context.url || '',
    title: context.title || '',
    domain: '',
    inputType: context.inputType || 'text',
    headings: context.headings || '',
    labels: context.labels || '',
    placeholders: context.placeholders || ''
  };
  
  // Extract domain from URL
  if (processedContext.url) {
    try {
      const urlObj = new URL(processedContext.url);
      processedContext.domain = urlObj.hostname;
    } catch (e) {
      console.error('Error parsing URL:', e);
    }
  }
  
  // Determine content type based on domain and other factors
  let contentType = 'general';
  
  // Email domains
  if (processedContext.domain.includes('mail.') || 
      processedContext.domain.includes('gmail') || 
      processedContext.domain.includes('outlook') ||
      processedContext.domain.includes('yahoo.com')) {
    contentType = 'email';
  }
  
  // Social media
  else if (processedContext.domain.includes('twitter') || 
           processedContext.domain.includes('facebook') || 
           processedContext.domain.includes('instagram') ||
           processedContext.domain.includes('linkedin')) {
    contentType = 'social';
  }
  
  // Professional/work
  else if (processedContext.domain.includes('docs.google') || 
           processedContext.domain.includes('notion') || 
           processedContext.domain.includes('slack') ||
           processedContext.domain.includes('office') ||
           processedContext.domain.includes('teams')) {
    contentType = 'professional';
  }
  
  // Add content type to processed context
  processedContext.contentType = contentType;
  
  debugLog('Processed context:', processedContext);
  return processedContext;
}

// Update createContextualPrompt function to better utilize context
function createContextualPrompt(text, context) {
  debugLog('Creating contextual prompt with enhanced context', {
    textLength: text?.length || 0,
    context: context
  });
  
  // Create a base prompt
  let prompt = `
Complete the following text with a natural, helpful continuation. Remember, you are writing for a human, not a machine and write it as you are the user and you are writing to yourself. You are not the website owner, you are the user.
Keep the continuation concise (1-2 sentences max).

Context:
- Website: ${context.domain || 'Unknown'}
- Page title: ${context.title || 'Unknown'}
- Page type: ${context.pageType || 'Unknown'}
`;

  // Add job-specific context if available
  if (context.pageType === 'job') {
    prompt += `
- Job context: The user is viewing a job listing${context.jobTitle ? ` for "${context.jobTitle}"` : ''}${context.companyName ? ` at ${context.companyName}` : ''}.
- Job ID: ${context.jobId || 'Unknown'}
- Job summary: ${context.jobSummary || 'Not available'}
`;
  }
  
  // Add conversation history if available
  if (context.conversationHistory?.length > 0) {
    prompt += '\nRecent messages:\n';
    context.conversationHistory.forEach(msg => {
      prompt += `- ${msg.isOutgoing ? 'You' : 'Other'}: ${msg.text}\n`;
    });
    
    // Add last message for more context
    if (context.lastMessage) {
      prompt += `\nMost recent message: "${context.lastMessage}"\n`;
    }
  }
  
  // Add special handling for common phrases in job applications
  if (context.pageType === 'job' && text.toLowerCase().includes('what interests me about')) {
    prompt += `
Special instruction: The user is writing about what interests them in this job opportunity. Complete their thought with a professional, enthusiastic response that mentions working at an early-stage startup where I can make a meaningful impact, contribute to product development, and grow alongside a passionate, fast-moving team.
`;
  }
  
  prompt += `\nText to complete: "${text}"`;
  
  debugLog('Created enhanced contextual prompt', { promptLength: prompt.length });
  return prompt;
}

// Update fetchOpenAISuggestion to log the full context and prompt
function fetchOpenAISuggestion(prompt, context) {
  debugLog('Fetching OpenAI suggestion', { 
    promptLength: prompt.length,
    contextDomain: context.domain,
    hasConversationHistory: !!context.conversationHistory?.length
  });
  
  return new Promise((resolve, reject) => {
    try {
      // Log the full prompt for debugging
      debugLog('Full prompt being sent to OpenAI:', prompt);
      
      fetch(API_CONFIG.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIKey}`
        },
        body: JSON.stringify({
          model: API_CONFIG.model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that provides natural text completions.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 100,
          temperature: 0.7
        })
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            throw new Error(`API error: ${errorData.error?.message || response.status}`);
          });
        }
        return response.json();
      })
      .then(data => {
        const suggestion = data.choices[0].message.content.trim();
        debugLog('Received suggestion from OpenAI', { suggestion });
        resolve(suggestion);
      })
      .catch(error => {
        console.error('Error fetching from OpenAI:', error);
        reject(error);
      });
    } catch (error) {
      console.error('Error in fetchOpenAISuggestion:', error);
      reject(error);
    }
  });
}

// Update getSuggestion function to better process context
function getSuggestion(text, context) {
  debugLog('Getting suggestion with enhanced context processing', {
    textLength: text?.length || 0,
    domain: context.domain,
    pageType: context.pageType
  });
  
  // Don't suggest if text is too short
  if (!text || text.length < 3) {
    debugLog('Text too short for suggestion');
    return Promise.resolve(null);
  }
  
  // Check for quick suggestions first (no API call)
  const quickSuggestion = getQuickSuggestion(text, context);
  if (quickSuggestion) {
    debugLog('Using quick suggestion', { suggestion: quickSuggestion });
    return Promise.resolve({ suggestion: quickSuggestion });
  }
  
  // Check for job-specific phrases
  if (context.pageType === 'job') {
    // Job application completions
    if (text.toLowerCase().includes('what interests me about')) {
      const jobSuggestion = "this role is the opportunity to work at an early-stage startup where I can make a meaningful impact, contribute to product development, and grow alongside a passionate, fast-moving team.";
      debugLog('Using job-specific suggestion', { suggestion: jobSuggestion });
      return Promise.resolve({ suggestion: jobSuggestion });
    }
  }
  
  // Check cache for recent suggestions
  const cacheKey = text.trim().toLowerCase();
  if (suggestionCache.has(cacheKey)) {
    debugLog('Returning cached suggestion');
    return Promise.resolve({ suggestion: suggestionCache.get(cacheKey) });
  }
  
  // Create a prompt based on context and text
  const prompt = createContextualPrompt(text, context);
  
  // Call OpenAI API
  return fetchOpenAISuggestion(prompt, context)
    .then(suggestion => {
      if (suggestion) {
        suggestionCache.set(cacheKey, suggestion);
      }
      return { suggestion };
    });
}

// Process enhanced context from content script
function processEnhancedContext(context) {
  const processedContext = {
    inputPurpose: detectInputPurpose(context),
    pageType: detectPageType(context),
    contentCategory: detectContentCategory(context),
    userIntent: detectUserIntent(context)
  };
  
  debugLog('Processed context:', processedContext);
  return processedContext;
}

// Detect the purpose of the input field
function detectInputPurpose(context) {
  // Use semantic clues to determine input purpose
  const semanticContext = tryParseJSON(context.semanticContext, {});
  const textContext = semanticContext.textContext || {};
  const formContext = semanticContext.formContext || {};
  
  // Combine all text clues
  const allText = [
    context.placeholder || '',
    context.inputId || '',
    context.inputName || '',
    context.inputClass || '',
    textContext.label || '',
    textContext.nearbyText || '',
    formContext.formTitle || '',
    formContext.formAction || ''
  ].join(' ').toLowerCase();
  
  // Detect purpose based on text clues
  if (/email|message|comment|feedback|review/i.test(allText)) return 'communication';
  if (/search|find|query|look/i.test(allText)) return 'search';
  if (/name|first|last|full/i.test(allText)) return 'identity';
  if (/address|location|city|state|zip|postal/i.test(allText)) return 'location';
  if (/bio|about|profile|description/i.test(allText)) return 'bio';
  if (/question|ask|inquiry/i.test(allText)) return 'question';
  if (/answer|response|reply/i.test(allText)) return 'answer';
  if (/post|share|update|status/i.test(allText)) return 'social';
  
  // Default to generic text input
  return 'text';
}

// Detect the type of page
function detectPageType(context) {
  if (!context.url) return 'unknown';
  
  try {
    const url = new URL(context.url);
    const domain = url.hostname;
    const path = url.pathname;
    
    // Check for common patterns in the URL and page title
    const title = (context.title || '').toLowerCase();
    const fullUrl = context.url.toLowerCase();
    
    // Detect page type based on URL and title patterns
    if (/mail|inbox|compose|message|chat/i.test(fullUrl) || /mail|inbox|compose|message|chat/i.test(title)) {
      return 'communication';
    }
    
    if (/job|career|employ|hire|recruit|apply/i.test(fullUrl) || /job|career|employ|hire|recruit|apply/i.test(title)) {
      return 'job';
    }
    
    if (/profile|account|user|settings|preferences/i.test(fullUrl) || /profile|account|user|settings|preferences/i.test(title)) {
      return 'profile';
    }
    
    if (/search|find|results|query/i.test(fullUrl) || /search|find|results|query/i.test(title)) {
      return 'search';
    }
    
    if (/shop|store|product|item|buy|purchase|cart|checkout/i.test(fullUrl) || /shop|store|product|item|buy|purchase|cart|checkout/i.test(title)) {
      return 'shopping';
    }
    
    if (/blog|article|post|news|story/i.test(fullUrl) || /blog|article|post|news|story/i.test(title)) {
      return 'content';
    }
    
    if (/form|survey|questionnaire|application/i.test(fullUrl) || /form|survey|questionnaire|application/i.test(title)) {
      return 'form';
    }
    
    // Default to generic web page
    return 'general';
  } catch (e) {
    debugLog('Error detecting page type:', e.message);
    return 'unknown';
  }
}

// General suggestion function with improved context awareness
function getGeneralSuggestion(text, context) {
  // Extract the last sentence or phrase
  const lastSentence = text.split(/[.!?]\s+/).pop() || text;
  const lastWords = lastSentence.trim().split(/\s+/);
  
  // Use the detected input purpose for better suggestions
  if (context.inputPurpose) {
    switch (context.inputPurpose) {
      case 'communication':
        if (lastWords.length <= 3 && lastSentence.toLowerCase().includes('hi')) {
          return ", thanks for reaching out! I'm interested in discussing ";
        }
        
        if (lastSentence.toLowerCase().includes('thank')) {
          return " you for your time and consideration.";
        }
        
        if (lastSentence.toLowerCase().includes('please')) {
          return " let me know if you have any questions.";
        }
        
        if (lastSentence.toLowerCase().includes('looking forward')) {
          return " to hearing from you soon.";
        }
        
        return " I would be happy to discuss this further.";
        
      case 'bio':
        return " with extensive experience in this field.";
        
      case 'question':
        return " about this specific situation?";
        
      case 'answer':
        return " based on my experience and knowledge.";
        
      case 'search':
        return " related to my recent interests";
        
      case 'social':
        return " and I'd love to hear your thoughts on this.";
    }
  }
  
  // Use page type for context if input purpose didn't yield a result
  if (context.pageType) {
    switch (context.pageType) {
      case 'communication':
        return " and I look forward to your response.";
        
      case 'job':
        return " and I'm excited about this opportunity.";
        
      case 'profile':
        return " and I'm always looking to connect with like-minded professionals.";
        
      case 'content':
        return " which I found particularly interesting.";
        
      case 'form':
        return " as requested in this application.";
    }
  }
  
  // Default suggestion
  return " and I would appreciate your feedback on this.";
}

// Helper function to safely parse JSON
function tryParseJSON(jsonString, defaultValue) {
  try {
    return jsonString ? JSON.parse(jsonString) : defaultValue;
  } catch (e) {
    debugLog('Error parsing JSON:', e.message);
    return defaultValue;
  }
}

// Detect content category based on context
function detectContentCategory(context) {
  // Implementation similar to detectPageType but focused on content
  return 'general';
}

// Detect user intent based on context and text
function detectUserIntent(context) {
  // Implementation to determine what the user is trying to accomplish
  return 'writing';
}

// Quick suggestion function for common phrases (no API call)
function getQuickSuggestion(text, context) {
  const lastFewWords = text.trim().split(/\s+/).slice(-3).join(' ');
  
  // Common phrases based on recent words
  const commonPhrases = {
    "I think": " that we should consider ",
    "In my opinion": ", the best approach would be ",
    "Please": " let me know if you need any further information.",
    "Thank you": " for your assistance with this matter.",
    "I would like to": " discuss this further at your convenience.",
    "I am": " looking forward to your response.",
    "We need to": " address this issue as soon as possible.",
    "Let me": " know what you think about this proposal.",
    "I hope": " this email finds you well.",
    "Best": " regards,",
    "Looking forward": " to hearing from you soon.",
    "As discussed": ", I'm sending you the information about ",
    "With reference to": " our conversation earlier, ",
    "I wanted to": " follow up on our previous discussion about ",
    "Do you": " have any thoughts on this matter?",
    "Could you": " please provide more details about ",
    "I've attached": " the documents you requested.",
    "I'm writing": " to inquire about "
  };
  
  // Check if the text ends with any of our phrase starters
  for (const [phrase, completion] of Object.entries(commonPhrases)) {
    if (text.trim().endsWith(phrase)) {
      return completion;
    }
  }
  
  return null; // No quick suggestion found
}



// Add similar functions for other domains
// ...

// Generate LinkedIn post
async function generateLinkedInPost(topic) {
  debugLog('Generating LinkedIn post for topic:', topic);
  
  if (linkedInRequestsInProgress.has(topic)) {
    debugLog('LinkedIn post generation already in progress for this topic');
    return "Generation in progress. Please wait...";
  }
  
  linkedInRequestsInProgress.set(topic, true);
  
  try {
    // For testing without API calls
    // REMOVE THIS IN PRODUCTION
    const testPosts = [
      `🚀 Excited to share my thoughts on ${topic}!\n\nOver the past few weeks, I've been exploring how ${topic} is transforming the way we work. The potential for innovation is incredible.\n\nWhat are your experiences with ${topic}? Let's connect and discuss!\n\n#${topic.replace(/\s+/g, '')} #Innovation #ProfessionalDevelopment`,
      `I've been thinking a lot about ${topic} lately.\n\nIn today's rapidly evolving landscape, understanding ${topic} is more crucial than ever. It's not just about staying current—it's about preparing for what's next.\n\nWho else is passionate about ${topic}? I'd love to hear your insights!\n\n#${topic.replace(/\s+/g, '')} #FutureOfWork #Networking`
    ];
    
    const mockPost = testPosts[Math.floor(Math.random() * testPosts.length)];
    debugLog('Generated test LinkedIn post');
    
    // Remove from in-progress tracking
    linkedInRequestsInProgress.delete(topic);
    
    return mockPost;
    
    /* UNCOMMENT THIS FOR PRODUCTION
    const response = await fetch(API_CONFIG.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKey}`
    },
    body: JSON.stringify({
        model: API_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional LinkedIn content creator. Create engaging, professional LinkedIn posts that are optimized for engagement.'
          },
          {
            role: 'user',
            content: `Write a LinkedIn post about ${topic}. Include relevant hashtags and make it engaging with emojis and formatting.`
          }
        ],
        max_tokens: 500,
        temperature: 0.7
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
      throw new Error(`API error: ${errorData.error?.message || response.status}`);
  }
  
  const data = await response.json();
    const post = data.choices[0].message.content.trim();
    
    // Remove from in-progress tracking
    linkedInRequestsInProgress.delete(topic);
    
    debugLog('Generated LinkedIn post successfully');
    return post;
    */
  } catch (error) {
    debugLog('LinkedIn post generation error:', error.message);
    linkedInRequestsInProgress.delete(topic);
    return "⚠️ Failed to generate post. Please try again later.";
  }
}

// Improve message handling in the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    // Handle ping requests
    if (request.type === 'ping') {
      debugLog('Received ping from content script');
      try {
        sendResponse({ status: 'ok' });
      } catch (error) {
        // Silently handle context invalidation errors
        if (error.message && error.message.includes('Extension context invalidated')) {
          debugLog('Extension context invalidated while responding to ping');
        } else {
          console.error('Error sending ping response:', error);
        }
      }
      return true;
    }
    
    // Handle getSuggestion requests
    if (request.type === 'getSuggestion') {
      debugLog('Received suggestion request', {
        textLength: request.text?.length || 0,
        url: request.url?.substring(0, 30) + '...',
        title: request.title
      });
      
      // Get suggestion with context
      getSuggestion(request.text, request)
        .then(response => {
          try {
            sendResponse(response);
          } catch (error) {
            // Silently handle context invalidation errors
            if (error.message && error.message.includes('Extension context invalidated')) {
              debugLog('Extension context invalidated while sending suggestion response');
            } else {
              console.error('Error sending suggestion response:', error);
            }
          }
        })
        .catch(error => {
          try {
            console.error('Error in getSuggestion:', error);
            sendResponse({ suggestion: null, error: error.message });
          } catch (sendError) {
            // Silently handle context invalidation errors
            if (sendError.message && sendError.message.includes('Extension context invalidated')) {
              debugLog('Extension context invalidated while sending error response');
            } else {
              console.error('Error sending error response:', sendError);
            }
          }
        });
      
      return true; // Keep the message channel open for async response
    }
    
    // Handle injectContentScript requests
    if (request.type === 'injectContentScript') {
      const tabId = request.tabId;
      debugLog('Injecting content script into tab', tabId);
      
      injectContentScript(tabId)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('Error injecting content script:', error);
          sendResponse({ success: false, error: error.message });
        });
      
      return true;
    }
    
    // Handle suggestionAccepted feedback
    if (request.action === 'suggestionAccepted') {
      debugLog('Suggestion accepted by user');
      // You could implement analytics or learning here
      sendResponse({ status: 'ok' });
      return true;
    }
    
    // Handle suggestionRejected feedback
    if (request.type === 'suggestionRejected') {
      debugLog('Suggestion rejected by user', {
        text: request.text?.substring(0, 30) + '...',
        suggestion: request.suggestion
      });
      // You could implement analytics or learning here
      sendResponse({ status: 'ok' });
      return true;
    }
    
    return true;
  } catch (error) {
    console.error('Error handling message:', error);
    try {
      sendResponse({ success: false, error: error.message });
    } catch (sendError) {
      // Silently handle context invalidation errors
    }
    return true;
  }
});

// Improved content script injection
function injectContentScript(tabId) {
  debugLog(`Injecting content script into tab ${tabId}`);
  
  // First inject the CSS
  chrome.scripting.insertCSS({
    target: {tabId: tabId},
    files: ['styles.css']
  }).then(() => {
    debugLog(`CSS injected into tab ${tabId}`);
    
    // Then inject the JS
    return chrome.scripting.executeScript({
      target: {tabId: tabId},
      files: ['content.js']
    });
  }).then(() => {
    debugLog(`Content script successfully injected into tab ${tabId}`);
    tabsWithContentScript.add(tabId);
  }).catch(err => {
    console.error(`Error injecting into tab ${tabId}:`, err);
  });
}

// Ensure we inject on all tabs when extension loads
chrome.tabs.query({url: ['http://*/*', 'https://*/*']}, (tabs) => {
  for (const tab of tabs) {
    injectContentScript(tab.id);
  }
});

// Replace the existing tabs.onUpdated listener with this improved version
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    debugLog(`Tab ${tabId} updated, injecting content script`);
    injectContentScript(tabId);
  }
});

// Also inject when the extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  debugLog('Extension installed or updated:', details.reason);
  
  // Inject into all existing tabs
  chrome.tabs.query({url: ['http://*/*', 'https://*/*']}, (tabs) => {
    for (const tab of tabs) {
      injectContentScript(tab.id);
    }
  });
});

// Initialize
debugLog('POP AI 1.0.3 initializing...');