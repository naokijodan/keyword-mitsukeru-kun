// Background service worker

// Initialize default data on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['watchedKeywords', 'excludedKeywords']);

  if (!data.watchedKeywords) {
    // Some common luxury brand examples to start with
    await chrome.storage.local.set({
      watchedKeywords: [
        'CHANEL',
        'HERMES',
        'Louis Vuitton',
        'GUCCI',
        'PRADA',
        'TIFFANY',
        'Cartier',
        'Dior',
        'BVLGARI',
        'Rolex'
      ]
    });
  }

  if (!data.excludedKeywords) {
    await chrome.storage.local.set({
      excludedKeywords: []
    });
  }
});

// Context menu for right-click functionality
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'add-watched',
    title: '注目キーワードに追加',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'add-excluded',
    title: '除外キーワードに追加',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  if (info.menuItemId === 'add-watched') {
    const data = await chrome.storage.local.get(['watchedKeywords']);
    const list = data.watchedKeywords || [];
    if (!list.map(k => k.toLowerCase()).includes(selectedText.toLowerCase())) {
      list.push(selectedText);
      await chrome.storage.local.set({ watchedKeywords: list });
    }
  } else if (info.menuItemId === 'add-excluded') {
    const data = await chrome.storage.local.get(['excludedKeywords']);
    const list = data.excludedKeywords || [];
    if (!list.map(k => k.toLowerCase()).includes(selectedText.toLowerCase())) {
      list.push(selectedText);
      await chrome.storage.local.set({ excludedKeywords: list });
    }
  }

  // Notify content script to refresh
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'refresh' }).catch(() => {});
  }
});
