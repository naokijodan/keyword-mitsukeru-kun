// eBay Keyword Highlighter - Content Script

class KeywordHighlighter {
  constructor() {
    this.watchedKeywords = [];
    this.excludedKeywords = [];
    this.processedElements = new WeakSet();
    this.tooltip = null;

    // Common words to ignore (not useful for discovery)
    this.commonWords = new Set([
      // General terms
      'new', 'used', 'vintage', 'rare', 'authentic', 'genuine', 'original',
      'free', 'shipping', 'fast', 'lot', 'set', 'pair', 'box', 'case',
      'size', 'color', 'style', 'type', 'model', 'edition', 'limited',
      'pre-owned', 'preowned', 'brand', 'with', 'without', 'and', 'the',
      'for', 'from', 'this', 'that', 'very', 'only', 'just', 'like',
      'item', 'items', 'listing', 'offer', 'price', 'buy', 'now', 'bid',
      'fixed', 'auction', 'best', 'accepted', 'returns', 'return',
      'about', 'approximately', 'around', 'over', 'under', 'more', 'less',

      // Colors
      'gold', 'silver', 'black', 'white', 'red', 'blue', 'green', 'brown',
      'pink', 'yellow', 'purple', 'gray', 'grey', 'beige', 'navy', 'cream',
      'multicolor', 'multi', 'tone', 'color', 'colour',

      // Materials
      'metal', 'leather', 'suede', 'silk', 'cotton', 'wool', 'nylon',
      'canvas', 'rubber', 'plastic', 'crystal', 'glass', 'wood', 'bamboo',
      'plate', 'plated', 'filled', 'solid', 'sterling', 'stainless',

      // Sizes & People
      'women', 'men', 'unisex', 'kids', 'adult', 'ladies', 'mens', 'womens',
      'small', 'medium', 'large', 'mini', 'big', 'tiny', 'huge', 'oversized',
      'xs', 'xl', 'xxl', 'one', 'two', 'three', 'four', 'five',

      // Countries
      'japan', 'usa', 'italy', 'france', 'germany', 'spain', 'uk', 'china',
      'korea', 'swiss', 'made', 'japanese', 'italian', 'french', 'american',

      // Jewelry terms
      'necklace', 'bracelet', 'ring', 'earrings', 'earring', 'watch', 'watches',
      'bag', 'bags', 'wallet', 'purse', 'handbag', 'clutch', 'tote', 'shoulder',
      'pendant', 'charm', 'chain', 'bangle', 'brooch', 'pin', 'cuff', 'hoop',
      'studs', 'clip', 'clasp', 'buckle', 'strap', 'band', 'link', 'links',
      'stone', 'stones', 'diamond', 'pearl', 'pearls', 'gem', 'gemstone',

      // Condition
      'auth', 'certificate', 'coa', 'receipt', 'dust', 'pouch', 'dustbag',
      'mint', 'excellent', 'good', 'fair', 'poor', 'condition', 'unused',

      // Measurements
      'inches', 'inch', 'cm', 'mm', 'grams', 'gram', 'ounce', 'oz',
      'carat', 'ct', 'karat', 'kt', 'length', 'width', 'height', 'weight',

      // Fashion
      'shirt', 'dress', 'pants', 'jeans', 'jacket', 'coat', 'sweater', 'top',
      'skirt', 'shorts', 'shoes', 'boots', 'heels', 'flats', 'sneakers',
      'scarf', 'hat', 'cap', 'belt', 'sunglasses', 'glasses', 'gloves',

      // Common adjectives
      'beautiful', 'gorgeous', 'stunning', 'elegant', 'classic', 'modern',
      'cute', 'pretty', 'lovely', 'nice', 'perfect', 'great', 'amazing',
      'super', 'real', 'true', 'full', 'half', 'double', 'single', 'triple',

      // eBay specific
      'listing', 'seller', 'buyer', 'feedback', 'positive', 'rated', 'top',
      'express', 'priority', 'standard', 'economy', 'international', 'domestic',
      'guaranteed', 'delivery', 'handling', 'days', 'day', 'business'
    ]);

    this.init();
  }

