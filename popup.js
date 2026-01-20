// --- Config ---
const movieMapping = {
  title: ['电影/电视剧/番组', '影视标题', '电影标题', '片名', '标题', 'Name', 'title'],
  rating: ['个人评分', '评分', 'rating', 'score'],
  rating_date: ['打分日期', '日期', 'date'],
  my_comment: ['我的短评', '短评', 'comment'],
  release_date: ['上映日期', 'release date'],
  country: ['制片国家', '制片国家/地区', '国家', 'country'],
  url: ['条目链接', '链接', 'url', 'link'],
  cover: ['影视封面', '电影封面', '封面', 'cover', 'image']
};

const bookMapping = {
  title: ['图书书名', '书名', '标题', 'Name', 'title'],
  rating: ['个人评分', '评分', 'rating', 'score'],
  rating_date: ['打分日期', '日期', 'date'],
  my_comment: ['我的短评', '短评', 'comment'],
  pubdate: ['出版日期', '出版时间', 'publication date'],
  publish_year: ['出版年', 'publication year'],
  author: ['图书作者', '作者', '作者名', 'author'],
  publisher: ['出版社', '出版方', '出版机构', 'publisher'],
  isbn: ['ISBN', 'isbn', '书号', '条形码'],
  url: ['条目链接', '链接', 'url', 'link'],
  cover: ['图书封面', '封面', 'cover', 'image']
};

