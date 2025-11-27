document.addEventListener('DOMContentLoaded', async () => {
    const list = document.getElementById('list');
    const countEl = document.getElementById('count');
    const clearBtn = document.getElementById('clearBtn');
    const openManagerBtn = document.getElementById('openManagerBtn');

    // Simple SVG for the delete X
    const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>`;

    async function render() {
        const result = await chrome.storage.local.get(['shoplist_inbox']); // Changed from 'shoplist_items' to match content.js logic if you switched to 'inbox' terminology, but sticking to what content.js saves. 
        // Checking content.js from previous turn: it saves to 'shoplist_inbox'.
        // Wait, the content.js logic in turn 8 saved to 'shoplist_inbox'. 
        // Let's ensure consistency. I will check for both or prefer 'shoplist_inbox' based on the last content.js update.
        
        // Actually, the last content.js used 'shoplist_inbox'.
        const inbox = result.shoplist_inbox || [];
        
        countEl.innerText = inbox.length;
        list.innerHTML = '';

        if (inbox.length === 0) {
            list.innerHTML = '<div class="empty-state">No items clipped yet.<br>Browse Amazon, eBay, or AliExpress to add items.</div>';
            clearBtn.style.opacity = '0.5';
            clearBtn.style.pointerEvents = 'none';
            return;
        }
        
        clearBtn.style.opacity = '1';
        clearBtn.style.pointerEvents = 'auto';

        inbox.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <img src="${item.image || ''}" onerror="this.style.display='none'">
                <div class="item-details">
                    <div class="item-title" title="${item.title}">${item.title}</div>
                    <div class="item-price">$${item.price}</div>
                </div>
                <button class="delete-btn" data-index="${index}" title="Remove">${deleteIcon}</button>
            `;
            list.appendChild(div);
        });

        // Add delete listeners
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const btnEl = e.target.closest('.delete-btn');
                const idx = parseInt(btnEl.dataset.index);
                const newInbox = inbox.filter((_, i) => i !== idx);
                await chrome.storage.local.set({ shoplist_inbox: newInbox });
                render();
            });
        });
    }

    // Clear Action
    clearBtn.addEventListener('click', async () => {
        if(confirm("Clear all clipped items?")) {
            await chrome.storage.local.set({ shoplist_inbox: [] });
            render();
        }
    });

    // Open Manager Action
    openManagerBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'manager.html' });
    });

    render();
});