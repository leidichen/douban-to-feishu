// background.js

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

// --- Token Cache ---
let tokenCache = {
  token: null,
  expireTime: 0
};

// --- Helper: Fetch Wrapper ---
async function fetchFeishuAPI(url, options) {
  console.log(`[Feishu API] Request: ${url}`, options);
  try {
    const response = await fetch(url, options);
    const text = await response.text(); // Get raw text first
    console.log(`[Feishu API] Raw Response:`, text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // If parsing fails, throw error with first 200 chars of response
      throw new Error(`Response is not valid JSON. Status: ${response.status}. Body: ${text.substring(0, 200)}...`);
    }
    
    if (!response.ok) {
      // Handle 404 specifically for better user feedback
      if (response.status === 404) {
          throw new Error(`请求资源不存在 (404)。可能是 App Token 错误或 Table ID 错误。`);
      }
      throw new Error(`HTTP error! status: ${response.status}, url: ${url}, msg: ${JSON.stringify(data)}`);
    }
    return data;
  } catch (error) {
    // Check for "404 page not found" in raw text response (when JSON parse fails)
    if (error.message.includes('404 page not found')) {
        throw new Error(`连接失败 (404): 无法找到指定的飞书应用或表格。请仔细检查 App Token 和 Table ID 是否正确。注意区分 'l' (小写L) 和 'I' (大写i)。`);
    }
    
    // Enhance error message with URL if not present
    if (!error.message.includes(url)) {
       error.message += ` (Request URL: ${url})`;
    }
    console.warn('Fetch Warning:', error);
    throw error;
  }
}

// --- Auth: Get Tenant Access Token ---
async function getTenantAccessToken(appId, appSecret) {
  // Trim inputs to avoid auth errors caused by spaces
  appId = appId?.trim();
  appSecret = appSecret?.trim();

  if (tokenCache.token && Date.now() < tokenCache.expireTime) {
    return tokenCache.token;
  }

  const url = `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  };

  try {
    const response = await fetchFeishuAPI(url, options);
    
    if (response.code !== 0) {
      throw new Error(`获取 Token 失败: ${response.msg} (Code: ${response.code})`);
    }

    tokenCache = {
      token: response.tenant_access_token,
      expireTime: Date.now() + (response.expire - 300) * 1000 // Expire 5 mins early
    };

    return response.tenant_access_token;
  } catch (error) {
    throw new Error(`Auth Error: ${error.message}`);
  }
}

// --- Action: Verify Connection ---
async function verifyConnection({ appId, appSecret, appToken, tableId }) {
  // Trim and Clean inputs (Remove any non-alphanumeric chars from Token/ID)
  appId = appId?.trim();
  appSecret = appSecret?.trim();
  appToken = appToken?.trim().replace(/[^a-zA-Z0-9]/g, '');
  tableId = tableId?.trim().replace(/[^a-zA-Z0-9]/g, '');

  if (!appToken || !tableId) {
      throw new Error("App Token 或 Table ID 为空 (或包含非法字符)");
  }

  const token = await getTenantAccessToken(appId, appSecret);
  
  // 1. Verify App Token first (List Tables)
  // We use List Tables instead of Get App Meta because it's more reliable for verification
  const appUrl = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables?page_size=1`;
  const appOptions = {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  };
  
  try {
    const appResponse = await fetchFeishuAPI(appUrl, appOptions);
    if (appResponse.code !== 0) {
       throw new Error(`App Token 无效或无权限: ${appResponse.msg} (Code: ${appResponse.code})`);
    }
  } catch (e) {
    throw new Error(`App 验证失败: ${e.message}`);
  }

  // 2. Verify Table ID
  // Use List Fields API to verify table existence since Get Table Meta might not exist
  const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=1`;
  const options = {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  };

  const response = await fetchFeishuAPI(url, options);
  
  if (response.code !== 0) {
    throw new Error(`Table 验证失败: ${response.msg} (Code: ${response.code})`);
  }

  return { success: true, msg: "Connection Verified" };
}

// --- Action: Get Table Fields ---
async function getTableFields({ appId, appSecret, appToken, tableId }) {
  appToken = appToken?.trim().replace(/[^a-zA-Z0-9]/g, '');
  tableId = tableId?.trim().replace(/[^a-zA-Z0-9]/g, '');
  const token = await getTenantAccessToken(appId, appSecret);
  
  // List fields
  // Note: Pagination might be needed if fields > 100, but usually not for this case.
  const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`;
  const options = {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  };

  const response = await fetchFeishuAPI(url, options);
  
  if (response.code !== 0) {
    throw new Error(`获取字段列表失败: ${response.msg}`);
  }

  return response.data.items; // Array of field objects
}

