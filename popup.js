// Popup script

class PopupManager {
  constructor() {
    this.init();
  }

  async init() {
    this.setupTabs();
    this.setupAddForms();
    this.setupActions();
    await this.loadLists();
  }

  setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(`${tab.dataset.tab}-section`).classList.add('active');
      });
    });
  }

  setupAddForms() {
    // Watched keywords
    document.getElementById('add-watched').addEventListener('click', () => {
      const input = document.getElementById('watched-input');
      if (input.value.trim()) {
        this.addKeyword('watchedKeywords', input.value.trim());
        input.value = '';
      }
    });

    document.getElementById('watched-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('add-watched').click();
      }
    });

    // Excluded keywords
    document.getElementById('add-excluded').addEventListener('click', () => {
      const input = document.getElementById('excluded-input');
      if (input.value.trim()) {
        this.addKeyword('excludedKeywords', input.value.trim());
        input.value = '';
      }
    });

    document.getElementById('excluded-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('add-excluded').click();
      }
    });
  }

  setupActions() {
    // Export
    document.getElementById('export-btn').addEventListener('click', async () => {
      const data = await chrome.storage.local.get(['watchedKeywords', 'excludedKeywords']);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ebay-keywords-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import
    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          if (data.watchedKeywords || data.excludedKeywords) {
            await chrome.storage.local.set({
              watchedKeywords: data.watchedKeywords || [],
              excludedKeywords: data.excludedKeywords || []
            });
            await this.loadLists();
            alert('インポート完了！');
          }
        } catch (err) {
          alert('ファイルの読み込みに失敗しました');
        }
      }
    });
  }

  async loadLists() {
    const data = await chrome.storage.local.get(['watchedKeywords', 'excludedKeywords']);

    const watchedCount = (data.watchedKeywords || []).length;
    const excludedCount = (data.excludedKeywords || []).length;

    this.renderList('watched-list', data.watchedKeywords || [], 'watchedKeywords');
    this.renderList('excluded-list', data.excludedKeywords || [], 'excludedKeywords');

    // Update counts
    document.getElementById('watched-count').textContent = `(${watchedCount})`;
    document.getElementById('excluded-count').textContent = `(${excludedCount})`;
  }

  renderList(containerId, keywords, listName) {
    const container = document.getElementById(containerId);

    if (keywords.length === 0) {
      container.innerHTML = '<div class="empty">キーワードがありません</div>';
      return;
    }

    container.innerHTML = keywords.map(keyword => `
      <div class="keyword-item">
        <span>${this.escapeHtml(keyword)}</span>
        <button data-keyword="${this.escapeHtml(keyword)}" data-list="${listName}" title="削除">×</button>
      </div>
    `).join('');

    // Add delete handlers
    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeKeyword(btn.dataset.list, btn.dataset.keyword);
      });
    });
  }

  async addKeyword(listName, keyword) {
    const data = await chrome.storage.local.get([listName]);
    const list = data[listName] || [];

    if (!list.map(k => k.toLowerCase()).includes(keyword.toLowerCase())) {
      list.push(keyword);
      await chrome.storage.local.set({ [listName]: list });
      await this.loadLists();
    }
  }

  async removeKeyword(listName, keyword) {
    const data = await chrome.storage.local.get([listName]);
    const list = data[listName] || [];
    const filtered = list.filter(k => k.toLowerCase() !== keyword.toLowerCase());
    await chrome.storage.local.set({ [listName]: filtered });
    await this.loadLists();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => new PopupManager());
