console.log("Douban to Feishu content script loaded.");

// --- Helper Functions ---

// Get text from next sibling, skipping empty text nodes and BR tags
const getNextSiblingText = (node) => {
  if (!node) return '';
  let next = node.nextSibling;
  while (next) {
    if (next.nodeType === 3 && next.textContent.trim().length > 0) { // Text node
      return next.textContent.trim();
    }
    if (next.nodeType === 1 && next.tagName !== 'BR') { // Element node but not BR
       return next.innerText.trim();
    }
    next = next.nextSibling;
  }
  return '';
};

// Parse date string to timestamp (ms)
// Supported formats: "YYYY-MM-DD", "YYYY-MM", "YYYY", "YYYY年MM月"
const parseDateToTimestamp = (dateStr) => {
  if (!dateStr) return null;
  
  let cleanStr = dateStr.trim().replace(/[年月日]/g, '-').replace(/-$/, '');
  const parts = cleanStr.split(/[-/.]/);
  
  let year, month, day;
  
  if (parts.length >= 1) year = parseInt(parts[0], 10);
  if (parts.length >= 2) month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
  else month = 0;
  if (parts.length >= 3) day = parseInt(parts[2], 10);
  else day = 1;
  
  if (isNaN(year)) return null;
  
  const date = new Date(year, month, day);
  return date.getTime();
};

// Get info by regex from a large text block
const getInfoByRegex = (text, regex) => {
  const match = text.match(regex);
  return match ? match[1].trim() : '';
};

// --- User Interest Info Extraction (Personal Rating/Comment) ---

const getUserInterest = () => {
  // Check login status first
  const globalNav = document.querySelector('.global-nav-items');
  const userStatus = {
    is_logged_in: false,
    has_marked: false,
    status_text: '' // e.g. "想看", "看过", "在看"
  };

  if (globalNav && globalNav.innerText.includes('提醒')) {
      userStatus.is_logged_in = true;
  } else if (document.querySelector('.nav-user-account')) {
      // Newer Douban nav check
      userStatus.is_logged_in = true;
  }

  let interestEl = document.getElementById('interest_sect_level');

  // Fallback: Look for specific markers if ID not found or standard structure missing
  if (!interestEl || !interestEl.querySelector('.date')) {
      // Try to find the container via "看过"/"读过" status text
      const statusSpans = Array.from(document.querySelectorAll('span.mn, span.pl'));
      const targetSpan = statusSpans.find(s => ['看过', '读过', '听过', '想看', '在看'].includes(s.innerText.trim()));
      if (targetSpan) {
          userStatus.has_marked = true;
          userStatus.status_text = targetSpan.innerText.trim();
          // Go up to find the container
          const container = targetSpan.closest('div.j')?.parentElement || targetSpan.closest('div.clearfix');
          if (container) interestEl = container;
      }
  } else {
      userStatus.has_marked = true;
      // Try to guess status
      const statusText = interestEl.querySelector('span.mn, span.pl')?.innerText.trim();
      if (statusText) userStatus.status_text = statusText;
  }

  const result = {
    rating: null, // Change default from '' to null
    rating_date: null, // Change default from '' to null
    my_comment: '',
    user_status: userStatus
  };
  
  if (!interestEl) return result;

  // 1. Date Extraction
  const dateEl = interestEl.querySelector('span.date');
  if (dateEl) {
    const dateText = dateEl.innerText.trim();
    if (/\d{4}-\d{2}-\d{2}/.test(dateText)) {
      result.rating_date = parseDateToTimestamp(dateText);
    }
  } else {
      // Regex search in the whole text of the container
      const match = interestEl.innerText.match(/(\d{4}-\d{2}-\d{2})/);
      if (match) {
          result.rating_date = parseDateToTimestamp(match[1]);
      }
  }

  // 2. Rating Extraction
  const ratingInput = interestEl.querySelector('input#n_rating');
  let ratingText = '';

  if (ratingInput && ratingInput.value) {
      result.rating = parseInt(ratingInput.value, 10);
  } else {
      // Fallback: look for star images or class
      const ratingEl = interestEl.querySelector('[class*="rating"], [class*="allstar"], [class*="star"]');
      if (ratingEl) {
        const className = ratingEl.className;
        const match = className.match(/(?:rating|allstar|star)(\d+)/);
        if (match) {
          let val = parseInt(match[1], 10);
          if (val >= 10) val = val / 10; 
          result.rating = val; 
        }
      }
  }

  // Get rating text (e.g., "还行") to remove it later
  const rateWordEl = interestEl.querySelector('#rateword');
  if (rateWordEl) {
      ratingText = rateWordEl.innerText.trim();
  }

  // 3. Comment Extraction
  // Based on user provided HTML structure:
  // The comment is in a span following the <br> after rating section, or just a text node.
  // Structure:
  // <div class="j a_stars">
  //    ... date ... <br> ... rating ... <br>
  //    <span>挺好的。<span class="pl"></span></span>
  // </div>
  
  // Strategy: 
  // 1. Look for the last span that doesn't have a specific class (like .pl, .date, etc.)
  // 2. Or, since we have the full structure now, we can be very specific.
  
  const commentEl = interestEl.querySelector('.comment, .short-comment');
  if (commentEl) {
     result.my_comment = commentEl.innerText.trim();
  } else {
     // Specific handling for the "j a_stars" structure provided by user
     // It seems the comment is in a direct span child or a text node at the end.
     
     // Clone and clean approach is best, but let's refine what we remove.
     try {
          const clone = interestEl.cloneNode(true);
          
          // Remove known elements
          const selectorsToRemove = [
              '.date', '.collection_date',
              '.mr10', // "我看过这部电影" container
              '.collect_btn', // "修改"
              'form', // "删除" button form
              '#rating', // The entire rating block
              '#rateword', // "还行"
              '.pl', // labels
              'br',
              'script',
              'style'
          ];
          
          selectorsToRemove.forEach(sel => {
              clone.querySelectorAll(sel).forEach(el => el.remove());
          });
          
          // Also remove text nodes that contain "我看过这部电影", "我的评价"
          // Since we removed children, we are left with text nodes.
          
          let text = clone.innerText;
          
          // Clean up
          text = text.replace(/我看过这部电影/g, '')
                     .replace(/我的评价:/g, '')
                     .replace(/^评价\s*[:：]?\s*/g, '') // Remove starting "评价" with optional colon/spaces
                     .replace(/修改/g, '')
                     .replace(/删除/g, '')
                     .replace(/\d{4}-\d{2}-\d{2}/g, ''); // Just in case date was text
                     
          if (ratingText) text = text.replace(ratingText, '');
          
          const potentialComment = text.trim();
          // Only assign if it looks like a real comment (not empty or just status)
          if (potentialComment && !['想看', '看过', '在看', '读过', '听过'].includes(potentialComment)) {
              result.my_comment = potentialComment;
          }
     } catch (e) {
         // ...
     }
  }

  return result;
};

