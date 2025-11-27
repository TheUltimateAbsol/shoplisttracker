document.addEventListener('DOMContentLoaded', async () => {
    const list = document.getElementById('list');
    const countEl = document.getElementById('count');
    const clearBtn = document.getElementById('clearBtn');

    // Simple SVG for the delete X
    const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;

    async function render() {
        const result = await chrome.storage.local.get(['shoplist_items']);
        const items = result.shoplist_items || [];
        countEl.innerText = items.length;
        list.innerHTML = '';

        if (items.length === 0) {
            list.innerHTML = '<div class="empty-state">No items clipped yet.<br>Browse Amazon, eBay, or AliExpress to add items.</div>';
            // Disable clear button visually
            clearBtn.style.opacity = '0.5';
            clearBtn.style.pointerEvents = 'none';
            return;
        }
        
        clearBtn.style.opacity = '1';
        clearBtn.style.pointerEvents = 'auto';

        items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <img src="${item.image || 'https://placehold.co/40?text=?'}" onerror="this.src='https://placehold.co/40?text=?'">
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
                const btnEl = e.target.closest('.delete-btn'); // Handle SVG click
                const idx = parseInt(btnEl.dataset.index);
                const newItems = items.filter((_, i) => i !== idx);
                await chrome.storage.local.set({ shoplist_items: newItems });
                render();
            });
        });
    }

    clearBtn.addEventListener('click', async () => {
        if(confirm("Clear all clipped items?")) {
            await chrome.storage.local.set({ shoplist_items: [] });
            render();
        }
    });

    render();
});