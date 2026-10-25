// Motion Studio AI - RunningHub BRE Service Worker (Manifest V3)

function setupHeaderRules() {
  try {
    if (chrome && chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateDynamicRules) {
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1, 2],
        addRules: [
          {
            id: 1,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [
                { header: 'Origin', operation: 'set', value: 'https://www.runninghub.ai' },
                { header: 'Referer', operation: 'set', value: 'https://www.runninghub.ai/' }
              ],
              responseHeaders: [
                { header: 'Access-Control-Allow-Origin', operation: 'set', value: '*' }
              ]
            },
            condition: {
              urlFilter: '||runninghub.ai',
              resourceTypes: ['xmlhttprequest', 'media', 'image', 'other']
            }
          },
          {
            id: 2,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [
                { header: 'Referer', operation: 'set', value: 'https://www.runninghub.ai/' }
              ],
              responseHeaders: [
                { header: 'Access-Control-Allow-Origin', operation: 'set', value: '*' }
              ]
            },
            condition: {
              urlFilter: '||xiaoyaoyou.com',
              resourceTypes: ['xmlhttprequest', 'media', 'image', 'other']
            }
          }
        ]
      });
    }
  } catch (err) {
    console.warn('[Motion Studio BRE] Header rules setup skipped:', err);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  setupHeaderRules();
  // Automatically open full Motion Studio AI app tab upon installation in Kiwi Browser / Chrome
  if (details.reason === 'install') {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    } catch (e) {
      console.warn(e);
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  setupHeaderRules();
});

// Handle messages from the Extension UI
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({ status: 'PONG', version: '2.0.0' });
    return true;
  }

  if (request.action === 'OPEN_FULL_TAB') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'RH_DOWNLOAD_VIDEO' && request.url) {
    if (chrome.downloads && chrome.downloads.download) {
      chrome.downloads.download(
        {
          url: request.url,
          filename: request.filename || `motion_studio_${Date.now()}.mp4`,
          saveAs: false,
        },
        (downloadId) => {
          sendResponse({ ok: Boolean(downloadId), downloadId });
        }
      );
      return true;
    }
  }

  if (request.action === 'RH_FETCH_JSON' && request.url) {
    fetch(request.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request.payload || {}),
    })
      .then((res) => res.text())
      .then((text) => {
        try {
          const data = JSON.parse(text);
          sendResponse({ ok: true, data });
        } catch {
          sendResponse({ ok: false, error: 'Non-JSON response' });
        }
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || 'Fetch error' });
      });
    return true;
  }

  return false;
});