console.log('Popup script initializing...');

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM ready, initializing UI...');
  
  // --- DOM Elements ---
  const ui = {
    appIdInput: document.getElementById('appId'),
    appSecretInput: document.getElementById('appSecret'),
    movieTableUrlInput: document.getElementById('movieTableUrl'),
    bookTableUrlInput: document.getElementById('bookTableUrl'),
    saveSettingsButton: document.getElementById('saveSettings'),
    verifyConnectionButton: document.getElementById('verifyConnection'),
    itemTypeSelect: document.getElementById('itemType'),
    getInfoButton: document.getElementById('getInfo'),
    saveToFeishuButton: document.getElementById('saveToFeishu'),
    statusDiv: document.getElementById('status'),
    infoDiv: document.getElementById('infoDisplay'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel')
  };

  // Basic check
  if (!ui.saveSettingsButton || !ui.verifyConnectionButton) {
    console.error('Critical buttons not found!');
    if (ui.statusDiv) ui.statusDiv.textContent = 'Error: UI Init Failed';
    return;
  }

  // --- Helper Functions ---
  
  function extractFeishuInfo(url) {
      if (!url) return null;
      try {
          // Regex for App Token: matches base/<token>
          const tokenMatch = url.match(/\/base\/([a-zA-Z0-9]+)/);
          // Regex for Table ID: matches table=<id>
          const tableMatch = url.match(/[?&]table=([a-zA-Z0-9]+)/);
          
          if (tokenMatch && tableMatch) {
              return {
                  appToken: tokenMatch[1],
                  tableId: tableMatch[1]
              };
          }
          return null;
      } catch (e) {
          console.error('URL Parsing Error:', e);
          return null;
      }
  }

  function setStatus(message, isError = false) {
    console.log(`Status: ${message} (Error: ${isError})`);
    if (!ui.statusDiv) return;
    
    ui.statusDiv.textContent = message;
    ui.statusDiv.className = 'status-bar ' + (isError ? 'error' : 'success');
    
    if (!isError) {
      setTimeout(() => {
        if (ui.statusDiv.textContent === message) {
          ui.statusDiv.textContent = '';
          ui.statusDiv.className = 'status-bar';
        }
      }, 5000);
    }
  }

  async function sendMessageToBackground(action, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown background error'));
        }
      });
    });
  }

  async function sendMessageToContentScript(action, payload) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");
    
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error("请刷新页面后重试 (Content Script未加载)"));
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown content script error'));
        }
      });
    });
  }

  async function loadImage(url, imgId) {
    try {
      const response = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Load failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = document.getElementById(imgId);
      if (img) {
        img.src = objectUrl;
        img.onload = () => URL.revokeObjectURL(objectUrl);
      }
    } catch (e) {
      console.error('Image load failed', e);
      const img = document.getElementById(imgId);
      if (img) img.style.display = 'none';
    }
  }

  // --- Logic Functions ---

  function initTabs() {
    ui.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        
        // Update Buttons
        ui.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update Panels
        ui.tabPanels.forEach(p => {
          p.classList.remove('active');
          if (p.id === `panel-${targetTab}`) {
            p.classList.add('active');
          }
        });
      });
    });
  }

  async function loadSettings() {
    const data = await chrome.storage.local.get([
      'appId', 'appSecret', 'movieTableUrl', 'bookTableUrl'
    ]);
    
    ui.appIdInput.value = data.appId || '';
    ui.appSecretInput.value = data.appSecret || '';
    ui.movieTableUrlInput.value = data.movieTableUrl || '';
    ui.bookTableUrlInput.value = data.bookTableUrl || '';
  }

  async function saveSettings() {
    const movieUrl = ui.movieTableUrlInput.value.trim();
    const bookUrl = ui.bookTableUrlInput.value.trim();
    
    const movieInfo = extractFeishuInfo(movieUrl);
    const bookInfo = extractFeishuInfo(bookUrl);
    
    // Logic: At least one URL must be valid to save functional settings
    if (!movieInfo && !bookInfo) {
        setStatus('请至少提供一个有效的飞书多维表格链接', true);
        return;
    }
    
    // App Token Consistency Check
    let appToken = null;
    if (movieInfo && bookInfo) {
        if (movieInfo.appToken !== bookInfo.appToken) {
            setStatus('错误：影视库和图书库必须属于同一个多维表格应用 (App Token 不一致)', true);
            return;
        }
        appToken = movieInfo.appToken;
    } else {
        appToken = movieInfo ? movieInfo.appToken : bookInfo.appToken;
    }

    const settings = {
      appId: ui.appIdInput.value.trim(),
      appSecret: ui.appSecretInput.value.trim(),
      // Saved for UI restoration
      movieTableUrl: movieUrl,
      bookTableUrl: bookUrl,
      // Extracted values for backend logic
      appToken: appToken,
      movieTableId: movieInfo ? movieInfo.tableId : '',
      bookTableId: bookInfo ? bookInfo.tableId : ''
    };

    if (!settings.appId || !settings.appSecret) {
      setStatus('APP_ID 和 APP_SECRET 不能为空', true);
      return;
    }

    await chrome.storage.local.set(settings);
    
    // UI Feedback
    ui.saveSettingsButton.textContent = '配置已保存';
    ui.saveSettingsButton.classList.remove('btn-success');
    ui.saveSettingsButton.classList.add('btn-primary');
    await chrome.storage.local.set({ uiSaved: true });
    
    setStatus('设置已保存! (已自动提取 Token 和 ID)', false);
  }

  async function getSettings() {
    return await chrome.storage.local.get([
      'appId', 'appSecret', 'appToken', 'movieTableId', 'bookTableId'
    ]);
  }

  // --- Smart Fix Helper ---
  async function verifyAndFixToken(settings) {
      // Use provided tableId or fallback to movieTableId
      const probeTableId = settings.tableId || settings.movieTableId;
      
      if (!probeTableId) {
          throw new Error("无法验证连接: 未找到有效的 Table ID");
      }

      // 1. Try original
      try {
          await sendMessageToBackground('verifyConnection', {
              appId: settings.appId,
              appSecret: settings.appSecret,
              appToken: settings.appToken,
              tableId: probeTableId
          });
          return settings.appToken;
      } catch (error) {
          if (!error.message.includes('404')) throw error;
          
          console.log('404 detected, attempting smart fix for App Token...');
          const candidates = [];
          
          // Strategy 1: Swap 'l' (lowercase L) with 'I' (uppercase i)
          if (settings.appToken.includes('l')) {
              candidates.push(settings.appToken.replace(/l/g, 'I'));
              candidates.push(settings.appToken.replace(/l/g, '1')); // Try 1
          }
          // Strategy 2: Swap 'I' (uppercase i) with 'l' (lowercase L)
          if (settings.appToken.includes('I')) {
              candidates.push(settings.appToken.replace(/I/g, 'l'));
              candidates.push(settings.appToken.replace(/I/g, '1')); // Try 1
          }
          // Strategy 3: Swap '1' with 'I' or 'l'
          if (settings.appToken.includes('1')) {
              candidates.push(settings.appToken.replace(/1/g, 'I'));
              candidates.push(settings.appToken.replace(/1/g, 'l'));
          }
          
          for (const token of candidates) {
              if (token === settings.appToken) continue;
              try {
                  console.log(`Trying candidate token: ${token}`);
                  await sendMessageToBackground('verifyConnection', {
                      appId: settings.appId,
                      appSecret: settings.appSecret,
                      appToken: token,
                      tableId: probeTableId
                  });
                  console.log(`Smart fix successful! New token: ${token}`);
                  return token;
              } catch (e) {
                  console.log(`Candidate failed: ${token}`);
              }
          }
          
          throw error; // If all fail, throw original or last error
      }
  }

  async function verifyConnection() {
    setStatus('正在验证连接...', false);
    const originalText = ui.verifyConnectionButton.textContent;
    ui.verifyConnectionButton.disabled = true;
    ui.verifyConnectionButton.textContent = '验证中...';
    
    // Parse on the fly to verify CURRENT input
    const movieUrl = ui.movieTableUrlInput.value.trim();
    const movieInfo = extractFeishuInfo(movieUrl);
    
    // Fallback to saved settings or check book URL if movie URL is empty
    let appToken, tableId;
    
    if (movieInfo) {
        appToken = movieInfo.appToken;
        tableId = movieInfo.tableId;
    } else {
        // Try Book URL
        const bookUrl = ui.bookTableUrlInput.value.trim();
        const bookInfo = extractFeishuInfo(bookUrl);
        if (bookInfo) {
            appToken = bookInfo.appToken;
            tableId = bookInfo.tableId;
        } else {
            // Try to load from storage as last resort
            const data = await chrome.storage.local.get(['appToken', 'movieTableId']);
            if (data.appToken && data.movieTableId) {
                appToken = data.appToken;
                tableId = data.movieTableId;
            } else {
                setStatus('无法获取有效的 App Token 或 Table ID，请检查链接', true);
                return;
            }
        }
    }

    const settings = {
      appId: ui.appIdInput.value.trim(),
      appSecret: ui.appSecretInput.value.trim(),
      appToken: appToken,
      tableId: tableId // Use whatever we found to test connection
    };
    
    if (!settings.appId || !settings.appSecret) {
        setStatus('APP_ID 和 APP_SECRET 不能为空', true);
        return;
    }

    try {
      // Use the smart verifyAndFixToken logic we added earlier
      const validToken = await verifyAndFixToken({
          ...settings,
          movieTableId: tableId // verifyAndFixToken expects this prop for probing
      });
      
      // If fixed, save the corrected token back to storage (associated with the URL inputs essentially)
      // Note: We can't update the URL input itself easily to reflect a token change without reconstructing the URL,
      // but we can update the backend storage so subsequent calls work.
      if (validToken !== settings.appToken) {
           await chrome.storage.local.set({ appToken: validToken });
           console.log('App Token auto-corrected during verify');
      }

      setStatus('连接成功!', false);
      ui.verifyConnectionButton.disabled = false;
      ui.verifyConnectionButton.classList.remove('btn-secondary');
      ui.verifyConnectionButton.classList.add('btn-success');
      ui.verifyConnectionButton.textContent = '验证通过';
      await chrome.storage.local.set({ uiVerified: true });
      await checkAndUpdateInitStatusAll();
    } catch (error) {
      setStatus(`连接失败: ${error.message}`, true);
      ui.verifyConnectionButton.disabled = false;
      ui.verifyConnectionButton.classList.remove('btn-success');
      ui.verifyConnectionButton.classList.add('btn-secondary');
      ui.verifyConnectionButton.textContent = originalText;
      await chrome.storage.local.set({ uiVerified: false });
    }
  }

  async function getInfo() {
    const type = ui.itemTypeSelect.value;
    
    ui.infoDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-placeholder">
          <p>正在读取页面信息...</p>
        </div>
      </div>
    `;
    ui.infoDiv.classList.remove('empty-state');
    
    setStatus('正在获取...', false);
    
    try {
      currentItemInfo = await sendMessageToContentScript('getInfo', { type });
      displayInfo(currentItemInfo);
      setStatus('信息获取成功!', false);
      ui.saveToFeishuButton.disabled = false;
    } catch (error) {
      setStatus(`获取失败: ${error.message}`, true);
      ui.saveToFeishuButton.disabled = true;
      ui.infoDiv.classList.add('empty-state');
      ui.infoDiv.innerHTML = `
        <div class="empty-placeholder">
          <div class="icon">❌</div>
          <p>获取失败，请重试</p>
        </div>
      `;
    }
  }

  function displayInfo(info) {
    const type = ui.itemTypeSelect.value;
    const title = info.title || '无标题';
    const coverUrl = info.cover;
    
    // Status Logic
    const userStatus = info.user_status || { is_logged_in: false, has_marked: false };
    let ratingDisplay = '';
    let dateDisplay = '';
    let commentHtml = '';

    // 1. Rating
    if (info.rating) {
      ratingDisplay = `${info.rating}分`;
    } else {
      ratingDisplay = '尚未评分';
    }

    // 2. Date
    if (info.rating_date) {
      dateDisplay = new Date(info.rating_date).toLocaleDateString();
    } else {
      dateDisplay = '暂无日期';
    }

    // 3. Comment
    if (info.my_comment) {
      commentHtml = `<div class="info-comment-box">${info.my_comment}</div>`;
    }
    
    const url = info.url || '#';
    
    let html = `
      <div class="info-header">
        <img id="preview-cover" src="" alt="Cover" class="info-cover">
        <div class="info-meta">
          <h4 class="info-title"><a href="${url}" target="_blank" style="text-decoration:none; color:inherit;">${title}</a></h4>
          ${type === 'book' ? `
            <div class="info-row"><strong>作者:</strong> ${info.author || '未知'}</div>
            <div class="info-row"><strong>出版社:</strong> ${info.publisher || '未知'}</div>
          ` : `
            <div class="info-row"><strong>导演:</strong> ${info.director || '未知'}</div>
            <div class="info-row"><strong>制片国家:</strong> ${info.country || '未知'}</div>
          `}
          <div class="info-row"><strong>个人评分:</strong> <span class="${!info.rating ? 'text-secondary' : ''}">${ratingDisplay}</span></div>
          <div class="info-row"><strong>打分日期:</strong> <span class="${!info.rating_date ? 'text-secondary' : ''}">${dateDisplay}</span></div>
          ${type === 'book' ? `
            <div class="info-row"><strong>ISBN:</strong> ${info.isbn || '未知'}</div>
          ` : `
            <div class="info-row"><strong>IMDb:</strong> ${info.imdb || '未知'}</div>
          `}
        </div>
      </div>
      ${commentHtml}
    `;

    ui.infoDiv.innerHTML = html;
    ui.infoDiv.classList.remove('empty-state');

    if (coverUrl) {
      loadImage(coverUrl, 'preview-cover');
    } else {
      const img = document.getElementById('preview-cover');
      if (img) img.style.display = 'none';
    }
  }

  async function mapDataToFeishuFields(data, type, feishuFields) {
    const mapping = type === 'movie' ? movieMapping : bookMapping;
    const resultFields = {};
    const matchedLogs = [];
    let coverFieldName = null;
    let coverUrl = data.cover || '';

    for (const [dataKey, dataValue] of Object.entries(data)) {
      if (dataKey.endsWith('_raw') || dataValue === '' || dataValue === null) continue;

      const aliases = mapping[dataKey];
      if (!aliases) continue; 

      // Relaxed matching: case-insensitive and trim
      // Also check if field_name contains the alias (fuzzy match)
      const match = feishuFields.find(f => 
        aliases.some(alias => {
            const fName = f.field_name.toLowerCase().trim();
            const aName = alias.toLowerCase().trim();
            return fName === aName || fName.replace(/\s/g, '') === aName.replace(/\s/g, ''); 
        })
      );

      if (match) {
        let finalValue = dataValue;

        if (match.type !== 5) {
           if (dataKey === 'pubdate' && data['pubdate_raw']) {
               finalValue = data['pubdate_raw'];
           } else if (dataKey === 'release_date' && data['release_date_raw']) {
               finalValue = data['release_date_raw'];
           }
        }

        if (dataKey === 'my_comment') {
            const cleaned = String(finalValue).trim()
              .replace(/^评价\s*[:：]?\s*/g, '')
              .replace(/^我的评价\s*[:：]?\s*/g, '')
              .trim();
            if (!cleaned) {
                continue;
            }
            finalValue = cleaned;
        }

        if (match.type === 1) {
            finalValue = String(finalValue); 
        }
        else if (match.type === 15) { 
            finalValue = { text: "豆瓣链接", link: dataValue };
        }
        else if (match.type === 5) {
            if (typeof dataValue !== 'number') {
               console.warn(`Field ${match.field_name} expects Date but got`, dataValue);
               continue; 
            }
        }
        else if (match.type === 2 || match.type === 4) {
            // Check if it's a numeric field but the value is clearly not a number (like ISBN with dashes or letters)
            // However, type 2 is Number. If user sets ISBN as Number in Feishu, we try to parse it.
            // But ISBNs often contain dashes or are better treated as text.
            // If the Feishu field is Text (type 1), it's handled above.
            // If the Feishu field is Number (type 2), we try parse.
            
            // Special handling: if dataKey is ISBN, and match.type is Number, try to remove dashes.
            if (dataKey === 'isbn') {
                finalValue = finalValue.replace(/-/g, '');
            }

            finalValue = parseFloat(finalValue);
            if (isNaN(finalValue)) continue;
        }
        else if (match.type === 17 && dataKey === 'cover') {
            coverFieldName = match.field_name;
            continue; 
        }
        
        resultFields[match.field_name] = finalValue;
        matchedLogs.push(`${match.field_name} (Type: ${match.type}) <- ${dataKey}`);
      }
    }

    console.log('Mapping Result:', matchedLogs);
    return { fields: resultFields, coverUrl, coverFieldName };
  }

  async function saveToFeishu() {
    if (!currentItemInfo) {
      setStatus('请先获取信息', true);
      return;
    }

    const settings = await getSettings();
    const type = ui.itemTypeSelect.value;
    let tableId = type === 'movie' ? settings.movieTableId : settings.bookTableId;
    const parsed = type === 'movie' 
      ? extractFeishuInfo(ui.movieTableUrlInput.value.trim())
      : extractFeishuInfo(ui.bookTableUrlInput.value.trim());
    if (parsed) {
      settings.appToken = parsed.appToken;
      tableId = parsed.tableId;
      await chrome.storage.local.set({
        appToken: parsed.appToken,
        [type === 'movie' ? 'movieTableId' : 'bookTableId']: parsed.tableId
      });
    }

    if (!settings.appId || !settings.appSecret || !settings.appToken || !tableId) {
      setStatus('配置不完整，请前往设置页', true);
      return;
    }

    setStatus('正在获取飞书表格字段...', false);
    try {
      let feishuFields;
      try {
        feishuFields = await sendMessageToBackground('getTableFields', {
          appId: settings.appId,
          appSecret: settings.appSecret,
          appToken: settings.appToken,
          tableId: tableId
        });
      } catch (e) {
        if ((e.message || '').includes('TableIdNotFound')) {
          const validToken = await verifyAndFixToken({
            appId: settings.appId,
            appSecret: settings.appSecret,
            appToken: settings.appToken,
            movieTableId: tableId
          });
          settings.appToken = validToken;
          await chrome.storage.local.set({ appToken: validToken });
          feishuFields = await sendMessageToBackground('getTableFields', {
            appId: settings.appId,
            appSecret: settings.appSecret,
            appToken: settings.appToken,
            tableId: tableId
          });
        } else {
          throw e;
        }
      }

      setStatus('正在映射字段...', false);
      const { fields: mappedFields, coverUrl, coverFieldName } = await mapDataToFeishuFields(currentItemInfo, type, feishuFields);
      
      // --- SUPER FORCE ISBN WRITE ---
      // User reported issues with ISBN sync. We will now brute-force finding the field.
      if (currentItemInfo.isbn) {
          // 1. Find the field definition in Feishu
          const isbnFieldDef = feishuFields.find(f => {
              const name = f.field_name.toLowerCase().replace(/\s/g, '');
              return name.includes('isbn') || name.includes('条形码') || name.includes('书号');
          });

          if (isbnFieldDef) {
              const rawIsbn = String(currentItemInfo.isbn).replace(/-/g, '').trim();
              
              // Log what we found
              console.log(`[ISBN FORCE] Found Field: "${isbnFieldDef.field_name}" (Type: ${isbnFieldDef.type})`);
              console.log(`[ISBN FORCE] Writing Value: "${rawIsbn}"`);

              // Force write/overwrite
              // If type is Number (2), parse it. Otherwise string.
              if (isbnFieldDef.type === 2) {
                  const numVal = parseFloat(rawIsbn);
                  if (!isNaN(numVal)) {
                      mappedFields[isbnFieldDef.field_name] = numVal;
                  } else {
                      console.warn('[ISBN FORCE] Value is not a valid number, but field is Number type.');
                      // Try writing string anyway? No, strict number field might fail.
                      // But usually ISBN is large integer.
                      mappedFields[isbnFieldDef.field_name] = numVal; 
                  }
              } else {
                  // Text or other
                  mappedFields[isbnFieldDef.field_name] = rawIsbn;
              }
          } else {
              console.error('[ISBN FORCE] Could not find any field looking like ISBN in Feishu table!');
          }
      }

      // --- SUPER FORCE DIRECTOR WRITE ---
      if (currentItemInfo.director) {
          const directorFieldDef = feishuFields.find(f => {
              const name = f.field_name.toLowerCase().replace(/\s/g, '');
              return name.includes('导演') || name.includes('director');
          });

          if (directorFieldDef) {
              const directorVal = String(currentItemInfo.director).trim();
              console.log(`[DIRECTOR FORCE] Found Field: "${directorFieldDef.field_name}" (Type: ${directorFieldDef.type})`);
              console.log(`[DIRECTOR FORCE] Writing Value: "${directorVal}"`);
              mappedFields[directorFieldDef.field_name] = directorVal;
          } else {
              console.error('[DIRECTOR FORCE] Could not find any field looking like Director in Feishu table!');
          }
      }

      // --- SUPER FORCE IMDB WRITE ---
      if (currentItemInfo.imdb) {
          const imdbFieldDef = feishuFields.find(f => {
              const name = f.field_name.toLowerCase().replace(/\s/g, '');
              return name.includes('imdb');
          });

          if (imdbFieldDef) {
              const imdbVal = String(currentItemInfo.imdb).trim();
              console.log(`[IMDb FORCE] Found Field: "${imdbFieldDef.field_name}" (Type: ${imdbFieldDef.type})`);
              console.log(`[IMDb FORCE] Writing Value: "${imdbVal}"`);
              mappedFields[imdbFieldDef.field_name] = imdbVal;
          } else {
              console.error('[IMDb FORCE] Could not find any field looking like IMDb in Feishu table!');
          }
      }
      // -----------------------------

      if (Object.keys(mappedFields).length === 0 && !coverFieldName) {
        throw new Error("没有匹配到任何字段！请检查飞书表格字段名是否与配置中的别名一致。");
      }

      setStatus('正在写入数据...', false);
      await sendMessageToBackground('saveToFeishu', {
        appId: settings.appId,
        appSecret: settings.appSecret,
        appToken: settings.appToken,
        tableId: tableId,
        fields: mappedFields,
        coverUrl: coverUrl,
        coverFieldName: coverFieldName
      });

      const writtenFields = Object.keys(mappedFields);
      let successMsg = '保存成功！';
      
      // Add warning if ISBN missing (and we really tried)
      if (currentItemInfo.isbn && !writtenFields.some(f => f.toLowerCase().includes('isbn'))) {
          console.warn("警告: ISBN完全无法匹配，请查看控制台日志");
      }

      setStatus(successMsg, false);
    } catch (error) {
      setStatus(`操作失败: ${error.message}`, true);
      console.error(error);
    }
  }

  // --- Init Logic ---
  
  const movieSchema = [
    { name: '影视封面', type: 17 },
    { name: '导演', type: 1 },
    { name: '制片国家', type: 1 },
    { name: '上映日期', type: 5 },
    { name: '个人评分', type: 2 },
    { name: '打分日期', type: 5 },
    { name: '我的短评', type: 1 },
    { name: 'IMDb', type: 1 },
    { name: '条目链接', type: 15 }
  ];

  const bookSchema = [
    { name: '图书封面', type: 17 },
    { name: '作者', type: 1 },
    { name: '出版社', type: 1 },
    { name: '出版年', type: 1 },
    { name: '个人评分', type: 2 },
    { name: '打分日期', type: 5 },
    { name: '我的短评', type: 1 },
    { name: 'ISBN', type: 1 },
    { name: '条目链接', type: 15 }
  ];

  async function initTable(type) {
    // Get settings from UI first, then storage
    const movieUrl = ui.movieTableUrlInput.value.trim();
    const bookUrl = ui.bookTableUrlInput.value.trim();
    const movieInfo = extractFeishuInfo(movieUrl);
    const bookInfo = extractFeishuInfo(bookUrl);
    
    // Strict Mode for Initialization: Must have valid URL input
    let appToken, tableId;

    if (type === 'movie') {
        if (!movieInfo) {
            alert('初始化失败：请在“影视库链接”输入框中填入有效的飞书多维表格链接！');
            return;
        }
        appToken = movieInfo.appToken;
        tableId = movieInfo.tableId;
    } else { // type === 'book'
        if (!bookInfo) {
            alert('初始化失败：请在“图书库链接”输入框中填入有效的飞书多维表格链接！');
            return;
        }
        appToken = bookInfo.appToken;
        tableId = bookInfo.tableId;
    }
    
    // Clean inputs (Security & Stability)
    appToken = appToken.replace(/[^a-zA-Z0-9]/g, '');
    tableId = tableId.replace(/[^a-zA-Z0-9]/g, '');

    const storedData = await getSettings();
    const settings = {
        appId: ui.appIdInput.value.trim() || storedData.appId,
        appSecret: ui.appSecretInput.value.trim() || storedData.appSecret,
        appToken: appToken,
        tableId: tableId,
        movieTableId: type === 'movie' ? tableId : (movieInfo?.tableId || storedData.movieTableId) 
    };

    const tableName = type === 'movie' ? '豆瓣影视' : '豆瓣图书';
    const primaryFieldName = type === 'movie' ? '影视标题' : '图书书名';
    const schema = type === 'movie' ? movieSchema : bookSchema;

    if (!settings.appId || !settings.appSecret || !settings.appToken || !settings.tableId) {
        setStatus('请先填写配置并保存 (或输入有效的飞书链接)', true);
        return;
    }

    if (!confirm(`即将初始化 ${type === 'movie' ? '电影' : '图书'} 表。\n\n这将重命名表格为 "${tableName}"，并将现有字段结构完全覆盖。\n\n请确保这真的是一个【空白新表】！继续吗？`)) {
        return;
    }

    setStatus('正在初始化...', false);
    
    try {
        // Pre-flight: Check Connection & Auto-fix Token
        setStatus('正在预检连接...', false);
        const validToken = await verifyAndFixToken(settings);
        
        if (validToken !== settings.appToken) {
            settings.appToken = validToken;
            // Update storage with fixed token
            await chrome.storage.local.set({ appToken: validToken });
            console.log('App Token auto-corrected during init');
        }

        const commonParams = {
            appId: settings.appId,
            appSecret: settings.appSecret,
            appToken: settings.appToken,
            tableId: settings.tableId
        };

        const preFields = await sendMessageToBackground('getTableFields', commonParams);
        const preNonPrimary = preFields.filter(f => !f.is_primary);
        const prePrimary = preFields.find(f => f.is_primary);
        const expectedPrimaryName = type === 'movie' ? '影视标题' : '图书书名';
        const requiredPre = type === 'movie' ? [
            { name: '影视封面', type: 17 },
            { name: '导演', type: 1 },
            { name: '制片国家', type: 1 },
            { name: '上映日期', type: 5 },
            { name: '个人评分', type: 2 },
            { name: '打分日期', type: 5 },
            { name: '我的短评', type: 1 },
            { name: 'IMDb', type: 1 },
            { name: '条目链接', type: 15 }
        ] : [
            { name: '图书封面', type: 17 },
            { name: '作者', type: 1 },
            { name: '出版社', type: 1 },
            { name: '出版年', type: 1 },
            { name: '个人评分', type: 2 },
            { name: '打分日期', type: 5 },
            { name: '我的短评', type: 1 },
            { name: 'ISBN', type: 1 },
            { name: '条目链接', type: 15 }
        ];
        const preHasAll = requiredPre.every(r => preFields.some(f => f.field_name === r.name && f.type === r.type));
        const prePrimaryMatches = prePrimary && prePrimary.field_name === expectedPrimaryName;
        const preIsEmpty = preNonPrimary.length === 0;

        if (!preIsEmpty && preHasAll && prePrimaryMatches) {
            setStatus('检测到字段已满足要求，已标记为已初始化', false);
            if (type === 'movie') {
                await chrome.storage.local.set({ uiMovieInited: true });
                const btn = document.getElementById('initMovieTable');
                if (btn) {
                    btn.classList.remove('btn-secondary');
                    btn.classList.add('btn-warning');
                    btn.textContent = '已初始化电影表';
                    btn.disabled = true;
                }
            } else {
                await chrome.storage.local.set({ uiBookInited: true });
                const btn = document.getElementById('initBookTable');
                if (btn) {
                    btn.classList.remove('btn-secondary');
                    btn.classList.add('btn-warning');
                    btn.textContent = '已初始化图书表';
                    btn.disabled = true;
                }
            }
            return;
        }

        if (!preIsEmpty && !preHasAll) {
            alert('字段不匹配，请创建空白数据表或查阅文档');
            setStatus('初始化失败：字段不匹配', true);
            return;
        }

        // 1. Rename Table
        setStatus('正在重命名数据表...', false);
        await sendMessageToBackground('updateTableName', {
            ...commonParams,
            name: tableName
        });

        // 2. Rename Primary Field
        setStatus('正在配置索引列...', false);
        const existingFields = await sendMessageToBackground('getTableFields', commonParams);
        const primaryField = existingFields.find(f => f.is_primary);
        
        if (primaryField) {
            await sendMessageToBackground('updateFieldName', {
                ...commonParams,
                fieldId: primaryField.field_id,
                name: primaryFieldName,
                fieldType: primaryField.type
            });
        } else {
            console.warn('Could not find primary field to rename.');
        }

        // 3. Create Other Fields
        setStatus('正在批量创建字段...', false);
        for (const field of schema) {
            // Check if exists to avoid duplicates
            if (existingFields.some(f => f.field_name === field.name)) {
                console.log(`Field ${field.name} already exists, skipping.`);
                continue;
            }

            await sendMessageToBackground('createField', {
                ...commonParams,
                fieldName: field.name,
                fieldType: field.type
            });
            // Small delay to be nice to API
            await new Promise(r => setTimeout(r, 200));
        }

        setStatus(`初始化成功！${tableName} 已就绪。`, false);
        alert('初始化成功！您现在可以开始同步数据了。');
        if (type === 'movie') {
            await chrome.storage.local.set({ uiMovieInited: true });
            const btn = document.getElementById('initMovieTable');
            if (btn) {
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-warning');
                btn.textContent = '已初始化电影表';
                btn.disabled = true;
            }
        } else {
            await chrome.storage.local.set({ uiBookInited: true });
            const btn = document.getElementById('initBookTable');
            if (btn) {
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-warning');
                btn.textContent = '已初始化图书表';
                btn.disabled = true;
            }
        }

    } catch (error) {
        setStatus(`初始化失败: ${error.message}`, true);
        console.error(error);
        alert(`初始化失败: ${error.message}\n请检查权限是否包含 "管理多维表格应用" (bitable:app)`);
    }
  }

  // --- Initialize ---
  initTabs();
  await loadSettings();
  
  async function applyStoredUIButtonStates() {
    const data = await chrome.storage.local.get(['uiSaved', 'uiVerified', 'uiMovieInited', 'uiBookInited']);
    if (data.uiSaved) {
      ui.saveSettingsButton.textContent = '配置已保存';
      ui.saveSettingsButton.classList.remove('btn-success');
      ui.saveSettingsButton.classList.add('btn-primary');
    } else {
      ui.saveSettingsButton.textContent = '保存配置';
      ui.saveSettingsButton.classList.remove('btn-success');
      ui.saveSettingsButton.classList.add('btn-primary');
    }
    if (data.uiVerified) {
      ui.verifyConnectionButton.classList.remove('btn-secondary');
      ui.verifyConnectionButton.classList.add('btn-success');
      ui.verifyConnectionButton.textContent = '验证通过';
    } else {
      ui.verifyConnectionButton.classList.remove('btn-success');
      ui.verifyConnectionButton.classList.add('btn-secondary');
      ui.verifyConnectionButton.textContent = '验证连接';
    }
    const movieBtn = document.getElementById('initMovieTable');
    const bookBtn = document.getElementById('initBookTable');
    if (movieBtn) {
      if (data.uiMovieInited) {
        movieBtn.classList.remove('btn-secondary');
        movieBtn.classList.add('btn-warning');
        movieBtn.textContent = '已初始化电影表';
        movieBtn.disabled = true;
      } else {
        movieBtn.classList.remove('btn-warning');
        movieBtn.classList.add('btn-secondary');
        movieBtn.textContent = '初始化电影表';
        movieBtn.disabled = false;
      }
    }
    if (bookBtn) {
      if (data.uiBookInited) {
        bookBtn.classList.remove('btn-secondary');
        bookBtn.classList.add('btn-warning');
        bookBtn.textContent = '已初始化图书表';
        bookBtn.disabled = true;
      } else {
        bookBtn.classList.remove('btn-warning');
        bookBtn.classList.add('btn-secondary');
        bookBtn.textContent = '初始化图书表';
        bookBtn.disabled = false;
      }
    }
  }
  
  function setupInputListeners() {
    const fields = [
      ui.appIdInput,
      ui.appSecretInput,
      ui.movieTableUrlInput,
      ui.bookTableUrlInput
    ];
    const resetButtons = async () => {
      ui.saveSettingsButton.textContent = '保存配置';
      ui.saveSettingsButton.classList.remove('btn-success');
      ui.saveSettingsButton.classList.add('btn-primary');
      ui.verifyConnectionButton.classList.remove('btn-success');
      ui.verifyConnectionButton.classList.add('btn-secondary');
      ui.verifyConnectionButton.textContent = '验证连接';
      const mBtn = document.getElementById('initMovieTable');
      const bBtn = document.getElementById('initBookTable');
      if (mBtn) {
        mBtn.classList.remove('btn-warning');
        mBtn.classList.add('btn-secondary');
        mBtn.textContent = '初始化电影表';
        mBtn.disabled = false;
      }
      if (bBtn) {
        bBtn.classList.remove('btn-warning');
        bBtn.classList.add('btn-secondary');
        bBtn.textContent = '初始化图书表';
        bBtn.disabled = false;
      }
      await chrome.storage.local.set({ uiSaved: false, uiVerified: false, uiMovieInited: false, uiBookInited: false });
    };
    fields.forEach(f => {
      if (f) {
        f.addEventListener('input', resetButtons);
      }
    });
  }
  
  await applyStoredUIButtonStates();
  setupInputListeners();
  
  // Set version
  const manifest = chrome.runtime.getManifest();
  const versionElement = document.getElementById('appVersion');
  if (versionElement) {
    versionElement.textContent = `v${manifest.version}`;
  }
  
  ui.saveSettingsButton.addEventListener('click', saveSettings);
  ui.verifyConnectionButton.addEventListener('click', verifyConnection);
  ui.getInfoButton.addEventListener('click', getInfo);
  ui.saveToFeishuButton.addEventListener('click', saveToFeishu);

  // Init Buttons
  const initMovieBtn = document.getElementById('initMovieTable');
  const initBookBtn = document.getElementById('initBookTable');
  
  if (initMovieBtn) initMovieBtn.addEventListener('click', () => initTable('movie'));
  if (initBookBtn) initBookBtn.addEventListener('click', () => initTable('book'));

  async function checkAndUpdateInitStatusAll() {
    const settings = await getSettings();
    if (!settings.appId || !settings.appSecret || !settings.appToken) return;
    if (settings.movieTableId) {
      try {
        const fields = await sendMessageToBackground('getTableFields', {
          appId: settings.appId,
          appSecret: settings.appSecret,
          appToken: settings.appToken,
          tableId: settings.movieTableId
        });
        const nonPrimary = fields.filter(f => !f.is_primary);
        const primaryField = fields.find(f => f.is_primary);
        const req = [
          { name: '影视封面', type: 17 },
          { name: '导演', type: 1 },
          { name: '制片国家', type: 1 },
          { name: '上映日期', type: 5 },
          { name: '个人评分', type: 2 },
          { name: '打分日期', type: 5 },
          { name: '我的短评', type: 1 },
          { name: 'IMDb', type: 1 },
          { name: '条目链接', type: 15 }
        ];
        const hasAll = req.every(r => fields.some(f => f.field_name === r.name && f.type === r.type));
        const primaryMatches = primaryField && primaryField.field_name === '影视标题';
        const isEmpty = nonPrimary.length === 0;
        const inited = !isEmpty && hasAll && primaryMatches;
        await chrome.storage.local.set({ uiMovieInited: inited });
      } catch (e) {}
    }
    if (settings.bookTableId) {
      try {
        const fields = await sendMessageToBackground('getTableFields', {
          appId: settings.appId,
          appSecret: settings.appSecret,
          appToken: settings.appToken,
          tableId: settings.bookTableId
        });
        const nonPrimary = fields.filter(f => !f.is_primary);
        const primaryField = fields.find(f => f.is_primary);
        const req = [
          { name: '图书封面', type: 17 },
          { name: '作者', type: 1 },
          { name: '出版社', type: 1 },
          { name: '出版年', type: 1 },
          { name: '个人评分', type: 2 },
          { name: '打分日期', type: 5 },
          { name: '我的短评', type: 1 },
          { name: 'ISBN', type: 1 },
          { name: '条目链接', type: 15 }
        ];
        const hasAll = req.every(r => fields.some(f => f.field_name === r.name && f.type === r.type));
        const primaryMatches = primaryField && primaryField.field_name === '图书书名';
        const isEmpty = nonPrimary.length === 0;
        const inited = !isEmpty && hasAll && primaryMatches;
        await chrome.storage.local.set({ uiBookInited: inited });
      } catch (e) {}
    }
    await applyStoredUIButtonStates();
  }

  // Auto-detect type
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) {
      if (tabs[0].url.includes('movie.douban.com')) {
        ui.itemTypeSelect.value = 'movie';
      } else if (tabs[0].url.includes('book.douban.com')) {
        ui.itemTypeSelect.value = 'book';
      }
    }
  });

});
