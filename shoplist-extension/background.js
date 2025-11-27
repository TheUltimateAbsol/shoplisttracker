chrome.action.onClicked.addListener(() => {
  const managerUrl = chrome.runtime.getURL("manager.html");
  chrome.tabs.create({ url: managerUrl });
});