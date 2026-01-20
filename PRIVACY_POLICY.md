# 隐私政策 (Privacy Policy)

**生效日期：** 2024-01-20

本隐私政策描述了 **豆瓣同步到飞书**（以下简称“本插件”）如何收集、使用和保护您的信息。

## 1. 数据收集与使用 (Data Collection and Use)

本插件**不会**收集、存储或向任何第三方服务器发送您的个人数据。

*   **豆瓣数据**：插件仅在您点击插件图标或按钮时，读取当前豆瓣页面（图书或电影详情页）的公开信息（如标题、评分、封面等）。这些数据仅暂存于您的浏览器内存中，用于传输到您的飞书多维表格。
*   **飞书鉴权信息**：您填写的 App ID、App Secret 等敏感信息仅保存在您本地浏览器的 `chrome.storage.local` 中，仅用于与飞书 API 进行通信。本插件不会将这些密钥发送给除飞书官方 API 以外的任何服务器。

## 2. 权限说明 (Permissions)

本插件请求以下权限以实现核心功能：

*   **activeTab**：用于读取当前激活的豆瓣页面 URL 和标题，以便判断当前是电影还是图书页面。
*   **storage**：用于在本地保存您的飞书配置信息（App ID, App Secret 等），以便您下次使用时无需重新输入。
*   **declarativeNetRequest**：用于在请求豆瓣图片时修改 Referer 头，以解决豆瓣图片的防盗链问题（403 Forbidden），确保封面图能正确显示在飞书表格中。
*   **host_permissions (https://*.douban.com/*, https://open.feishu.cn/*)**：允许插件与豆瓣网站（读取数据）和飞书开放平台（写入数据）进行通信。

## 3. 第三方服务 (Third-Party Services)

本插件的功能依赖于以下第三方服务：
*   **豆瓣 (Douban)**：作为数据来源。
*   **飞书 (Feishu/Lark)**：作为数据存储目的地。

请参阅这些服务各自的隐私政策以了解它们如何处理您的数据。

## 4. 变更 (Changes)

我们可能会不时更新本隐私政策。任何更改都将在此页面上发布。建议您定期查看本隐私政策以获取最新信息。

## 5. 联系我们 (Contact Us)

如果您对本隐私政策有任何疑问，请通过 GitHub Issues 联系我们：
https://github.com/leidichen/douban-to-feishu/issues