  async init() {
    await this.loadKeywords();
    this.observeDOM();
    this.highlightPage();
    this.setupTooltip();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.watchedKeywords || changes.excludedKeywords) {
        this.loadKeywords().then(() => {
          this.processedElements = new WeakSet();
          this.highlightPage();
        });
      }
    });
  }

  async loadKeywords() {
    const data = await chrome.storage.local.get(['watchedKeywords', 'excludedKeywords']);
    this.watchedKeywords = (data.watchedKeywords || []).map(k => k.toLowerCase());
    this.excludedKeywords = (data.excludedKeywords || []).map(k => k.toLowerCase());
  }

  // Extract potential keywords from text
  extractKeywords(text) {
    // Split by common delimiters
    const words = text.split(/[\s,\-\/\(\)\[\]\.]+/);
    const keywords = [];

    for (const word of words) {
      const cleaned = word.trim().replace(/['"!?:;]+/g, '');

      // Skip empty, too short, or too long
      if (!cleaned || cleaned.length < 2 || cleaned.length > 30) continue;

      // Skip pure numbers or numbers with units
      if (/^\d+$/.test(cleaned)) continue;
      if (/^\d+(\.\d+)?(cm|mm|g|oz|ct|kt|k|p|ml|l|in|inch)$/i.test(cleaned)) continue;

      // Skip common words
      if (this.commonWords.has(cleaned.toLowerCase())) continue;

      // Skip if already in our watched/excluded (will be handled separately)
      if (this.watchedKeywords.includes(cleaned.toLowerCase())) continue;
      if (this.excludedKeywords.includes(cleaned.toLowerCase())) continue;

      keywords.push(cleaned);
    }

    return [...new Set(keywords)]; // Remove duplicates
  }

  // Get title elements based on page type
  getTitleElements() {
    const elements = [];

    // Terapeak / Seller Hub Research results - Only the Listing column
    // Target the first column which contains product titles
    const terapeakTitles = document.querySelectorAll(
      // Seller Hub Research table - listing title cell
      '[data-test-id="listing-title"], ' +
      '.listing-title, ' +
      '.research__listing-title, ' +
      // Table structure - first cell with product link (not header)
      'table tbody tr td:first-child > a[href*="/itm/"], ' +
      'table tbody tr td:first-child > div > a[href*="/itm/"], ' +
      // Listing column specifically
      'td.listing a[href*="/itm/"], ' +
      'td[data-column="listing"] a'
    );
    elements.push(...terapeakTitles);

    // Regular eBay search results
    const searchTitles = document.querySelectorAll(
      '.s-item__title, ' +
      'h3.s-item__title, ' +
      '.srp-results .s-item__link span[role="heading"], ' +
      '.lvtitle a'
    );
    elements.push(...searchTitles);

    // Product page
    const productTitles = document.querySelectorAll(
      'h1.x-item-title__mainTitle span, ' +
      'h1[itemprop="name"]'
    );
    elements.push(...productTitles);

    return elements;
  }

  highlightPage() {
    const titleElements = this.getTitleElements();

    titleElements.forEach(element => {
      if (this.processedElements.has(element)) return;
      this.processedElements.add(element);

      this.highlightElement(element);
    });
  }

  highlightElement(element) {
    const originalText = element.textContent;
    const lowerText = originalText.toLowerCase();

    // Check if title contains any excluded keywords → Gray out entire title
    const hasExcluded = this.excludedKeywords.some(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );

    if (hasExcluded) {
      element.classList.add('ekh-excluded-title');
      return; // Don't process further
    }

    // Find watched keywords to highlight
    const watchedMatches = [];
    this.watchedKeywords.forEach(keyword => {
      const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
      let match;
      while ((match = regex.exec(originalText)) !== null) {
        watchedMatches.push({
          keyword: match[1],
          index: match.index,
          type: 'watched'
        });
      }
    });

    // Find new keywords to highlight
    const newKeywords = this.extractKeywords(originalText);
    const newMatches = [];
    newKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${this.escapeRegex(keyword)})\\b`, 'gi');
      let match;
      while ((match = regex.exec(originalText)) !== null) {
        // Make sure it doesn't overlap with watched keywords
        const overlaps = watchedMatches.some(w =>
          (match.index >= w.index && match.index < w.index + w.keyword.length) ||
          (w.index >= match.index && w.index < match.index + match[1].length)
        );
        if (!overlaps) {
          newMatches.push({
            keyword: match[1],
            index: match.index,
            type: 'new'
          });
        }
      }
    });

    // Combine and sort by index (descending to replace from end)
    const allMatches = [...watchedMatches, ...newMatches]
      .sort((a, b) => b.index - a.index);

    if (allMatches.length === 0) return;

    // Build new HTML
    let html = originalText;
    allMatches.forEach(match => {
      const before = html.substring(0, match.index);
      const after = html.substring(match.index + match.keyword.length);
      const className = match.type === 'watched' ? 'ekh-watched' : 'ekh-new';
      html = before + `<span class="${className}" data-keyword="${this.escapeHtml(match.keyword)}">${this.escapeHtml(match.keyword)}</span>` + after;
    });

    element.innerHTML = html;
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  observeDOM() {
    const observer = new MutationObserver((mutations) => {
      let shouldHighlight = false;

      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          shouldHighlight = true;
        }
      });

      if (shouldHighlight) {
        // Debounce
        clearTimeout(this.highlightTimeout);
        this.highlightTimeout = setTimeout(() => this.highlightPage(), 300);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setupTooltip() {
    document.addEventListener('click', (e) => {
      const keywordSpan = e.target.closest('.ekh-watched, .ekh-new');

      if (keywordSpan) {
        e.preventDefault();
        e.stopPropagation();
        this.showTooltip(keywordSpan, e);
      } else if (!e.target.closest('.ekh-tooltip')) {
        this.hideTooltip();
      }
    });

    // Hide tooltip on scroll
    document.addEventListener('scroll', () => this.hideTooltip(), true);
  }

  showTooltip(element, event) {
    this.hideTooltip();

    const keyword = element.dataset.keyword;
    const isWatched = element.classList.contains('ekh-watched');
    const rect = element.getBoundingClientRect();

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'ekh-tooltip';

    if (isWatched) {
      this.tooltip.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: bold;">"${keyword}"</div>
        <button class="exclude">✗ 除外に移動</button>
        <button class="remove">削除 (ハイライトなし)</button>
      `;
    } else {
      this.tooltip.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: bold;">"${keyword}"</div>
        <button class="watch">✓ 注目に追加</button>
        <button class="exclude">✗ 除外に追加</button>
      `;
    }

    // Position tooltip
    const tooltipX = Math.min(rect.left + window.scrollX, window.innerWidth - 200);
    const tooltipY = rect.bottom + window.scrollY + 5;

    this.tooltip.style.left = `${tooltipX}px`;
    this.tooltip.style.top = `${tooltipY}px`;

    document.body.appendChild(this.tooltip);

    // Button handlers
    const watchBtn = this.tooltip.querySelector('.watch');
    const excludeBtn = this.tooltip.querySelector('.exclude');
    const removeBtn = this.tooltip.querySelector('.remove');

    if (watchBtn) {
      watchBtn.addEventListener('click', () => {
        this.addToList('watchedKeywords', keyword);
        this.hideTooltip();
      });
    }

    if (excludeBtn) {
      excludeBtn.addEventListener('click', () => {
        if (isWatched) {
          this.moveToExcluded(keyword);
        } else {
          this.addToList('excludedKeywords', keyword);
        }
        this.hideTooltip();
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.removeFromList('watchedKeywords', keyword);
        this.hideTooltip();
      });
    }
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  async addToList(listName, keyword) {
    const data = await chrome.storage.local.get([listName]);
    const list = data[listName] || [];

    if (!list.map(k => k.toLowerCase()).includes(keyword.toLowerCase())) {
      list.push(keyword);
      await chrome.storage.local.set({ [listName]: list });
    }
  }

  async removeFromList(listName, keyword) {
    const data = await chrome.storage.local.get([listName]);
    const list = data[listName] || [];
    const filtered = list.filter(k => k.toLowerCase() !== keyword.toLowerCase());
    await chrome.storage.local.set({ [listName]: filtered });
  }

  async moveToExcluded(keyword) {
    await this.removeFromList('watchedKeywords', keyword);
    await this.addToList('excludedKeywords', keyword);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new KeywordHighlighter());
} else {
  new KeywordHighlighter();
}
