document.addEventListener('DOMContentLoaded', async () => {
    const list = document.getElementById('list');
    const countEl = document.getElementById('count');
    const clearBtn = document.getElementById('clearBtn');

    async function render() {
        const result = await chrome.storage.local.get(['shoplist_items']);
        const items = result.shoplist_items || [];
        countEl.innerText = items.length;
        list.innerHTML = '';

        if (items.length === 0) {
            list.innerHTML = '<div class="empty-state">No items clipped yet.<br>Go to Amazon, eBay, or AliExpress to add items.</div>';
            return;
        }

        items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <img src="${item.image || 'https://placehold.co/40?text=?'}" onerror="this.src='https://placehold.co/40?text=?'">
                <div class="item-details">
                    <div class="item-title" title="${item.title}">${item.title}</div>
                    <div class="item-price">$${item.price}</div>
                </div>
                <button class="delete-btn" data-index="${index}">✕</button>
            `;
            list.appendChild(div);
        });

        // Add delete listeners
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idx = parseInt(e.target.dataset.index);
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