/*
 * @Author: a624669980@163.com a624669980@163.com
 * @Date: 2025-07-02 16:30:17
 * @LastEditors: a624669980@163.com a624669980@163.com
 * @LastEditTime: 2025-07-03 11:56:09
 * @FilePath: /zima-nodes/background.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// Background script for ZimaOS Client extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Zima Nodes extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically due to manifest configuration
});
