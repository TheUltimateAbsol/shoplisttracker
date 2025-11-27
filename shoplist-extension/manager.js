// Suppress Tailwind Warning
const _consoleWarn = console.warn;
console.warn = function(...args) {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com')) return;
    _consoleWarn.apply(console, args);
};

// --- App State ---
let state = {
    currentProjectId: null,
    project: { title: "My List", items: [], settings: { cols: 3 } },
    selectionMode: false,
    selectedIds: new Set(),
    showPrices: true
};

// Undo/Redo Stacks
const historyStack = [];
const futureStack = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    checkInbox();
    checkInternalClipboard();
    setupEventListeners();
    
    setInterval(checkInbox, 2000);
});

// --- Event Listeners ---
function setupEventListeners() {
    document.getElementById('btnOpenProjects').addEventListener('click', openProjectsModal);
    document.getElementById('btnInbox').addEventListener('click', importInbox);
    document.getElementById('btnUndo').addEventListener('click', undo);
    document.getElementById('btnRedo').addEventListener('click', redo);
    document.getElementById('btnDownloadPdf').addEventListener('click', downloadPDF);

    document.getElementById('btnExportProject').addEventListener('click', exportProject);
    document.getElementById('btnImportProject').addEventListener('click', () => document.getElementById('fileInputImport').click());
    document.getElementById('fileInputImport').addEventListener('change', handleFileImport);

    document.getElementById('btnInternalPaste').addEventListener('click', pasteInternal);
    const btnExtPaste = document.getElementById('btnExtensionPaste');
    if(btnExtPaste) btnExtPaste.addEventListener('click', () => pasteFromExtension(false));

    document.getElementById('btnEditTitle').addEventListener('click', editTitle);
    document.getElementById('btnSaveTitle').addEventListener('click', saveTitle);
    document.getElementById('btnViewOptions').addEventListener('click', toggleViewMenu);
    document.getElementById('btnTogglePrices').addEventListener('click', togglePrices);
    
    document.getElementById('btnEnterSelect').addEventListener('click', () => toggleSelectionMode(true));

    document.querySelectorAll('.js-grid-size').forEach(btn => {
        btn.addEventListener('click', (e) => setGridSize(parseInt(e.currentTarget.dataset.cols)));
    });

    document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelected);
    document.getElementById('btnCopySelected').addEventListener('click', copySelected);
    document.getElementById('btnCutSelected').addEventListener('click', cutSelected);
    document.getElementById('btnSelectAll').addEventListener('click', toggleSelectAll);
    document.getElementById('btnCloseSelection').addEventListener('click', () => toggleSelectionMode(false));

    document.getElementById('btnCreateProject').addEventListener('click', createNewProject);
    document.getElementById('btnSaveEdit').addEventListener('click', saveEdit);
    
    document.getElementById('confirmYesBtn').addEventListener('click', () => {
        if (pendingConfirmAction) pendingConfirmAction();
        closeConfirmModal();
    });
    document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmModal);
    
    document.querySelectorAll('.js-close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.getElementById(e.target.dataset.target).classList.add('hidden');
        });
    });

    const grid = document.getElementById('grid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const checkBtn = e.target.closest('.js-select-item');
            if (checkBtn) { e.preventDefault(); e.stopPropagation(); toggleSelect(parseInt(checkBtn.dataset.id)); return; }

            const delBtn = e.target.closest('.js-delete-item');
            if (delBtn) { e.preventDefault(); e.stopPropagation(); deleteOne(parseInt(delBtn.dataset.id)); return; }

            const editBtn = e.target.closest('.js-edit-item');
            if (editBtn) { e.preventDefault(); e.stopPropagation(); startEdit(parseInt(editBtn.dataset.id)); return; }

            const card = e.target.closest('.item-card');
            if (card && state.selectionMode) {
                e.preventDefault();
                toggleSelect(parseInt(card.dataset.id));
            }
        });
    }

    const projList = document.getElementById('projectsList');
    if (projList) {
        projList.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.js-delete-project');
            if (delBtn) { e.stopPropagation(); deleteProject(delBtn.dataset.id); return; }
            const li = e.target.closest('li');
            if (li && li.dataset.id) switchProject(li.dataset.id);
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
        
        if (state.selectionMode) {
            if (e.key === 'Escape') toggleSelectionMode(false);
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); toggleSelectAll(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelected(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); cutSelected(); }
            if ((e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSelected(); }
        } else {
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); pasteInternal(); }
        }
    });
    
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('viewMenuDropdown');
        const btn = document.getElementById('btnViewOptions');
        if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });
}

