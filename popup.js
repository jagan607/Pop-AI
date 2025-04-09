document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');

  function showStatus(message, type = 'success') {
    statusElement.className = `status ${type}`;
    
    const icon = type === 'success' ? '✓' : '!';
    statusElement.innerHTML = `
      <div class="status-icon">${icon}</div>
      <div>${message}</div>
    `;
  }

  // Check if extension is working
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || tabs.length === 0) {
      showStatus('No active tab found', 'error');
      return;
    }
    
    const activeTab = tabs[0];
    
    // Check if content script is loaded
    chrome.tabs.sendMessage(activeTab.id, { action: 'ping' }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Content script not loaded:', chrome.runtime.lastError);
        showStatus('Extension not active on this page. Try refreshing.', 'error');
        
        // Try to inject the content script
        chrome.runtime.sendMessage({
          type: 'injectContentScript',
          tabId: activeTab.id
        });
        
        return;
      }
      
      showStatus('Extension is active and ready');
    });
  });
}); 