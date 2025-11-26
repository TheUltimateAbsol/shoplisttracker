// --- 1. Site Detection & Logic Switch ---
const currentUrl = window.location.href;
// Detect if we are on the Tracker App or a Shopping Site
const isTrackerSite = currentUrl.includes('theultimateabsol.github.io') || currentUrl.includes('127.0.0.1') || currentUrl.includes('localhost');

if (isTrackerSite) {
    initTrackerIntegration();
} else {
    // Run immediately
    initScraper();
    // And run again after a delay to handle dynamic page rewrites (common on AliExpress)
    setTimeout(initScraper, 2000);
}

// --- 2. Scraper Logic (Amazon/eBay/Ali) ---

function initScraper() {
    // Prevent duplicate buttons
    if (document.getElementById('shoplist-clipper-btn')) return;

    // Create and inject the floating button
    const btn = document.createElement('button');
    btn.id = 'shoplist-clipper-btn';
    btn.innerHTML = '<span style="font-size:20px; margin-right:5px;">+</span> Save Item';
    btn.title = "Save this item to ShopList";
    
    // Append to body
    document.body.appendChild(btn);
    console.log("ShopList Clipper: Button injected.");

    btn.addEventListener('click', async () => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>...</span> Saving';
        btn.style.backgroundColor = '#64748b'; // Gray loading state

        const product = scrapeProductData();
        
        if (!product || !product.title) {
            console.warn("ShopList Clipper: Could not scrape data", product);
            btn.innerHTML = '<span style="font-size:18px">❌</span> Error';
            btn.style.backgroundColor = '#ef4444';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = ''; // Reset to CSS default
            }, 2000);
            return;
        }

        // Save to Chrome Storage
        try {
            const result = await chrome.storage.local.get(['shoplist_items']);
            const items = result.shoplist_items || [];
            
            // Prevent duplicates based on URL
            if (!items.some(i => i.url === product.url)) {
                items.push(product);
                await chrome.storage.local.set({ shoplist_items: items });
                
                btn.innerHTML = '<span style="font-size:18px">✓</span> Saved!';
                btn.style.backgroundColor = '#10b981'; // Green success
            } else {
                btn.innerHTML = '<span style="font-size:18px">!</span> Already Saved';
                btn.style.backgroundColor = '#f59e0b'; // Orange warning
            }
        } catch (e) {
            console.error("ShopList Clipper Storage Error:", e);
            btn.innerHTML = '<span>❌</span> Failed';
            btn.style.backgroundColor = '#ef4444';
        }

        // Reset Button after 3 seconds
        setTimeout(() => {
            btn.innerHTML = '<span style="font-size:20px; margin-right:5px;">+</span> Save Item';
            btn.style.backgroundColor = ''; // Reset to CSS default
        }, 3000);
    });
}

function scrapeProductData() {
    const url = window.location.href;
    let title = document.title;
    let price = 0;
    let image = "";

    try {
        if (url.includes('amazon')) {
            title = document.getElementById('productTitle')?.innerText.trim() || title;
            // Try multiple price selectors
            const priceElem = document.querySelector('.a-price .a-offscreen') || 
                              document.querySelector('#price_inside_buybox') ||
                              document.querySelector('.apexPriceToPay span');
            if (priceElem) price = parsePrice(priceElem.innerText);
            
            // Amazon image
            const imgElem = document.getElementById('landingImage') || document.querySelector('#imgTagWrapperId img');
            if (imgElem) image = imgElem.src;

        } else if (url.includes('ebay')) {
            // eBay Scraping
            const titleElem = document.querySelector('.x-item-title__mainTitle') || document.querySelector('#itemTitle');
            if (titleElem) title = titleElem.innerText.replace('Details about', '').trim();
            
            const priceElem = document.querySelector('.x-price-primary') || document.querySelector('.prcIsum');
            if (priceElem) price = parsePrice(priceElem.innerText);

            const imgElem = document.querySelector('.ux-image-carousel-item img') || document.querySelector('#icImg');
            if (imgElem) image = imgElem.src;

        } else if (url.includes('aliexpress')) {
            // AliExpress Scraping
            // 1. Title
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) title = ogTitle.content.split('|')[0].trim();
            else {
                const h1 = document.querySelector('h1');
                if(h1) title = h1.innerText;
            }

            // 2. Image
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) image = ogImage.content;
            
            // 3. Price (Very tricky on Ali, relies on Schema or meta)
            const priceMeta = document.querySelector('meta[property="product:price:amount"]');
            if (priceMeta) {
                price = parseFloat(priceMeta.content);
            } else {
                // Try standard price class pattern
                const priceDiv = document.querySelector('.product-price-current');
                if(priceDiv) price = parsePrice(priceDiv.innerText);
            }
        }
    } catch (e) {
        console.warn("Scraping partial failure", e);
    }

    return {
        id: Date.now(), // Temp ID for extension storage
        url: cleanUrl(url),
        title: title,
        price: price,
        image: image,
        imageFit: 'object-contain' // Default fit
    };
}

function parsePrice(str) {
    if (!str) return 0;
    // Matches numbers like 10.99, 1,200.50
    const match = str.match(/(\d[\d,\.]*)/);
    if (match) {
        return parseFloat(match[0].replace(/,/g, ''));
    }
    return 0;
}

function cleanUrl(url) {
    try {
        const u = new URL(url);
        // Specific cleanups
        if (u.hostname.includes('amazon')) return u.origin + u.pathname;
        if (u.hostname.includes('ebay')) return u.origin + u.pathname;
        if (u.hostname.includes('aliexpress')) return u.origin + u.pathname.replace(/.html.*/, '.html');
        return u.origin + u.pathname; 
    } catch (e) { return url; }
}


// --- 3. Tracker Website Integration ---

function initTrackerIntegration() {
    console.log("ShopList Clipper: Connected to Tracker App");
    
    // A. Signal Presence
    document.body.setAttribute('data-extension-installed', 'true');
    
    // Dispatch event so React/Vanilla JS knows immediately
    window.dispatchEvent(new CustomEvent('SHOPLIST_EXTENSION_LOADED'));

    // B. Listen for "Paste" Request from Website
    window.addEventListener('SHOPLIST_REQUEST_PASTE', async (e) => {
        const { clearAfter } = e.detail || {};
        
        const result = await chrome.storage.local.get(['shoplist_items']);
        const items = result.shoplist_items || [];

        // Send data back to page
        window.postMessage({
            type: 'SHOPLIST_DATA_RESPONSE',
            items: items
        }, '*');

        // Clear if requested
        if (clearAfter) {
            await chrome.storage.local.set({ shoplist_items: [] });
        }
    });
}