// --- Import / Export ---
function exportProject() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.project));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const safeName = state.project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    downloadAnchorNode.setAttribute("download", `${safeName}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
            if (json.title && Array.isArray(json.items)) {
                const id = crypto.randomUUID();
                const newP = { id: id, title: json.title + " (Imported)", items: json.items, settings: json.settings || { cols: 3 }, updated: Date.now() };
                await chrome.storage.local.set({ [`proj_${id}`]: newP });
                const r = await chrome.storage.local.get(['projects']);
                const projects = r.projects || [];
                projects.push({ id, title: newP.title, count: newP.items.length, updated: Date.now() });
                await chrome.storage.local.set({ projects });
                switchProject(id);
                alert("Project imported successfully!");
            } else { alert("Invalid file format."); }
        } catch (err) { alert("Error parsing JSON file."); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// --- Chrome Storage ---
async function loadState() {
    const meta = await chrome.storage.local.get(['activeProjectId', 'projects']);
    let pid = meta.activeProjectId;
    let projects = meta.projects || [];

    if (!pid || !projects.find(p => p.id === pid)) {
        if (projects.length === 0) {
            const newP = { id: crypto.randomUUID(), title: "My List", items: [], settings: { cols: 3 }, updated: Date.now() };
            projects = [newP];
            await chrome.storage.local.set({ projects });
            await chrome.storage.local.set({ [`proj_${newP.id}`]: newP });
        }
        pid = projects[0].id;
        await chrome.storage.local.set({ activeProjectId: pid });
    }
    state.currentProjectId = pid;
    const data = await chrome.storage.local.get([`proj_${pid}`]);
    if (data[`proj_${pid}`]) {
        state.project = data[`proj_${pid}`];
        if (!state.project.settings) state.project.settings = { cols: 3 };
    }
    renderUI();
}

async function saveState() {
    const pid = state.currentProjectId;
    state.project.updated = Date.now();
    await chrome.storage.local.set({ [`proj_${pid}`]: state.project });
    const r = await chrome.storage.local.get(['projects']);
    let projects = r.projects || [];
    const idx = projects.findIndex(p => p.id === pid);
    const meta = { id: pid, title: state.project.title, count: state.project.items.length, updated: Date.now() };
    if (idx >= 0) projects[idx] = meta; else projects.push(meta);
    await chrome.storage.local.set({ projects });
}

// --- Inbox & Clipboard ---
async function checkInbox() {
    const r = await chrome.storage.local.get(['shoplist_inbox']);
    const inbox = r.shoplist_inbox || [];
    const btn = document.getElementById('btnInbox');
    if (inbox.length > 0) {
        btn.classList.remove('hidden');
        document.getElementById('inboxCount').innerText = inbox.length;
    } else {
        btn.classList.add('hidden');
    }
}

async function importInbox() {
    const r = await chrome.storage.local.get(['shoplist_inbox']);
    const inbox = r.shoplist_inbox || [];
    if (inbox.length === 0) return;
    commitHistory("Imported items");
    inbox.forEach(item => {
        item.id = Date.now() + Math.floor(Math.random()*10000);
        item.imageFit = item.imageFit || 'object-cover'; 
        state.project.items.push(item);
    });
    await chrome.storage.local.set({ shoplist_inbox: [] });
    saveState();
    renderUI();
    checkInbox();
}

function checkInternalClipboard() {
    const clip = JSON.parse(localStorage.getItem('shopTracker_clipboard') || '[]');
    const isFresh = localStorage.getItem('shopTracker_clipboard_fresh') === 'true';
    const btn = document.getElementById('btnInternalPaste');
    const count = document.getElementById('intCount');
    
    if (clip.length > 0) {
        btn.classList.remove('hidden');
        count.innerText = clip.length;
        if (isFresh) btn.className = "px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2 shadow-sm border border-blue-600";
        else btn.className = "px-3 py-2 text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition shadow-sm flex items-center gap-2";
    } else {
        btn.classList.add('hidden');
    }
}

function copySelected() {
    if (state.selectedIds.size === 0) return;
    const toCopy = state.project.items.filter(i => state.selectedIds.has(i.id));
    localStorage.setItem('shopTracker_clipboard', JSON.stringify(toCopy));
    localStorage.setItem('shopTracker_clipboard_fresh', 'true'); 
    checkInternalClipboard();
    toggleSelectionMode(false);
}

function cutSelected() {
    if (state.selectedIds.size === 0) return;
    const toCopy = state.project.items.filter(i => state.selectedIds.has(i.id));
    localStorage.setItem('shopTracker_clipboard', JSON.stringify(toCopy));
    localStorage.setItem('shopTracker_clipboard_fresh', 'true');
    checkInternalClipboard();
    commitHistory("Cut items");
    state.project.items = state.project.items.filter(i => !state.selectedIds.has(i.id));
    toggleSelectionMode(false);
    saveState();
    renderUI();
}

function pasteInternal() {
    const clip = JSON.parse(localStorage.getItem('shopTracker_clipboard') || '[]');
    if (clip.length === 0) return;
    commitHistory("Pasted items");
    clip.forEach(item => {
        const newItem = JSON.parse(JSON.stringify(item));
        newItem.id = Date.now() + Math.floor(Math.random() * 10000);
        state.project.items.push(newItem);
    });
    localStorage.setItem('shopTracker_clipboard_fresh', 'false');
    checkInternalClipboard();
    saveState();
    renderUI();
}

function pasteFromExtension(clearAfter) {
    importInbox(); 
}

// --- History ---
function commitHistory(action) {
    const snapshot = JSON.stringify(state.project);
    historyStack.push({ data: snapshot, action });
    if (historyStack.length > 50) historyStack.shift();
    futureStack.length = 0;
    updateHistoryButtons();
}
async function undo() {
    if (historyStack.length === 0) return;
    futureStack.push({ data: JSON.stringify(state.project), action: "Undo" });
    const prev = historyStack.pop();
    state.project = JSON.parse(prev.data);
    await saveState();
    renderUI();
    updateHistoryButtons();
}
async function redo() {
    if (futureStack.length === 0) return;
    historyStack.push({ data: JSON.stringify(state.project), action: "Redo" });
    const next = futureStack.pop();
    state.project = JSON.parse(next.data);
    await saveState();
    renderUI();
    updateHistoryButtons();
}
function updateHistoryButtons() {
    document.getElementById('btnUndo').disabled = historyStack.length === 0;
    document.getElementById('btnRedo').disabled = futureStack.length === 0;
}

// --- UI Actions ---
let pendingConfirmAction = null;
function showConfirm(title, message, action) {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
    pendingConfirmAction = action;
    document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    pendingConfirmAction = null;
}

function deleteOne(id) {
    showConfirm("Delete Item?", "Are you sure?", () => {
        commitHistory("Deleted item");
        state.project.items = state.project.items.filter(i => i.id !== id);
        saveState();
        renderUI();
    });
}

function deleteSelected() {
    if (state.selectedIds.size === 0) return;
    showConfirm("Delete Items?", `Delete ${state.selectedIds.size} items?`, () => {
        commitHistory("Deleted items");
        state.project.items = state.project.items.filter(i => !state.selectedIds.has(i.id));
        toggleSelectionMode(false);
        saveState();
        renderUI();
    });
}

function toggleSelectionMode(active) {
    state.selectionMode = active;
    if (!active) state.selectedIds.clear();
    renderUI();
}

function toggleSelectAll() {
    if (state.selectedIds.size === state.project.items.length) state.selectedIds.clear();
    else state.project.items.forEach(i => state.selectedIds.add(i.id));
    renderUI();
}

function toggleSelect(id) {
    if (state.selectedIds.has(id)) state.selectedIds.delete(id); else state.selectedIds.add(id);
    state.selectionMode = state.selectedIds.size > 0; 
    renderUI();
}

// --- Helper Functions ---
function togglePrices() { state.showPrices = !state.showPrices; renderUI(); }
function setGridSize(n) { 
    if(!state.project.settings) state.project.settings = {};
    state.project.settings.cols = n; 
    saveState(); 
    renderUI(); 
}
function editTitle() { document.getElementById('projectTitleDisplay').classList.add('hidden'); document.getElementById('titleEditContainer').classList.remove('hidden'); document.getElementById('projectTitleInput').focus(); }
function saveTitle() {
    const val = document.getElementById('projectTitleInput').value;
    if (val) { commitHistory("Renamed Project"); state.project.title = val; saveState(); renderUI(); }
    document.getElementById('projectTitleDisplay').classList.remove('hidden'); document.getElementById('titleEditContainer').classList.add('hidden');
}
function toggleViewMenu() { document.getElementById('viewMenuDropdown').classList.toggle('hidden'); }

// --- Projects ---
function openProjectsModal() {
    const list = document.getElementById('projectsList');
    chrome.storage.local.get(['projects'], (r) => {
        const projects = r.projects || [];
        list.innerHTML = projects.map(p => `
            <li class="p-4 border-b flex justify-between items-center hover:bg-slate-50 cursor-pointer" data-id="${p.id}">
                <div><div class="font-bold ${p.id === state.currentProjectId ? 'text-blue-600' : 'text-slate-700'}">${p.title}</div><div class="text-xs text-slate-500">${p.count} items</div></div>
                ${projects.length > 1 ? `<button class="js-delete-project text-slate-400 hover:text-red-600 p-2 transition rounded-full hover:bg-slate-100" data-id="${p.id}"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </li>
        `).join('');
        document.getElementById('projectsModal').classList.remove('hidden');
    });
}
async function switchProject(id) {
    state.currentProjectId = id;
    const r = await chrome.storage.local.get([`proj_${id}`]);
    if (r[`proj_${id}`]) state.project = r[`proj_${id}`];
    await chrome.storage.local.set({ activeProjectId: id });
    document.getElementById('projectsModal').classList.add('hidden');
    renderUI();
}
async function createNewProject() {
    const id = crypto.randomUUID();
    const newP = { id, title: "New Project", items: [], settings: {cols:3}, updated: Date.now() };
    await chrome.storage.local.set({ [`proj_${id}`]: newP });
    const r = await chrome.storage.local.get(['projects']);
    const projects = r.projects || [];
    projects.push({ id, title: "New Project", count: 0, updated: Date.now() });
    await chrome.storage.local.set({ projects });
    switchProject(id);
}
async function deleteProject(id) {
    showConfirm("Delete Project?", "Cannot undo.", async () => {
        await chrome.storage.local.remove([`proj_${id}`]);
        const r = await chrome.storage.local.get(['projects']);
        const projects = r.projects.filter(p => p.id !== id);
        await chrome.storage.local.set({ projects });
        if (state.currentProjectId === id) {
            if (projects.length > 0) switchProject(projects[0].id);
            else createNewProject();
        } else openProjectsModal();
    });
}

