// --- 1. Site Detection & Logic Switch ---
const currentUrl = window.location.href;
const isTrackerSite = currentUrl.includes('theultimateabsol.github.io') || currentUrl.includes('127.0.0.1') || currentUrl.includes('localhost');

if (isTrackerSite) {
    initTrackerIntegration();
} else {
    initScraper();
    // Run again after delay for dynamic SPAs like AliExpress
    setTimeout(initScraper, 2500);
}

// --- 2. Scraper Logic ---

function initScraper() {
    if (document.getElementById('shoplist-clipper-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'shoplist-clipper-btn';
    btn.innerHTML = '<span>+</span> Save Item';
    btn.title = "Save this item to ShopList";
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>...</span> Saving';
        btn.style.background = '#64748b'; // gray

        const product = scrapeProductData();
        
        if (!product || !product.title) {
            console.warn("ShopList Clipper: Scraping failed", product);
            btn.innerHTML = '<span>❌</span> Error';
            btn.style.background = '#ef4444';
            setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ''; }, 2000);
            return;
        }

        // Save to Chrome Storage
        try {
            const result = await chrome.storage.local.get(['shoplist_items']);
            const items = result.shoplist_items || [];
            
            if (!items.some(i => i.url === product.url)) {
                items.push(product);
                await chrome.storage.local.set({ shoplist_items: items });
                btn.innerHTML = '<span>✓</span> Saved!';
                btn.style.background = '#10b981';
            } else {
                btn.innerHTML = '<span>!</span> Saved';
                btn.style.background = '#f59e0b';
            }
        } catch (e) {
            console.error(e);
            btn.innerHTML = '<span>❌</span> Failed';
            btn.style.background = '#ef4444';
        }

        setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ''; }, 3000);
    });
}

function scrapeProductData() {
    const url = window.location.href;
    let title = document.title;
    let price = 0;
    let image = "";

    try {
        // --- AliExpress Deep Scrape (JSON-LD & New Selectors) ---
        if (url.includes('aliexpress')) {
            // 1. Title & Image first (usually easy)
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) title = ogTitle.content.split('|')[0].trim();
            
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) image = ogImage.content;

            // 2. Price Strategy A: JSON-LD (Most reliable if present)
            const scripts = document.querySelectorAll('script');
            let foundJsonPrice = false;
            for(let s of scripts) {
                if(s.type === 'application/ld+json') {
                    try {
                        const json = JSON.parse(s.innerText);
                        if(json.offers) {
                            const offer = Array.isArray(json.offers) ? json.offers[0] : json.offers;
                            if(offer.price) { price = parseFloat(offer.price); foundJsonPrice = true; }
                            else if (offer.lowPrice) { price = parseFloat(offer.lowPrice); foundJsonPrice = true; }
                        }
                    } catch(e) {}
                }
                if(foundJsonPrice) break;
            }

            // 3. Price Strategy B: New Class Selectors (User Requested)
            // Looks for "price--current" or "product-price-current" partials
            if (!foundJsonPrice) {
                const priceElem = document.querySelector('[class*="price--current"], [class*="product-price-current"], [class*="price-default--current"]');
                if (priceElem) {
                     // Inner text might be "$4.47" or "US $4.47"
                     // We strip everything non-numeric/decimal
                     price = parsePrice(priceElem.innerText);
                }
            }
        } 
        
        // --- Amazon ---
        else if (url.includes('amazon')) {
            title = document.getElementById('productTitle')?.innerText.trim() || title;
            const priceElem = document.querySelector('.a-price .a-offscreen') || 
                              document.querySelector('#price_inside_buybox') ||
                              document.querySelector('.apexPriceToPay span');
            if (priceElem) price = parsePrice(priceElem.innerText);
            const imgElem = document.getElementById('landingImage') || document.querySelector('#imgTagWrapperId img');
            if (imgElem) image = imgElem.src;
        } 
        
        // --- eBay ---
        else if (url.includes('ebay')) {
            const titleElem = document.querySelector('.x-item-title__mainTitle') || document.querySelector('#itemTitle');
            if (titleElem) title = titleElem.innerText.replace('Details about', '').trim();
            const priceElem = document.querySelector('.x-price-primary') || document.querySelector('.prcIsum');
            if (priceElem) price = parsePrice(priceElem.innerText);
            const imgElem = document.querySelector('.ux-image-carousel-item img') || document.querySelector('#icImg');
            if (imgElem) image = imgElem.src;
        }
    } catch (e) {
        console.warn("Scraping partial failure", e);
    }

    return {
        id: Date.now(),
        url: cleanUrl(url),
        title: title || "Saved Item",
        price: price,
        image: image,
        imageFit: 'object-contain'
    };
}

function parsePrice(str) {
    if (!str) return 0;
    // Matches numbers like 10.99, 1,200.50
    const match = str.match(/(\d[\d,\.]*)/);
    if (match) return parseFloat(match[0].replace(/,/g, ''));
    return 0;
}

function cleanUrl(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('aliexpress')) return u.origin + u.pathname.replace(/.html.*/, '.html');
        return u.origin + u.pathname; 
    } catch (e) { return url; }
}

// --- 3. Tracker Website Integration ---

function initTrackerIntegration() {
    // 1. Listen for "CHECK_STATUS" request from the website
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'SHOPLIST_CHECK_EXTENSION') {
            // Check storage
            const result = await chrome.storage.local.get(['shoplist_items']);
            const items = result.shoplist_items || [];
            
            // Reply to website saying "I am here and I have X items"
            window.postMessage({
                type: 'SHOPLIST_EXTENSION_STATUS',
                installed: true,
                itemCount: items.length
            }, '*');
        }
    });

    // 2. Listen for "PASTE" command
    window.addEventListener('SHOPLIST_REQUEST_PASTE', async (e) => {
        const { clearAfter } = e.detail || {};
        const result = await chrome.storage.local.get(['shoplist_items']);
        const items = result.shoplist_items || [];

        window.postMessage({ type: 'SHOPLIST_DATA_RESPONSE', items: items }, '*');

        if (clearAfter) {
            await chrome.storage.local.set({ shoplist_items: [] });
            // Send updated status (0 items)
            window.postMessage({ type: 'SHOPLIST_EXTENSION_STATUS', installed: true, itemCount: 0 }, '*');
        }
    });
}