// --- Book Info Extraction ---

function getBookInfo() {
  try {
    const infoEl = document.getElementById('info');
    if (!infoEl) return { error: "未能找到图书信息元素 (#info)。请确认当前页面是豆瓣图书详情页。" };

    const infoText = infoEl.innerText;
    
    // Helper to extract specific fields from #info
    const getField = (regex) => getInfoByRegex(infoText, regex);

    const getAuthors = () => {
      // Strategy 1: Look for "作者:" span
      const authorSpan = Array.from(infoEl.querySelectorAll('span.pl')).find(el => el.textContent.includes('作者'));
      if (authorSpan) {
        // Check if there are links (<a>)
        const links = authorSpan.parentElement.querySelectorAll('a');
        // Filter out the "作者" link itself if it exists inside parent, though structure usually is: <span class="pl">作者:</span> <a ...>Name</a>
        // We need to capture links that are siblings or children of parent excluding the label.
        // Actually, for books, it's often: <span class="pl">作者:</span>&nbsp;<a href="...">Name</a>
        
        // Let's try getting text from next sibling first (for non-link authors)
        const directText = getNextSiblingText(authorSpan);
        if (directText && !directText.includes(':')) return directText; // Simple text author
        
        // If links exist
        // Note: Sometimes there are multiple authors separated by / or spaces
        // The structure is messy. Let's fallback to regex if DOM traversal is hard.
      }
      return getField(/(?:作者:)\s*(.*)/) || '';
    };

    // Extract raw date string first
    const pubDateStr = getField(/(?:出版年:)\s*(.*)/);
    
    const getISBN = () => {
        const span = Array.from(infoEl.querySelectorAll('span.pl')).find(e => e.innerText.trim() === 'ISBN:');
        if (span) {
             return getNextSiblingText(span);
        }
        return getField(/(?:ISBN:)\s*(.*)/);
    };

    const userInterest = getUserInterest();

    return {
      title: document.querySelector("h1 span[property='v:itemreviewed']")?.innerText.trim() || '',
      cover: document.querySelector("#mainpic img")?.src.replace(/\.webp$/, '.jpg').replace(/s_ratio_poster/, 'l_ratio_poster') || '',
      douban_rating: document.querySelector("strong.rating_num")?.innerText.trim() || '0', // Public rating
      rating: userInterest.rating || '', // Personal rating
      url: window.location.href,
      author: getAuthors().replace(/\s+/g, ' '), // Normalize spaces
      translator: getField(/(?:译者:)\s*(.*)/),
      publisher: getField(/(?:出版社:)\s*(.*)/),
      production_company: getField(/(?:出品方:)\s*(.*)/),
      pubdate: parseDateToTimestamp(pubDateStr), // Convert to timestamp
      pubdate_raw: pubDateStr, // Keep raw just in case
      publish_year: pubDateStr,
      pages: getField(/(?:页数:)\s*(.*)/),
      price: getField(/(?:定价:)\s*(.*)/),
      binding: getField(/(?:装帧:)\s*(.*)/),
      isbn: getISBN(),
      series: getField(/(?:丛书:)\s*(.*)/),
      original_title: getField(/(?:原作名:)\s*(.*)/),
      summary: document.querySelector("#link-report .intro")?.innerText.trim() || '',
      tags: Array.from(document.querySelectorAll('#db-tags-section .tag')).map(el => el.innerText.trim()),
      rating_date: userInterest.rating_date || '', 
      my_comment: userInterest.my_comment || ''
    };
  } catch (error) { return { error: error.message }; }
}

