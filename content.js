// eBay Keyword Highlighter - Content Script

class KeywordHighlighter {
  constructor() {
    this.watchedKeywords = [];
    this.excludedKeywords = [];
    this.ignoredKeywords = [];
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
      if (changes.watchedKeywords || changes.excludedKeywords || changes.ignoredKeywords) {
        this.loadKeywords().then(() => {
          this.processedElements = new WeakSet();
          this.highlightPage();
        });
      }
    });
  }

  async loadKeywords() {
    const data = await chrome.storage.local.get(['watchedKeywords', 'excludedKeywords', 'ignoredKeywords']);
    this.watchedKeywords = (data.watchedKeywords || []).map(k => k.toLowerCase());
    this.excludedKeywords = (data.excludedKeywords || []).map(k => k.toLowerCase());
    this.ignoredKeywords = (data.ignoredKeywords || []).map(k => k.toLowerCase());
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

      // Skip if already in our watched/excluded/ignored (will be handled separately)
      if (this.watchedKeywords.includes(cleaned.toLowerCase())) continue;
      if (this.excludedKeywords.includes(cleaned.toLowerCase())) continue;
      if (this.ignoredKeywords.includes(cleaned.toLowerCase())) continue;

      keywords.push(cleaned);
    }

    return [...new Set(keywords)]; // Remove duplicates
  }

  // Get title elements based on page type
  getTitleElements() {
    const elements = [];

    // Terapeak / Seller Hub Research results
    // Product titles have data-item-id attribute
    const terapeakTitles = document.querySelectorAll(
      'span[data-item-id]'
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

    // Check if title contains watched keywords
    const hasWatched = this.watchedKeywords.some(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );

    // Check if title contains excluded keywords
    const hasExcluded = this.excludedKeywords.some(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );

    // Gray out only if excluded AND no watched keywords (watched takes priority)
    if (hasExcluded && !hasWatched) {
      element.classList.add('ekh-excluded-title');
      return; // Don't process further
    }

    // Process text nodes only to avoid breaking existing HTML structure
    this.highlightTextNodes(element);
  }

  highlightTextNodes(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim()) {
        textNodes.push(node);
      }
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      const fragments = this.createHighlightedFragments(text);

      if (fragments) {
        textNode.parentNode.replaceChild(fragments, textNode);
      }
    });
  }

  createHighlightedFragments(text) {
    // Find all matches
    const matches = [];

    // Watched keywords
    this.watchedKeywords.forEach(keyword => {
      const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          keyword: match[1],
          index: match.index,
          length: match[1].length,
          type: 'watched'
        });
      }
    });

    // New keywords
    const newKeywords = this.extractKeywords(text);
    newKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${this.escapeRegex(keyword)})\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        // Check overlap with watched
        const overlaps = matches.some(m =>
          (match.index >= m.index && match.index < m.index + m.length) ||
          (m.index >= match.index && m.index < match.index + match[1].length)
        );
        if (!overlaps) {
          matches.push({
            keyword: match[1],
            index: match.index,
            length: match[1].length,
            type: 'new'
          });
        }
      }
    });

    if (matches.length === 0) return null;

    // Sort by index
    matches.sort((a, b) => a.index - b.index);

    // Build fragment
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach(match => {
      // Add text before match
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      // Add highlighted span
      const span = document.createElement('span');
      span.className = match.type === 'watched' ? 'ekh-watched' : 'ekh-new';
      span.dataset.keyword = match.keyword;
      span.textContent = match.keyword;
      fragment.appendChild(span);

      lastIndex = match.index + match.length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    return fragment;
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
        <button class="ignore">− 無視（色なし）</button>
      `;
    } else {
      this.tooltip.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: bold;">"${keyword}"</div>
        <button class="watch">✓ 注目に追加</button>
        <button class="exclude">✗ 除外に追加</button>
        <button class="ignore">− 無視（色なし）</button>
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
    const ignoreBtn = this.tooltip.querySelector('.ignore');

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

    if (ignoreBtn) {
      ignoreBtn.addEventListener('click', () => {
        if (isWatched) {
          this.removeFromList('watchedKeywords', keyword);
        }
        this.addToList('ignoredKeywords', keyword);
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
