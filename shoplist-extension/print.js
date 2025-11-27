document.addEventListener('DOMContentLoaded', async () => {
    const titleEl = document.getElementById('print-title');
    const metaEl = document.getElementById('print-meta');
    const gridEl = document.getElementById('print-grid');
    const statusEl = document.getElementById('status');

    // 1. Load Data
    const meta = await chrome.storage.local.get(['activeProjectId']);
    const pid = meta.activeProjectId;
    if (!pid) return alert("No active project found.");

    const data = await chrome.storage.local.get([`proj_${pid}`]);
    const project = data[`proj_${pid}`];
    if (!project) return alert("Project data missing.");

    // 2. Render Header
    titleEl.innerText = project.title;
    metaEl.innerText = `${project.items.length} items`;

    // 3. Determine Layout Settings based on Columns
    const cols = project.settings?.cols || 3;
    
    // Configuration Map for "Compactness"
    // Updated: Increased heights (h) and text area sizes
    const layoutConfig = {
        1: { grid: 'grid-cols-1',  h: 'h-80', t: 'text-lg',  p: 'text-xl',  gap: 'gap-6' },
        2: { grid: 'grid-cols-2',  h: 'h-64', t: 'text-base', p: 'text-lg',  gap: 'gap-6' },
        3: { grid: 'grid-cols-3',  h: 'h-48', t: 'text-sm',   p: 'text-base', gap: 'gap-4' }, // Taller image for standard view
        4: { grid: 'grid-cols-4',  h: 'h-32', t: 'text-xs',   p: 'text-sm',   gap: 'gap-3' },
        6: { grid: 'grid-cols-6',  h: 'h-24', t: 'text-[10px]', p: 'text-xs', gap: 'gap-2' }
    };

    const config = layoutConfig[cols] || layoutConfig[3];

    // Apply Grid Class
    gridEl.className = `grid ${config.grid} ${config.gap}`;

    // 4. Render Items
    project.items.forEach(item => {
        // Container
        const card = document.createElement('a');
        card.href = item.url;
        card.target = "_blank"; 
        card.className = 'item-card block rounded-lg overflow-hidden shadow-sm hover:no-underline text-slate-800 relative flex flex-col border border-slate-200 bg-white';

        // Domain Badge Logic
        let domain = "Link";
        if(item.url.includes("amazon")) domain = "Amazon";
        else if(item.url.includes("aliexpress")) domain = "AliExpress";
        else if(item.url.includes("ebay")) domain = "eBay";

        // Image
        let imgHTML = `<div class="w-full ${config.h} bg-slate-50 flex items-center justify-center text-slate-300"><i class="fa-solid fa-image text-xl"></i></div>`;
        
        if (item.image) {
            const fit = item.imageFit || 'object-cover';
            // Use inline style for object-fit to ensure print engines respect it
            imgHTML = `<img src="${item.image}" class="w-full ${config.h} bg-white block" style="object-fit: ${fit.replace('object-', '')}">`;
        }
        
        const priceHTML = `<span class="font-bold text-emerald-600 ${config.p}">$${parseFloat(item.price).toFixed(2)}</span>`;

        card.innerHTML = `
            <div class="relative">
                <span class="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm z-10 font-sans">${domain}</span>
                ${imgHTML}
            </div>
            <div class="p-3 flex flex-col flex-1 border-t border-slate-100">
                <!-- Increased height from h-8 to h-16 and line-clamp from 2 to 3 -->
                <div class="font-semibold leading-snug mb-2 line-clamp-3 ${config.t} h-16 overflow-hidden text-ellipsis">
                    ${item.title}
                </div>
                <div class="mt-auto pt-2 border-t border-slate-50 flex justify-between items-center">
                    ${priceHTML}
                </div>
            </div>
        `;
        gridEl.appendChild(card);
    });

    // 5. Trigger Print
    setTimeout(() => {
        statusEl.style.display = 'none';
        document.title = project.title; 
        window.print();
    }, 1000);
});