// --- Action: Update Table Name ---
async function updateTableName({ appId, appSecret, appToken, tableId, name }) {
    // Force trim and clean inputs
    appToken = appToken?.trim().replace(/[^a-zA-Z0-9]/g, '');
    tableId = tableId?.trim().replace(/[^a-zA-Z0-9]/g, '');

    const token = await getTenantAccessToken(appId, appSecret);
    const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}`;
    const options = {
        method: 'PATCH',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8' 
        },
        body: JSON.stringify({ name })
    };
    
    // DEBUG: Log the full URL to verify it's correct
    console.log(`[UpdateTableName] URL: ${url}`);

    const response = await fetchFeishuAPI(url, options);
    if (response.code !== 0) throw new Error(`重命名数据表失败: ${response.msg}`);
    return response.data;
}

// --- Action: Update Field Name ---
async function updateFieldName({ appId, appSecret, appToken, tableId, fieldId, name, fieldType }) {
    appToken = appToken?.trim().replace(/[^a-zA-Z0-9]/g, '');
    tableId = tableId?.trim().replace(/[^a-zA-Z0-9]/g, '');
    const token = await getTenantAccessToken(appId, appSecret);
    const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`;
    const options = {
        method: 'PUT',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8' 
        },
        body: JSON.stringify({ 
            field_name: name,
            // Feishu PUT for field requires 'type' (full update semantics)
            // We pass through the existing field type to avoid unintended changes.
            type: fieldType 
        })
    };
    
    const response = await fetchFeishuAPI(url, options);
    if (response.code !== 0) throw new Error(`重命名字段失败: ${response.msg}`);
    return response.data;
}

// --- Action: Create Field ---
async function createField({ appId, appSecret, appToken, tableId, fieldName, fieldType }) {
    appToken = appToken?.trim().replace(/[^a-zA-Z0-9]/g, '');
    tableId = tableId?.trim().replace(/[^a-zA-Z0-9]/g, '');
    const token = await getTenantAccessToken(appId, appSecret);
    const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
    const options = {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8' 
        },
        body: JSON.stringify({ 
            field_name: fieldName,
            type: fieldType
        })
    };
    
    const response = await fetchFeishuAPI(url, options);
    if (response.code !== 0) throw new Error(`创建字段 "${fieldName}" 失败: ${response.msg}`);
    return response.data;
}

// --- Action: Download Image from Douban ---
async function downloadImage(imageUrl) {
  try {
    // We now use declarativeNetRequest (DNR) rules in manifest.json + rules.json
    // to automatically strip Referer/Origin headers for doubanio.com requests.
    // So we can just do a plain fetch.
    
    console.log(`[Background] Fetching image: ${imageUrl}`);
    const response = await fetch(imageUrl, {
        cache: 'no-cache'
    });

    if (!response.ok) {
        throw new Error(`图片下载失败: ${response.status}`);
    }
    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.warn('Download Image Warning:', error);
    throw new Error(`图片下载异常: ${error.message}`);
  }
}

// --- Action: Upload Image to Feishu Drive ---
async function uploadImageToFeishu({ appId, appSecret, appToken, imageData, fileName }) {
  const token = await getTenantAccessToken(appId, appSecret);
  
  const url = `${FEISHU_API_BASE}/drive/v1/medias/upload_all`;
  
  const formData = new FormData();
  formData.append('file_name', fileName);
  formData.append('parent_type', 'bitable_image');
  formData.append('parent_node', appToken);
  formData.append('size', imageData.size);
  formData.append('file', imageData, fileName);

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  };

  const response = await fetch(url, options);
  const text = await response.text();
  console.log(`[Feishu Upload] Raw Response:`, text);

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`上传响应不是有效 JSON: ${text.substring(0, 200)}...`);
  }

  if (!response.ok || data.code !== 0) {
    throw new Error(`图片上传失败: ${data.msg || data.error} (Code: ${data.code})`);
  }

  return data.data.file_token;
}

// --- Action: Save Record ---
// Note: 'fields' here is already the mapped { "Field Name": Value } object
async function saveToFeishu({ appId, appSecret, appToken, tableId, fields, coverUrl, coverFieldName }) {
  appToken = appToken?.trim().replace(/[^a-zA-Z0-9]/g, '');
  tableId = tableId?.trim().replace(/[^a-zA-Z0-9]/g, '');
  const token = await getTenantAccessToken(appId, appSecret);
  
  let finalFields = { ...fields };
  
  // Upload cover image if provided
  if (coverUrl && coverFieldName) {
    try {
      console.log(`[Feishu] Downloading cover: ${coverUrl}`);
      const imageBlob = await downloadImage(coverUrl);
      
      // --- DEBUG: Download to local for user verification REMOVED ---


      const fileToken = await uploadImageToFeishu({ appId, appSecret, appToken, imageData: imageBlob, fileName: 'cover.jpg' });
      // Set cover field as attachment: [{ "file_token": "..." }]
      finalFields[coverFieldName] = [{ file_token: fileToken }];
      console.log(`[Feishu] Cover uploaded successfully: ${fileToken}`);
    } catch (error) {
      console.warn(`[Feishu] Cover upload failed:`, error);
      // STRICT MODE: Throw error so user knows upload failed
      throw new Error(`封面同步失败: ${error.message}`);
    }
  }
  
  const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      fields: finalFields
    }),
  };

  const response = await fetchFeishuAPI(url, options);
  
  if (response.code !== 0) {
    throw new Error(`保存记录失败: ${response.msg}`);
  }

  return response.data;
}

// --- Message Handler ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Use async IIFE to handle async operations
  (async () => {
    try {
      let data;
      switch (request.action) {
        case 'verifyConnection':
          data = await verifyConnection(request);
          break;
        case 'getTableFields':
          data = await getTableFields(request);
          break;
        case 'saveToFeishu':
          data = await saveToFeishu(request);
          break;
        case 'updateTableName':
          data = await updateTableName(request);
          break;
        case 'updateFieldName':
          data = await updateFieldName(request);
          break;
        case 'createField':
          data = await createField(request);
          break;
        default:
          throw new Error(`Unknown action: ${request.action}`);
      }
      sendResponse({ success: true, data });
    } catch (error) {
      console.warn(`Background Warning (${request.action}):`, error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep channel open for async response
});