// --- Movie Info Extraction ---

function getMovieInfo() {
  try {
    const infoEl = document.getElementById('info');
    if (!infoEl) return { error: "未能找到电影信息元素 (#info)。请确认当前页面是豆瓣电影详情页。" };

    const getSpanText = (label) => {
      const el = Array.from(infoEl.querySelectorAll('span.pl')).find(e => e.innerText.trim().startsWith(label));
      return el ? getNextSiblingText(el) : '';
    };

    const getInfoByAttribute = (prop) => 
      Array.from(infoEl.querySelectorAll(`[property="${prop}"], [rel="${prop}"]`)).map(el => el.innerText.trim()).join(' / ');

    const getDirectorFallback = () => {
        const span = Array.from(infoEl.querySelectorAll('span.pl')).find(e => {
            const text = e.innerText.trim();
            return text === '导演' || text === '导演:';
        });
        if (span) {
            const next = span.nextElementSibling;
            if (next && next.classList.contains('attrs')) {
                 return next.innerText.trim().replace(/\s*\/\s*/g, ' / ');
            }
            return getNextSiblingText(span);
        }
        return '';
    };

    // Release date: prefer v:initialReleaseDate, fallback to regex
    let releaseDateStr = getInfoByAttribute('v:initialReleaseDate');
    if (!releaseDateStr) {
        releaseDateStr = getSpanText('上映日期:');
    }

    const userInterest = getUserInterest();

    return {
      title: document.querySelector("h1 span[property='v:itemreviewed']")?.innerText.trim() || '',
      cover: document.querySelector("#mainpic img")?.src.replace(/\.webp$/, '.jpg').replace(/s_ratio_poster/, 'l_ratio_poster') || '',
      douban_rating: document.querySelector("strong.rating_num")?.innerText.trim() || '0',
      rating: userInterest.rating || '',
      url: window.location.href,
      director: getInfoByAttribute('v:directedBy') || getDirectorFallback(),
      screenwriter: getSpanText('编剧'),
      actors: getInfoByAttribute('v:starring'),
      genres: getInfoByAttribute('v:genre'),
      country: getSpanText('制片国家/地区'),
      production_company: getSpanText('出品方') || getSpanText('制作公司'), // Attempt both
      language: getSpanText('语言'),
      release_date: parseDateToTimestamp(releaseDateStr),
      release_date_raw: releaseDateStr,
      runtime: getInfoByAttribute('v:runtime') || getSpanText('片长'),
      imdb: infoEl.innerText.match(/IMDb:?\s*(tt\d+)/)?.[1] || '',
      summary: document.querySelector("span[property='v:summary']")?.innerText.trim() || '',
      tags: Array.from(document.querySelectorAll('.tags-body a')).map(el => el.innerText.trim()),
      rating_date: userInterest.rating_date || '',
      my_comment: userInterest.my_comment || ''
    };
  } catch (error) { return { error: error.message }; }
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getInfo") {
    let info;
    switch (request.type) {
      case 'book':
        info = getBookInfo();
        break;
      case 'movie':
        info = getMovieInfo();
        break;
      default:
        info = { error: "未知的类型: " + request.type };
    }

    if (info.error) {
      sendResponse({ success: false, error: info.error });
    } else {
      sendResponse({ success: true, data: info });
    }
  }
  return true;
});