// --- Edit Modal ---
function startEdit(id) {
    const item = state.project.items.find(i => i.id === id);
    if(!item) return;
    document.getElementById('editId').value = id;
    document.getElementById('editTitle').value = item.title;
    document.getElementById('editPrice').value = item.price;
    document.getElementById('editFit').value = item.imageFit || 'object-cover'; 
    document.getElementById('editModal').classList.remove('hidden');
}
function saveEdit() {
    const id = parseInt(document.getElementById('editId').value);
    const item = state.project.items.find(i => i.id === id);
    if(item) {
        commitHistory("Edited Details");
        item.title = document.getElementById('editTitle').value;
        item.price = parseFloat(document.getElementById('editPrice').value) || 0;
        item.imageFit = document.getElementById('editFit').value;
        saveState();
        renderUI();
    }
    document.getElementById('editModal').classList.add('hidden');
}
function reloadItemWithScreenshotFromModal() {
    const id = parseInt(document.getElementById('editId').value);
    const item = state.project.items.find(i => i.id === id);
    if (item) {
        let scrapeUrl = item.url;
        if (scrapeUrl.includes('aliexpress.us')) scrapeUrl = scrapeUrl.replace('aliexpress.us', 'aliexpress.com');
        item.image = `https://image.thum.io/get/width/1024/crop/800/noanimate/${encodeURIComponent(scrapeUrl)}`;
        item.imageFit = 'object-cover';
        saveState();
        renderUI();
        document.getElementById('editModal').classList.add('hidden');
    }
}

function downloadPDF() {
    // Open print page in new tab which will handle the PDF generation
    chrome.tabs.create({ url: 'print.html' });
}

// --- Rendering ---
function renderUI() {
    const headerStd = document.getElementById('headerStandard');
    const headerSel = document.getElementById('headerSelection');
    const btnEnter = document.getElementById('btnEnterSelect');
    
    // Always show View Options
    const headerControls = document.getElementById('headerControls');

    if (state.selectionMode) {
        headerStd.classList.add('hidden');
        headerSel.classList.remove('hidden');
        btnEnter.classList.add('hidden');
        
        document.getElementById('selectCount').innerText = state.selectedIds.size;
        const isAllSelected = state.project.items.length > 0 && state.selectedIds.size === state.project.items.length;
        
        const icon = document.getElementById('iconSelectAll');
        const text = document.getElementById('textSelectAll');
        if (isAllSelected) {
            icon.className = "fa-regular fa-square";
            text.innerText = "Deselect All";
        } else {
            icon.className = "fa-regular fa-square-check";
            text.innerText = "Select All";
        }
    } else {
        headerStd.classList.remove('hidden');
        headerSel.classList.add('hidden');
        btnEnter.classList.remove('hidden');
    }

    if (headerControls) headerControls.classList.remove('hidden');

    document.getElementById('projectTitleDisplay').innerText = state.project.items.length > 0 ? state.project.title : state.project.title + " (Empty)";
    document.getElementById('projectTitleInput').value = state.project.title;
    document.getElementById('itemCount').innerText = state.project.items.length;
    document.getElementById('checkPrice').style.opacity = state.showPrices ? '1' : '0';

    const grid = document.getElementById('grid');
    
    if (grid._sortable) {
        grid._sortable.destroy();
        grid._sortable = null;
    }

    grid.className = 'grid gap-6 pb-20';
    const cols = state.project.settings?.cols || 3;
    let colClass = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    if (cols === 1) colClass = 'grid-cols-1';
    if (cols === 2) colClass = 'grid-cols-1 md:grid-cols-2';
    if (cols === 4) colClass = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
    if (cols === 6) colClass = 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6';
    grid.className = `grid gap-6 pb-20 ${colClass}`;

    grid.innerHTML = '';
    if (state.project.items.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
        return;
    } else {
        document.getElementById('emptyState').classList.add('hidden');
    }

    state.project.items.forEach(item => {
        const el = document.createElement('div');
        const isSelected = state.selectedIds.has(item.id);
        const borderClass = isSelected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-slate-200 hover:shadow-md';
        
        el.className = `item-card bg-white rounded-xl shadow-sm border transition group relative flex flex-col overflow-hidden ${borderClass}`;
        el.dataset.id = item.id;

        // Domain Badge Logic
        let domain = "Link";
        if(item.url.includes("amazon")) domain = "Amazon";
        else if(item.url.includes("aliexpress")) domain = "AliExpress";
        else if(item.url.includes("ebay")) domain = "eBay";

        let fitClass = item.imageFit || 'object-cover';
        let imgHTML = `<div class="w-full h-60 bg-slate-100 flex items-center justify-center text-slate-300"><i class="fa-solid fa-image text-4xl"></i></div>`;
        if (item.image) imgHTML = `<img src="${item.image}" class="w-full h-60 ${fitClass} bg-white transition duration-500" onerror="this.onerror=null; this.src='https://placehold.co/400x300?text=No+Image'">`;
        
        const priceHTML = state.showPrices ? `<span class="text-xl font-bold text-emerald-600">$${parseFloat(item.price).toFixed(2)}</span>` : `<span></span>`;
        
        let checkboxHTML = '';
        if (state.selectionMode) {
            checkboxHTML = `
            <div class="js-select-item absolute top-2 left-2 z-20 cursor-pointer" data-id="${item.id}">
                <div class="w-6 h-6 rounded-full border-2 bg-white ${isSelected ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-300 text-transparent'} flex items-center justify-center shadow-sm">
                    <i class="fa-solid fa-check text-xs"></i>
                </div>
            </div>`;
        }
        
        let buttonsHTML = '';
        if (!state.selectionMode) {
            buttonsHTML = `
            <div class="flex gap-2">
                 <button class="js-edit-item text-slate-400 hover:text-blue-600 p-1" data-id="${item.id}"><i class="fa-solid fa-pen-to-square"></i></button>
                 <button class="js-delete-item text-slate-400 hover:text-red-600 p-1" data-id="${item.id}"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        }

        el.innerHTML = `
            ${checkboxHTML}
            <a href="${state.selectionMode ? 'javascript:void(0)' : item.url}" target="${state.selectionMode ? '' : '_blank'}" class="block relative">
                <span class="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10">${domain}</span>
                ${imgHTML}
            </a>
            <div class="p-4 flex flex-col flex-1">
                <div class="mb-2">
                    <a href="${item.url}" target="_blank" class="text-slate-800 font-semibold leading-tight hover:text-blue-600 line-clamp-2" title="${item.title}">${item.title}</a>
                </div>
                <div class="mt-auto flex items-center justify-between pt-3 border-t border-slate-100">
                    ${priceHTML}
                    ${buttonsHTML}
                </div>
            </div>
        `;
        grid.appendChild(el);
    });

    if (!state.selectionMode) {
        grid._sortable = new Sortable(grid, {
            animation: 150, ghostClass: 'sortable-ghost', delay: 100, delayOnTouchOnly: true,
            onEnd: (evt) => {
                commitHistory("Reordered items");
                const newOrder = [];
                grid.querySelectorAll('.item-card').forEach(card => {
                    newOrder.push(state.project.items.find(i => i.id === parseInt(card.dataset.id)));
                });
                state.project.items = newOrder;
                saveState();
            }
        });
    }
}